// src/app/api/supervisor/ai-aggregate.js
// Logika agregasi BERSAMA untuk AI supervisor: dipakai ai-tools.js (Fase D)
// dan konsisten dengan deterministic engine di supervisor/page.js.
// Satu-satunya sumber kebenaran rumus: file ini.

export const PANEL_LABEL = {
  ecobag: "Ecobag", member: "Member", sales: "Sales Ratio",
  pwp: "PWP", shortage: "Shortage", sp: "SP/BA", sakit: "Sakit/Izin", pos: "POS",
};
export const PANEL_SATUAN = {
  ecobag: "pcs", member: "member", sales: "%",
  pwp: "pcs", shortage: "", sp: "kasus", sakit: "kali", pos: "transaksi",
};
export const PANELS = Object.keys(PANEL_LABEL);

const MONTHS_ID = {
  januari: "01", februari: "02", maret: "03", april: "04", mei: "05", juni: "06",
  juli: "07", agustus: "08", september: "09", sep: "09", oktober: "10", okt: "10",
  november: "11", nov: "11", desember: "12", des: "12",
};

export function normName(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function normPeriode(v) {
  if (!v) return "";
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
  const s = String(v).trim();
  let m = s.match(/^(20\d\d)[-\/](0[1-9]|1[0-2])/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.toLowerCase().match(/^([a-z]+)\s+(20\d\d)$/);
  if (m && MONTHS_ID[m[1]]) return `${m[2]}-${MONTHS_ID[m[1]]}`;
  m = s.match(/^(0[1-9]|1[0-2])[-\/](20\d\d)$/);
  if (m) return `${m[2]}-${m[1]}`;
  return s;
}

export function isValidPeriode(p) {
  return /^(20\d\d)-(0[1-9]|1[0-2])$/.test(String(p || ""));
}

// Bangun peta direktori dari rows tabel nik: { set, canonical }
export function buildDirektori(nikRows) {
  const set = new Set();
  const canonical = {};
  (nikRows || []).forEach(k => {
    if (!k.nama) return;
    const n = normName(k.nama);
    set.add(n);
    canonical[n] = k.nama;
  });
  return { set, canonical };
}

export function resolveAiNama(canonical, raw) {
  return canonical[normName(raw)] || null;
}

// Agregasi semua summary dari rows mentah. Mirror 1:1 logika frontend.
// rows: { nik, shortage, ecobag, member, salesMember, salesHourly, sakit, sp, pwp }
// return { summaries..., barisKotorTerbuang }
export function aggregateAll(rows, direktori) {
  const { set: direktoriSet, canonical } = direktori;
  const inDirektori = (n) => direktoriSet.has(n);
  const resolve = (raw) => canonical[normName(raw)] || null;
  let barisKotorTerbuang = 0;

  const shortageSummary = {};
  (rows.shortage || []).forEach(r => {
    const nama = normName(r.nama || r.nama_1 || "");
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const periode = normPeriode(r.periode);
    const key = nama + "|" + periode;
    if (!shortageSummary[key]) shortageSummary[key] = { nama: resolve(nama), periode, frekuensi: 0, totalShort: 0, totalOver: 0 };
    shortageSummary[key].frekuensi++;
    const pagi = parseInt(r.short_over_shift_pagi) || 0;
    const siang = parseInt(r.short_over_shift_siang) || 0;
    if (pagi < 0) shortageSummary[key].totalShort += pagi; if (pagi > 0) shortageSummary[key].totalOver += pagi;
    if (siang < 0) shortageSummary[key].totalShort += siang; if (siang > 0) shortageSummary[key].totalOver += siang;
  });

  const memberSummary = {};
  (rows.member || []).forEach(r => {
    const nama = normName(r.nama);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const bulan = normPeriode(r.bulan);
    const key = nama + "|" + bulan;
    if (!memberSummary[key]) memberSummary[key] = { nama: resolve(nama), bulan, total: 0 };
    memberSummary[key].total += parseInt(r.qty) || 0;
  });

  const ecobagSummary = {};
  (rows.ecobag || []).forEach(r => {
    const nama = normName(r.staff_name);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const bulan = normPeriode(r.year_month || r.month);
    const key = nama + "|" + bulan;
    if (!ecobagSummary[key]) ecobagSummary[key] = { nama: resolve(nama), bulan, total: 0 };
    ecobagSummary[key].total += parseInt(r.total) || 0;
  });

  const salesSummary = {};
  (rows.salesMember || []).forEach(r => {
    const nama = normName(r.nama);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const periode = normPeriode(r.periode);
    const key = nama + "|" + periode;
    if (!salesSummary[key]) salesSummary[key] = { nama: resolve(nama), periode, totalMemberSales: 0, totalHourlySales: 0 };
    salesSummary[key].totalMemberSales += parseFloat(r.total_sales) || 0;
  });
  (rows.salesHourly || []).forEach(r => {
    const nama = normName(r.nama);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const periode = normPeriode(r.periode);
    const key = nama + "|" + periode;
    if (!salesSummary[key]) salesSummary[key] = { nama: resolve(nama), periode, totalMemberSales: 0, totalHourlySales: 0 };
    salesSummary[key].totalHourlySales += parseFloat(r.total_sales) || 0;
  });
  Object.values(salesSummary).forEach(g => {
    g.ratio = g.totalHourlySales > 0 ? Math.round((g.totalMemberSales / g.totalHourlySales) * 1000) / 10 : 0;
    g.selisih = Math.round((g.totalHourlySales - g.totalMemberSales) * 100) / 100;
  });

  const pwpSummary = {};
  (rows.pwp || []).forEach(r => {
    if (!r.nama) return;
    const nama = normName(r.nama);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const periode = normPeriode(r.periode);
    const key = nama + "|" + periode;
    if (!pwpSummary[key]) pwpSummary[key] = { nama: resolve(nama), periode, total: 0 };
    pwpSummary[key].total += parseInt(r.qty) || 0;
  });

  const posSummary = {};
  (rows.salesHourly || []).forEach(r => {
    if (!r.nama) return;
    const nama = normName(r.nama);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const pos = r.pos || "-";
    const periode = normPeriode(r.periode);
    const key = nama + "|" + pos;
    if (!posSummary[key]) posSummary[key] = { nama: resolve(nama), pos, periode, count: 0, sales: 0 };
    posSummary[key].count += parseInt(r.count_transaksi) || 0;
    posSummary[key].sales += parseFloat(r.total_sales) || 0;
  });

  const spDetailMap = {};
  (rows.sp || []).forEach(r => {
    if (!r.nama) return;
    const nama = normName(r.nama);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const bulan = normPeriode(r.bulan);
    const key = nama + "|" + bulan + "|" + ((r.jenis_pelanggaran || "Lainnya").trim() || "Lainnya");
    if (!spDetailMap[key]) spDetailMap[key] = { nama: resolve(nama), bulan, jenis: ((r.jenis_pelanggaran || "Lainnya").trim() || "Lainnya"), jumlah: 0 };
    spDetailMap[key].jumlah++;
  });

  const sakitDetailMap = {};
  (rows.sakit || []).forEach(r => {
    if (!r.nama) return;
    const nama = normName(r.nama);
    if (!inDirektori(nama)) { barisKotorTerbuang++; return; }
    const bulan = normPeriode(r.bulan);
    const key = nama + "|" + bulan;
    if (!sakitDetailMap[key]) sakitDetailMap[key] = { nama: resolve(nama), bulan, jumlah: 0 };
    sakitDetailMap[key].jumlah++;
  });

  const salesTrend = {};
  Object.values(salesSummary).forEach(g => {
    if (!salesTrend[g.periode]) salesTrend[g.periode] = { periode: g.periode, totalMemberSales: 0, totalHourlySales: 0 };
    salesTrend[g.periode].totalMemberSales += g.totalMemberSales;
    salesTrend[g.periode].totalHourlySales += g.totalHourlySales;
  });
  Object.values(salesTrend).forEach(g => {
    g.ratio = g.totalHourlySales > 0 ? Math.round((g.totalMemberSales / g.totalHourlySales) * 1000) / 10 : 0;
    g.selisih = Math.round((g.totalHourlySales - g.totalMemberSales) * 100) / 100;
  });

  return { shortageSummary, memberSummary, ecobagSummary, salesSummary, pwpSummary, posSummary, spDetailMap, sakitDetailMap, salesTrend, barisKotorTerbuang };
}

// Nilai per karyawan untuk ranking. return { [namaCanonical]: nilai }
export function perKaryawan(panel, agg, periode = null) {
  const P = periode || null;
  const pick = (obj, key) => P ? Object.values(obj).filter(g => (g.bulan || g.periode) === P) : Object.values(obj);
  const sum = (arr, valFn) => {
    const m = {};
    arr.forEach(g => { m[g.nama] = (m[g.nama] || 0) + (valFn(g) || 0); });
    return m;
  };
  if (panel === "ecobag") return sum(pick(agg.ecobagSummary), g => g.total);
  if (panel === "member") return sum(pick(agg.memberSummary), g => g.total);
  if (panel === "pwp") return sum(pick(agg.pwpSummary), g => g.total);
  if (panel === "shortage") return sum(pick(agg.shortageSummary), g => Math.abs(g.totalShort || 0));
  if (panel === "sp") return sum(Object.values(agg.spDetailMap).filter(g => !P || g.bulan === P), g => g.jumlah);
  if (panel === "sakit") return sum(Object.values(agg.sakitDetailMap).filter(g => !P || g.bulan === P), g => g.jumlah);
  if (panel === "sales") {
    const m = {};
    pick(agg.salesSummary).forEach(g => {
      if (!m[g.nama]) m[g.nama] = { totalMemberSales: 0, totalHourlySales: 0 };
      m[g.nama].totalMemberSales += g.totalMemberSales;
      m[g.nama].totalHourlySales += g.totalHourlySales;
    });
    const out = {};
    Object.entries(m).forEach(([nama, v]) => {
      out[nama] = v.totalHourlySales > 0 ? Math.round((v.totalMemberSales / v.totalHourlySales) * 1000) / 10 : 0;
    });
    return out;
  }
  return {};
}

// Ranking eksplisit 1..N. desc=true -> tertinggi dulu.
export function rankRows(byEmp, desc = true, limit = 5) {
  const sorted = Object.entries(byEmp).sort((a, b) => desc ? b[1] - a[1] : a[1] - b[1]);
  return sorted.slice(0, limit).map(([nama, nilai], i) => ({ rank: i + 1, nama, nilai }));
}

// Tren per periode kronologis + arah + selisih.
export function trenPanel(panel, agg) {
  const perSums = {};
  const push = (k, v) => { perSums[k] = (perSums[k] || 0) + v; };
  if (panel === "ecobag") Object.values(agg.ecobagSummary).forEach(g => push(g.bulan, g.total));
  else if (panel === "member") Object.values(agg.memberSummary).forEach(g => push(g.bulan, g.total));
  else if (panel === "pwp") Object.values(agg.pwpSummary).forEach(g => push(g.periode, g.total));
  else if (panel === "sales") Object.values(agg.salesTrend).forEach(g => push(g.periode, g.totalMemberSales));
  else if (panel === "shortage") Object.values(agg.shortageSummary).forEach(g => push(g.periode, Math.abs(g.totalShort || 0)));
  else if (panel === "sp") Object.values(agg.spDetailMap).forEach(g => push(g.bulan, g.jumlah));
  else if (panel === "sakit") Object.values(agg.sakitDetailMap).forEach(g => push(g.bulan, g.jumlah));
  else return [];
  const rows = Object.entries(perSums).sort((a, b) => a[0].localeCompare(b[0])).map(([periode, nilai]) => ({ periode, nilai }));
  if (rows.length === 0) return rows;
  const vals = rows.map(r => r.nilai);
  const delta = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0;
  return { rows, arahTren: delta > 0 ? "naik" : delta < 0 ? "turun" : "stabil", selisih: delta };
}

// Detail 1 karyawan semua panel (periode opsional).
export function detailKaryawan(namaCanonical, agg, periode = null) {
  const P = periode || null;
  const match = (g) => g.nama === namaCanonical && (!P || (g.bulan || g.periode) === P);
  const tot = (arr, fn) => arr.filter(match).reduce((s, g) => s + (fn(g) || 0), 0);
  const salesArr = Object.values(agg.salesSummary).filter(match).sort((a, b) => (b.periode || "").localeCompare(a.periode || ""));
  const s0 = salesArr[0] || null;
  return {
    nama: namaCanonical, periode: P || "semua",
    member: tot(Object.values(agg.memberSummary), g => g.total),
    ecobag: tot(Object.values(agg.ecobagSummary), g => g.total),
    pwp: tot(Object.values(agg.pwpSummary), g => g.total),
    shortageAbs: tot(Object.values(agg.shortageSummary), g => Math.abs(g.totalShort || 0)),
    sp: tot(Object.values(agg.spDetailMap), g => g.jumlah),
    sakit: tot(Object.values(agg.sakitDetailMap), g => g.jumlah),
    salesRatioTerakhir: s0 ? { periode: s0.periode, ratio: s0.ratio, memberSales: s0.totalMemberSales, hourlySales: s0.totalHourlySales } : null,
    pos: Object.values(agg.posSummary).filter(match),
  };
}

// Fuzzy match nama ke direktori. return { exact: canonical|null, candidates: [] }
export function matchNama(input, direktori) {
  const q = normName(input);
  if (!q) return { exact: null, candidates: [] };
  const names = [...direktori.set];
  const full = names.filter(n => q.includes(n) || n.includes(q));
  if (full.length === 1) return { exact: direktori.canonical[full[0]], candidates: [] };
  if (full.length > 1) return { exact: null, candidates: full.slice(0, 5).map(n => direktori.canonical[n]) };
  const tokens = q.toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 4);
  const partial = names.filter(n => n.toLowerCase().split(/\s+/).some(p => p.length >= 4 && tokens.includes(p))).slice(0, 5);
  if (partial.length === 1) return { exact: direktori.canonical[partial[0]], candidates: [] };
  return { exact: null, candidates: partial.map(n => direktori.canonical[n]) };
}

// Daftar periode YYYY-MM yang punya data, per panel.
export function daftarPeriode(agg) {
  const collect = (obj, key) => [...new Set(Object.values(obj).map(g => g[key]).filter(Boolean))].sort();
  return {
    member: collect(agg.memberSummary, "bulan"),
    ecobag: collect(agg.ecobagSummary, "bulan"),
    sales: collect(agg.salesSummary, "periode"),
    pwp: collect(agg.pwpSummary, "periode"),
    shortage: collect(agg.shortageSummary, "periode"),
    sp: collect(agg.spDetailMap, "bulan"),
    sakit: collect(agg.sakitDetailMap, "bulan"),
  };
}
