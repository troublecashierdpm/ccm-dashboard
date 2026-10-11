// src/app/pic/AuditClinicForm.js
// Form Audit Clinic — item lengkap sesuai web app GAS lama.
// HQ: 16 item skor 0/0.5/1 + durasi MM:SS + qty.
// Assessment: Manners 10 (Grooming), SSM 54 (7 section), Delsusbak 44 (6 section),
// skor 0/0.5/1 + input durasi per blok + metadata component/section per item.
"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

const HQ_ITEMS = [
  "1. Greeting (Senyum, Sopan, dan Antusias, serta posisi tangan di dada).",
  "2. Menyebutkan Nama kasir (Nama Sendiri).",
  "3. Kontak mata & Body Language diperhatikan saat menyapa.",
  "4. Membungkuk ±15°",
  "5. Menanyakan Aeon Member aplikasi dan menyebutkan nama pelanggan yang terdapat dalam aplikasi member.",
  "6. Menunjukan sikap ramah & inisiatif membantu (seperti membantu mengangkat belanjaan customer ke meja kasir).",
  "7. Menginformasikan sebelum memulai scan.",
  "8. Melakukan proses scan dengan cepat dan fokus pada layar POS, serta memastikan kesesuaian item dan harga yang tertera pada layar POS.",
  "9. Menjawab pertanyaan dengan sopan & akurat.",
  "10. Menyebutkan total belanjaan serta menginformasikan jumlah (qty) item yang ditransaksikan.",
  "11. Menginformasikan promo yang sedang berlangsung (seperti promo PWP atau promo bank) dengan jelas, sopan, dan alami kepada customer.",
  "12. Menanyakan metode pembayaran dengan sopan kepada customer.",
  "13. Menerima uang/kartu dengan kedua tangan.",
  "14. Menyebutkan Nominal Kembalian.",
  "15. Memastikan kelengkapan Barang belanjaan dan menangani produk sesuai standar kehati-hatian.",
  "16. Closing dengan Terima Kasih, senyum tulus dan sikap Antusias.",
];

const MANNERS_ITEMS = [
  { component: "Professional Manners", section: "Grooming", item: "Berpenampilan rapi" },
  { component: "Professional Manners", section: "Grooming", item: "Rambut" },
  { component: "Professional Manners", section: "Grooming", item: "Baju" },
  { component: "Professional Manners", section: "Grooming", item: "Name Tag" },
  { component: "Professional Manners", section: "Grooming", item: "Masker" },
  { component: "Professional Manners", section: "Grooming", item: "Celana" },
  { component: "Professional Manners", section: "Grooming", item: "Sepatu" },
  { component: "Professional Manners", section: "Grooming", item: "Kuku" },
  { component: "Professional Manners", section: "Grooming", item: "Perhiasan" },
  { component: "Professional Manners", section: "Grooming", item: "Wajah" },
];

