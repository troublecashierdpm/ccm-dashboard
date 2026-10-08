// src/app/api/supervisor/ai-tools.js
// Fase D: 4 tools read-only untuk AI agent supervisor.
// LLM WAJIB lewat tools ini — dilarang query tabel langsung.
// Guard: allowlist tabel, argumen tervalidasi enum/regex, cap 50 baris.
import { createClient } from '@supabase/supabase-js';
import {
  PANELS, PANEL_LABEL, PANEL_SATUAN,
  normName, normPeriode, isValidPeriode,
  buildDirektori, aggregateAll, perKaryawan, rankRows, trenPanel,
  detailKaryawan, matchNama, daftarPeriode,
} from './ai-aggregate';

const MAX_ROWS = 50;
const PAGE = 1000;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

async function fetchAll(supabase, table, select) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) throw new Error(`Gagal baca ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// Ambil semua tabel yang dibutuhkan tools SEKALIGUS (1x per request agen).
let _cache = null;
export async function loadDataset() {
  if (_cache) return _cache;
  const supabase = getSupabase();
  const [nik, shortage, ecobag, member, salesMember, salesHourly, sakit, sp, pwp] = await Promise.all([
    fetchAll(supabase, 'nik', 'nama'),
    fetchAll(supabase, 'shortage_per_day', 'nama,nama_1,periode,short_over_shift_pagi,short_over_shift_siang,tanggal,pos'),
    fetchAll(supabase, 'ecobag_per_day', 'staff_name,year_month,month,total,bag_la,bag_me,bag_sm'),
    fetchAll(supabase, 'member_per_day', 'nama,bulan,tanggal,qty'),
    fetchAll(supabase, 'sales_member', 'nama,periode,tanggal,total_sales,pos'),
    fetchAll(supabase, 'sales_hourly', 'nama,periode,tanggal,total_sales,count_transaksi,pos'),
    fetchAll(supabase, 'sakit_per_day', 'nama,bulan'),
    fetchAll(supabase, 'sp_ba_per_day', 'nama,bulan,jenis_pelanggaran'),
    fetchAll(supabase, 'pwp_kasir', 'nama,periode,tanggal,sku_produk,nama_barang,qty'),
  ]);
  const direktori = buildDirektori(nik);
  const agg = aggregateAll(
    { shortage, ecobag, member, salesMember, salesHourly, sakit, sp, pwp },
    direktori
  );
  _cache = { direktori, agg, barisKotorTerbuang: agg.barisKotorTerbuang };
  return _cache;
}

function validPanel(panel) {
  const p = String(panel || "").toLowerCase();
  if (!PANELS.includes(p)) throw new Error(`Panel tidak dikenal: ${panel}. Pilihan: ${PANELS.join(", ")}`);
  return p;
}

function validPeriode(periode) {
  if (periode === undefined || periode === null || periode === "") return null;
  if (!isValidPeriode(periode)) throw new Error(`Periode harus YYYY-MM, dapat: ${periode}`);
  return periode;
}

function validLimit(limit) {
  const n = limit === undefined || limit === null || limit === "" ? 5 : parseInt(limit, 10);
  if (isNaN(n) || n < 1 || n > 10) throw new Error(`Limit 1-10, dapat: ${limit}`);
  return n;
}

// TOOL 1: ranking per panel
export async function toolRanking({ panel, periode, arah, limit }) {
  const p = validPanel(panel);
  if (p === "pos") throw new Error("Ranking tidak berlaku untuk panel pos. Pakai detail_karyawan untuk melihat POS seseorang.");
  const P = validPeriode(periode);
  const desc = String(arah || "atas").toLowerCase() !== "bawah";
  const n = validLimit(limit);
  const { agg } = await loadDataset();
  const byEmp = perKaryawan(p, agg, P);
  const rows = rankRows(byEmp, desc, n).map(r => ({ ...r, satuan: PANEL_SATUAN[p] || "" }));
  return { panel: p, panelLabel: PANEL_LABEL[p], periode: P || "semua", arah: desc ? "tertinggi" : "terendah", top: rows, sumber: `Ranking ${PANEL_LABEL[p]}` };
}

// TOOL 2: tren per periode
export async function toolTren({ panel, dari, sampai }) {
  const p = validPanel(panel);
  const d = dari ? validPeriode(dari) : null;
  const s = sampai ? validPeriode(sampai) : null;
  const { agg } = await loadDataset();
  const t = trenPanel(p, agg);
  if (!t || !t.rows) return { panel: p, panelLabel: PANEL_LABEL[p], trenRows: [], arahTren: "stabil", selisih: 0, sumber: `Tren ${PANEL_LABEL[p]}` };
  let rows = t.rows;
  if (d) rows = rows.filter(r => r.periode >= d);
  if (s) rows = rows.filter(r => r.periode <= s);
  rows = rows.slice(0, MAX_ROWS).map(r => ({ ...r, satuan: PANEL_SATUAN[p] || "" }));
  const vals = rows.map(r => r.nilai);
  const delta = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0;
  return {
    panel: p, panelLabel: PANEL_LABEL[p], trenRows: rows,
    arahTren: delta > 0 ? "naik" : delta < 0 ? "turun" : "stabil", selisih: delta,
    sumber: p === "sales" ? "Tren Sales" : `Ranking ${PANEL_LABEL[p]}`,
  };
}

// TOOL 3: detail 1 karyawan
export async function toolDetailKaryawan({ nama, periode }) {
  if (!nama || !String(nama).trim()) throw new Error("Argumen nama wajib diisi.");
  const P = validPeriode(periode);
  const { direktori, agg } = await loadDataset();
  const m = matchNama(String(nama), direktori);
  if (!m.exact) {
    if (m.candidates.length > 0) return { klarifikasi: true, candidates: m.candidates, pesan: `Nama cocok dengan >1 karyawan, tanyakan klarifikasi.` };
    return { klarifikasi: false, tidakDitemukan: true, pesan: `Nama "${nama}" tidak ada di direktori.` };
  }
  const det = detailKaryawan(m.exact, agg, P);
  return { ...det, sumber: "Detail Karyawan" };
}

// TOOL 4: daftar periode
export async function toolDaftarPeriode() {
  const { agg } = await loadDataset();
  return { ...daftarPeriode(agg), sumber: "Daftar Periode" };
}

// Eksekutor generik: validasi nama tool + guard hasil.
export async function execTool(name, args = {}) {
  const a = args && typeof args === "object" ? args : {};
  let out;
  if (name === "ranking") out = await toolRanking(a);
  else if (name === "tren") out = await toolTren(a);
  else if (name === "detail_karyawan") out = await toolDetailKaryawan(a);
  else if (name === "daftar_periode") out = await toolDaftarPeriode();
  else throw new Error(`Tool tidak dikenal: ${name}`);
  return JSON.parse(JSON.stringify(out).slice(0, 8000));
}

// Deklarasi function untuk Gemini function calling.
export const TOOL_DECLARATIONS = [
  {
    name: "ranking",
    description: "Peringkat karyawan per panel. Wajib dipakai untuk pertanyaan tertinggi/terendah/siapa/ranking.",
    parameters: {
      type: "OBJECT",
      properties: {
        panel: { type: "STRING", description: "Salah satu: member, ecobag, sales, pwp, shortage, sp, sakit" },
        periode: { type: "STRING", description: "Format YYYY-MM, contoh 2026-09. Kosongkan untuk semua periode." },
        arah: { type: "STRING", description: "'atas' untuk tertinggi (default), 'bawah' untuk terendah." },
        limit: { type: "NUMBER", description: "Jumlah baris 1-10, default 5." },
      },
      required: ["panel"],
    },
  },
  {
    name: "tren",
    description: "Tren nilai per periode kronologis untuk satu panel.",
    parameters: {
      type: "OBJECT",
      properties: {
        panel: { type: "STRING", description: "Salah satu: member, ecobag, sales, pwp, shortage, sp, sakit" },
        dari: { type: "STRING", description: "Periode awal YYYY-MM, opsional." },
        sampai: { type: "STRING", description: "Periode akhir YYYY-MM, opsional." },
      },
      required: ["panel"],
    },
  },
  {
    name: "detail_karyawan",
    description: "Ringkasan semua panel untuk 1 karyawan. Pakai untuk pertanyaan tentang orang tertentu atau follow-up dia/nya.",
    parameters: {
      type: "OBJECT",
      properties: {
        nama: { type: "STRING", description: "Nama karyawan (boleh nama depan)." },
        periode: { type: "STRING", description: "Format YYYY-MM, opsional." },
      },
      required: ["nama"],
    },
  },
  {
    name: "daftar_periode",
    description: "Daftar periode YYYY-MM yang ada datanya per panel. Pakai saat periode yang ditanya kosong.",
    parameters: { type: "OBJECT", properties: {} },
  },
];