const SSM_ITEMS = [
  { component: "SSM Produk", section: "Kecepatan", item: "Durasi Mengetik", durasiSebelum: "mengetik" },
  { component: "SSM Produk", section: "Kecepatan", item: "Mengetik 3 Jari" },
  { component: "SSM Produk", section: "Kecepatan", item: "Fokus Produk" },
  { component: "SSM Produk", section: "Kecepatan", item: "Barcode Benar (Ketik)" },
  { component: "SSM Produk", section: "Kecepatan", item: "Jumlah Struk (Ketik)" },
  { component: "SSM Produk", section: "Kecepatan", item: "Durasi Scan", durasiSebelum: "scan" },
  { component: "SSM Produk", section: "Kecepatan", item: "Handling Barang" },
  { component: "SSM Produk", section: "Kecepatan", item: "Scanner Safety" },
  { component: "SSM Produk", section: "Kecepatan", item: "Barcode Benar (Scan)" },
  { component: "SSM Produk", section: "Kecepatan", item: "Jumlah Struk (Scan)" },
  { component: "SSM Produk", section: "Salam", item: "Senyum" },
  { component: "SSM Produk", section: "Salam", item: "Kontak Mata" },
  { component: "SSM Produk", section: "Salam", item: "Membungkuk" },
  { component: "SSM Produk", section: "Salam", item: "Tanya Member" },
  { component: "SSM Produk", section: "Salam", item: "Barcode Member" },
  { component: "SSM Produk", section: "Salam", item: "Kantong" },
  { component: "SSM Produk", section: "Salam", item: "Info Scan" },
  { component: "SSM Produk", section: "Akurasi", item: "Cek Barcode" },
  { component: "SSM Produk", section: "Akurasi", item: "Cari Barcode List" },
  { component: "SSM Produk", section: "Akurasi", item: "Lihat POS" },
  { component: "SSM Produk", section: "Akurasi", item: "Handling" },
  { component: "SSM Produk", section: "Akurasi", item: "Jumlah Benar" },
  { component: "SSM Produk", section: "Akurasi", item: "Barcode Benar" },
  { component: "SSM Produk", section: "Akurasi", item: "Barcode Diskon" },
  { component: "SSM Produk", section: "Akurasi", item: "Ketik Akurat" },
  { component: "SSM Produk", section: "Akurasi", item: "Kelompok Sejenis" },
  { component: "SSM Produk", section: "Akurasi", item: "Konfirmasi Total" },
  { component: "SSM Produk", section: "Pengepakan", item: "Pisah Food" },
  { component: "SSM Produk", section: "Pengepakan", item: "Dua Tangan" },
  { component: "SSM Produk", section: "Pengepakan", item: "Jangan Tindih" },
  { component: "SSM Produk", section: "Pengepakan", item: "Kertas Bungkus" },
  { component: "SSM Produk", section: "Pengepakan", item: "Plastik Roll" },
  { component: "SSM Produk", section: "Pengepakan", item: "Barang Panjang" },
  { component: "SSM Produk", section: "Pengepakan", item: "Mudah Bawa" },
  { component: "SSM Produk", section: "Pengepakan", item: "Sold Tape" },
  { component: "SSM Produk", section: "Pengepakan", item: "Free Ice" },
  { component: "SSM Produk", section: "Pengepakan", item: "Susun Rapi" },
  { component: "SSM Produk", section: "Pembayaran", item: "Sebut Total" },
  { component: "SSM Produk", section: "Pembayaran", item: "Tambah Barang" },
  { component: "SSM Produk", section: "Pembayaran", item: "Metode Bayar" },
  { component: "SSM Produk", section: "Pembayaran", item: "Terima Uang" },
  { component: "SSM Produk", section: "Pembayaran", item: "Konfirmasi Uang" },
  { component: "SSM Produk", section: "Pembayaran", item: "Input POS" },
  { component: "SSM Produk", section: "Akhir", item: "Konfirmasi Kembali" },
  { component: "SSM Produk", section: "Akhir", item: "Serah Kembali" },
  { component: "SSM Produk", section: "Akhir", item: "Serah Barang Struk" },
  { component: "SSM Produk", section: "Akhir", item: "Cek Barang" },
  { component: "SSM Produk", section: "Akhir", item: "Terima Kasih" },
  { component: "SSM Produk", section: "Akhir", item: "Senyum Tatap" },
  { component: "SSM Produk", section: "Akhir", item: "Vokal Kontak" },
  { component: "SSM Produk", section: "Total", item: "Durasi Standar", durasiSebelum: "total" },
  { component: "SSM Produk", section: "Total", item: "Ramah" },
  { component: "SSM Produk", section: "Total", item: "Barcode Akhir" },
  { component: "SSM Produk", section: "Total", item: "Jumlah Akhir" },
];

const DELSUSBAK_ITEMS = [
  { component: "Delsusbak Produk", section: "Kecepatan", item: "Durasi 20 Barang", durasiSebelum: "kecepatan" },
  { component: "Delsusbak Produk", section: "Kecepatan", item: "Hati-hati" },
  { component: "Delsusbak Produk", section: "Kecepatan", item: "Identifikasi Mika" },
  { component: "Delsusbak Produk", section: "Kecepatan", item: "Cari Keymap" },
  { component: "Delsusbak Produk", section: "Kecepatan", item: "Input Jumlah" },
  { component: "Delsusbak Produk", section: "Kecepatan", item: "Safety" },
  { component: "Delsusbak Produk", section: "Kecepatan", item: "Akurasi Struk" },
  { component: "Delsusbak Produk", section: "Salam", item: "Senyum" },
  { component: "Delsusbak Produk", section: "Salam", item: "Kontak Mata" },
  { component: "Delsusbak Produk", section: "Salam", item: "Membungkuk" },
  { component: "Delsusbak Produk", section: "Salam", item: "Tanya Member" },
  { component: "Delsusbak Produk", section: "Salam", item: "Scan Member" },
  { component: "Delsusbak Produk", section: "Salam", item: "Tanya Kantong" },
  { component: "Delsusbak Produk", section: "Salam", item: "Info Scan" },
  { component: "Delsusbak Produk", section: "Akurasi", item: "Hati-hati" },
  { component: "Delsusbak Produk", section: "Akurasi", item: "Identifikasi Cepat" },
  { component: "Delsusbak Produk", section: "Akurasi", item: "Keymap Cepat" },
  { component: "Delsusbak Produk", section: "Akurasi", item: "Jumlah Benar" },
  { component: "Delsusbak Produk", section: "Akurasi", item: "Info Total" },
  { component: "Delsusbak Produk", section: "Pengepakan", item: "Pisah Suhu" },
  { component: "Delsusbak Produk", section: "Pengepakan", item: "Sold Tape" },
  { component: "Delsusbak Produk", section: "Pengepakan", item: "Nampan Bersih" },
  { component: "Delsusbak Produk", section: "Pengepakan", item: "Jaga Roti" },
  { component: "Delsusbak Produk", section: "Pengepakan", item: "Pisah Rasa" },
  { component: "Delsusbak Produk", section: "Pengepakan", item: "Jaga Bentuk" },
  { component: "Delsusbak Produk", section: "Pengepakan", item: "Rapikan Alat" },
  { component: "Delsusbak Produk", section: "Pembayaran", item: "Sebut Total" },
  { component: "Delsusbak Produk", section: "Pembayaran", item: "Tanya Tambahan" },
  { component: "Delsusbak Produk", section: "Pembayaran", item: "Upselling" },
  { component: "Delsusbak Produk", section: "Pembayaran", item: "Tanya Metode" },
  { component: "Delsusbak Produk", section: "Pembayaran", item: "Terima & Hitung" },
  { component: "Delsusbak Produk", section: "Pembayaran", item: "Konfirmasi Uang" },
  { component: "Delsusbak Produk", section: "Pembayaran", item: "Input POS" },
  { component: "Delsusbak Produk", section: "Akhir", item: "Konfirmasi Kembali" },
  { component: "Delsusbak Produk", section: "Akhir", item: "Serah Kembali" },
  { component: "Delsusbak Produk", section: "Akhir", item: "Serah Barang Struk" },
  { component: "Delsusbak Produk", section: "Akhir", item: "Cek Barang" },
  { component: "Delsusbak Produk", section: "Akhir", item: "Terima Kasih" },
  { component: "Delsusbak Produk", section: "Akhir", item: "Senyum Tatap" },
  { component: "Delsusbak Produk", section: "Akhir", item: "Sikap Penutup" },
  { component: "Delsusbak Produk", section: "Total", item: "Durasi Standar", durasiSebelum: "total" },
  { component: "Delsusbak Produk", section: "Total", item: "Ramah" },
  { component: "Delsusbak Produk", section: "Total", item: "Akurasi Keymap" },
  { component: "Delsusbak Produk", section: "Total", item: "Akurasi Jumlah" },
];

const SCORE_OPTS = ["1", "0.5", "0"];

const DURASI_LABEL = {
  mengetik: "Input durasi mengetik",
  scan: "Input durasi scan",
  total: "Input durasi total transaksi",
  kecepatan: "Input durasi kecepatan delsusbak",
};

export default function AuditClinicForm({ evaluatorNama = "" }) {
  const [cashiers, setCashiers] = useState([]);
  const [loadingCashiers, setLoadingCashiers] = useState(true);
  const [obsType, setObsType] = useState("");
  const [selectedNama, setSelectedNama] = useState("");
  const [selectedNik, setSelectedNik] = useState("");
  const [evaluator, setEvaluator] = useState(evaluatorNama);
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [testType, setTestType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // HQ Inputs
  const [hqDuration, setHqDuration] = useState("");
  const [hqQty, setHqQty] = useState("");
  const [hqScores, setHqScores] = useState({});

  // Assessment Inputs: skor per "component|section|item", durasi per key blok
  const [assessmentScores, setAssessmentScores] = useState({});
  const [durations, setDurations] = useState({});

  useEffect(() => {
    setEvaluator(evaluatorNama);
  }, [evaluatorNama]);

  useEffect(() => {
    fetchCashiers();
  }, []);

  // Hanya kasir berstatus Kontrak / PPKK / Maganghub yang bisa diaudit
  const STATUS_AUDIT = ["KONTRAK", "PPKK", "MAGANGHUB"];

  async function fetchCashiers() {
    try {
      const { data } = await supabase.from("nik").select("nama, nik, level, status").order("nama");
      if (data) setCashiers(data.filter(c => STATUS_AUDIT.includes(String(c.status || "").trim().toUpperCase())));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCashiers(false);
    }
  }

  const handleNamaChange = (e) => {
    const name = e.target.value;
    setSelectedNama(name);
    const found = cashiers.find(c => c.nama === name);
    setSelectedNik(found ? found.nik || "" : "");
  };

  const scoreKey = (it) => `${it.component}|${it.section}|${it.item}`;

  const handleScoreChange = (key, val, isHq = false) => {
    if (isHq) setHqScores(prev => ({ ...prev, [key]: Number(val) }));
    else setAssessmentScores(prev => ({ ...prev, [key]: Number(val) }));
  };

  // Auto-format ketikan menjadi MM:SS agar tidak typo (mis. ketik 345 -> 03:45)
  const formatMmSs = (val) => {
    let digits = String(val || "").replace(/\D/g, "").slice(0, 4);
    if (digits.length === 0) return "";
    if (digits.length <= 2) return digits;
    let mm = digits.slice(0, 2), ss = digits.slice(2);
    if (Number(ss) > 59) ss = "59";
    return `${mm}:${ss}`;
  };

  const handleDurationChange = (key, val) => {
    setDurations(prev => ({ ...prev, [key]: formatMmSs(val) }));
  };

  const activeAssessmentItems = () => {
    if (testType === "manners") return MANNERS_ITEMS;
    if (testType === "ssm") return SSM_ITEMS;
    if (testType === "delsusbak") return DELSUSBAK_ITEMS;
    if (testType === "full") return [...MANNERS_ITEMS, ...SSM_ITEMS, ...DELSUSBAK_ITEMS];
    return [];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!obsType) { alert("Pilih tipe observasi dulu!"); return; }
    if (!selectedNama || !evaluator || !tanggal) { alert("Nama, Evaluator, dan Tanggal wajib diisi!"); return; }
    if (obsType === "assesment" && !testType) { alert("Pilih jenis tes assessment!"); return; }

    setSubmitting(true);
    setSuccessMsg("");

    try {
      let payloadData = [];
      const monthStr = new Date(tanggal).toLocaleString('id-ID', { month: 'long', year: 'numeric' });

      if (obsType === "hq") {
        if (!hqDuration || !hqQty) { alert("Durasi dan jumlah produk HQ wajib diisi!"); setSubmitting(false); return; }
        if (!/^\d{2}:[0-5]\d$/.test(hqDuration)) { alert("Format durasi harus MM:SS (contoh 03:45)!"); setSubmitting(false); return; }
        Object.entries(hqScores).forEach(([item, score]) => {
          payloadData.push({
            tanggal, nama: selectedNama, nik: selectedNik, evaluator,
            type: 'hq', item, score, duration: hqDuration, qty: hqQty, bulan: monthStr
          });
        });
      } else {
        activeAssessmentItems().forEach((it) => {
          const key = scoreKey(it);
          const score = assessmentScores[key];
          if (score === undefined || score === "") return;
          let itemText = it.item;
          const durKey = it.durasiSebelum ? `${testType}:${it.durasiSebelum}` : null;
          if (durKey && durations[durKey]) itemText += ` (Durasi: ${durations[durKey]})`;
          payloadData.push({
            tanggal, nama: selectedNama, nik: selectedNik, evaluator,
            type: 'assessment', test_type: testType, component: it.component,
            section: it.section, item: itemText, score: Number(score), bulan: monthStr
          });
        });
      }

      if (payloadData.length === 0) {
        alert("Belum ada item penilaian yang diisi!");
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from("audit_clinic_results").insert(payloadData);
      if (error) throw error;

      setSuccessMsg("✅ Berhasil menyimpan penilaian Audit Clinic!");
      setObsType("");
      setSelectedNama("");
      setSelectedNik("");
      setTestType("");
      setHqScores({});
      setAssessmentScores({});
      setDurations({});
      setHqDuration("");
      setHqQty("");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert("Gagal menyimpan: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderDurasiInput = (durKey) => (
    <div className="mt-3">
      <input
        type="text"
        inputMode="numeric"
        maxLength={5}
        value={durations[`${testType}:${durKey}`] || ""}
        onChange={(e) => handleDurationChange(`${testType}:${durKey}`, e.target.value)}
        placeholder={DURASI_LABEL[durKey] || "Input durasi"}
        className="w-full p-3 rounded-xl bg-white border border-gray-200 focus:ring-2 focus:ring-[#c2006b] outline-none shadow-sm text-sm font-semibold"
      />
    </div>
  );

  const renderAssessmentItem = (it, idx) => {
    const key = scoreKey(it);
    return (
      <div key={key} className="p-4 bg-gray-50 rounded-2xl gap-3 border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-700 flex-1">{it.item}</span>
          <select
            value={assessmentScores[key] ?? ""}
            onChange={(e) => handleScoreChange(key, e.target.value)}
            className="p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-800 sm:w-32"
          >
            <option value="">Skor</option>
            {SCORE_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {it.durasiSebelum && renderDurasiInput(it.durasiSebelum)}
      </div>
    );
  };

  const renderAssessmentGroup = (title, items) => {
    if (items.length === 0) return null;
    // Kelompokkan per section agar sesuai urutan GAS lama
    const sections = [];
    const seen = new Set();
    items.forEach(it => {
      if (!seen.has(it.section)) { seen.add(it.section); sections.push(it.section); }
    });
    return (
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h3 className="font-extrabold text-sm text-[#c2006b] uppercase tracking-wide">{title}</h3>
        {sections.map(sec => (
          <div key={sec} className="space-y-3">
            <p className="text-[11px] font-black uppercase text-gray-400 tracking-wider">{sec}</p>
            {items.filter(it => it.section === sec).map((it, idx) => renderAssessmentItem(it, idx))}
          </div>
        ))}
      </div>
    );
  };

  const showManners = obsType === "assesment" && (testType === "manners" || testType === "full");
  const showSsm = obsType === "assesment" && (testType === "ssm" || testType === "full");
  const showDelsusbak = obsType === "assesment" && (testType === "delsusbak" || testType === "full");

  if (loadingCashiers) {
    return <div className="flex items-center justify-center font-bold text-gray-500 py-10">Memuat data kasir...</div>;
  }

  return (
    <div className="w-full bg-white rounded-3xl shadow-xl p-6 sm:p-10 border border-gray-100">
      <div className="pb-6 border-b border-gray-100 mb-8">
        <span className="bg-[#c2006b]/10 text-[#c2006b] font-black text-[10px] uppercase px-3 py-1 rounded-full tracking-wider">AEON DPM Portal</span>
        <h1 className="text-2xl font-black text-gray-900 mt-2">Form Audit Clinic & Penilaian Kasir</h1>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-2xl font-bold text-sm space-y-3">
          <p>{successMsg}</p>
          <button
            type="button"
            onClick={() => { setSuccessMsg(""); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="w-full py-3 bg-[#c2006b] hover:bg-[#a30059] text-white font-black rounded-xl uppercase tracking-wider text-xs transition-all"
          >
            ↻ Input Penilaian Lagi
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-black uppercase text-gray-500 mb-2">Tipe Observasi</label>
          <select
            value={obsType}
            onChange={(e) => setObsType(e.target.value)}
            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:outline-none focus:border-[#c2006b]"
            required
          >
            <option value="">-- Pilih Tipe Observasi --</option>
            <option value="hq">HQ Audit (Evaluasi Rutin Kasir)</option>
            <option value="assesment">Assessment (Ujian Kompetensi Kasir)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-gray-500 mb-2">Tanggal Evaluasi</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:outline-none focus:border-[#c2006b]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-gray-500 mb-2">Nama Evaluator (PIC/TRC)</label>
            <input
              type="text"
              value={evaluator}
              onChange={(e) => setEvaluator(e.target.value)}
              placeholder="Nama Anda"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:outline-none focus:border-[#c2006b]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase text-gray-500 mb-2">Nama Kasir yang Dinilai</label>
            <select
              value={selectedNama}
              onChange={handleNamaChange}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:outline-none focus:border-[#c2006b]"
              required
            >
              <option value="">-- Pilih Nama Kasir --</option>
              {cashiers.map((c, i) => (
                <option key={i} value={c.nama}>{c.nama} ({c.level || 'Staff'})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-gray-500 mb-2">NIK Kasir</label>
            <input
              type="text"
              value={selectedNik}
              readOnly
              placeholder="Auto NIK"
              className="w-full p-3.5 bg-gray-100 border border-gray-200 rounded-2xl font-bold text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>

        {obsType === "assesment" && (
          <div>
            <label className="block text-xs font-black uppercase text-gray-500 mb-2">Pilih Komponen Test Assessment</label>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:outline-none focus:border-[#c2006b]"
              required
            >
              <option value="">-- Pilih Jenis Test --</option>
              <option value="manners">1. Professional Manners Only (10 item)</option>
              <option value="ssm">2. SSM Produk Only (54 item)</option>
              <option value="delsusbak">3. Delsusbak Produk Only (44 item)</option>
              <option value="full">4. Full Test (Semua Komponen)</option>
            </select>
          </div>
        )}

        {obsType === "hq" && (
          <div className="space-y-6 pt-4 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-pink-50/50 p-4 rounded-2xl border border-pink-100">
              <div>
                <label className="block text-xs font-black uppercase text-pink-700 mb-2">Durasi Waktu (MM:SS)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="Contoh: 03:45"
                  value={hqDuration}
                  onChange={(e) => setHqDuration(formatMmSs(e.target.value))}
                  className="w-full p-3 bg-white border border-pink-200 rounded-xl font-bold text-gray-800"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-pink-700 mb-2">Jumlah Produk Terproses</label>
                <input
                  type="number"
                  placeholder="Jumlah item"
                  value={hqQty}
                  onChange={(e) => setHqQty(e.target.value)}
                  className="w-full p-3 bg-white border border-pink-200 rounded-xl font-bold text-gray-800"
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-extrabold text-sm text-gray-800 uppercase tracking-wide">Poin Penilaian HQ — skor 1 / 0.5 / 0 ({HQ_ITEMS.length} item)</h3>
              {HQ_ITEMS.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-2xl gap-3 border border-gray-100">
                  <span className="text-sm font-semibold text-gray-700 flex-1">{item}</span>
                  <select
                    value={hqScores[item] ?? ""}
                    onChange={(e) => handleScoreChange(item, e.target.value, true)}
                    className="p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-800 sm:w-32"
                  >
                    <option value="">Skor</option>
                    {SCORE_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {showManners && renderAssessmentGroup("1. Professional Manners (10 item — skor 1 / 0.5 / 0)", MANNERS_ITEMS)}
        {showSsm && renderAssessmentGroup("2. SSM Produk (54 item — skor 1 / 0.5 / 0)", SSM_ITEMS)}
        {showDelsusbak && renderAssessmentGroup("3. Delsusbak Produk (44 item — skor 1 / 0.5 / 0)", DELSUSBAK_ITEMS)}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-[#c2006b] hover:bg-[#a30059] text-white font-black rounded-2xl shadow-lg shadow-pink-500/20 transition-all uppercase tracking-wider text-sm mt-8"
        >
          {submitting ? "Menyimpan Penilaian..." : "Kirim Penilaian Audit Clinic"}
        </button>
      </form>
    </div>
  );
}
