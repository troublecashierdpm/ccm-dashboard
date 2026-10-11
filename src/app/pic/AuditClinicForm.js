// src/app/pic/AuditClinicForm.jsx
"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

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

  // Assessment Inputs
  const [assessmentScores, setAssessmentScores] = useState({});
  const [durations, setDurations] = useState({});

  useEffect(() => {
    setEvaluator(evaluatorNama);
  }, [evaluatorNama]);

  useEffect(() => {
    fetchCashiers();
  }, []);

  async function fetchCashiers() {
    try {
      const { data, error } = await supabase.from("nik").select("nama, nik, level, status").order("nama");
      if (data) {
        setCashiers(data);
      }
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
    if (found) {
      setSelectedNik(found.nik || "");
    } else {
      setSelectedNik("");
    }
  };

  const handleScoreChange = (key, val, isHq = false) => {
    if (isHq) {
      setHqScores(prev => ({ ...prev, [key]: Number(val) }));
    } else {
      setAssessmentScores(prev => ({ ...prev, [key]: Number(val) }));
    }
  };

  const handleDurationChange = (key, val) => {
    let digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) {
      digits = digits.slice(0, 2) + ":" + digits.slice(2);
    }
    setDurations(prev => ({ ...prev, [key]: digits }));
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
        Object.entries(hqScores).forEach(([item, score]) => {
          payloadData.push({
            tanggal, nama: selectedNama, nik: selectedNik, evaluator,
            type: 'hq', item, score, duration: hqDuration, qty: hqQty, bulan: monthStr
          });
        });
      } else {
        Object.entries(assessmentScores).forEach(([itemKey, score]) => {
          payloadData.push({
            tanggal, nama: selectedNama, nik: selectedNik, evaluator,
            type: 'assessment', test_type: testType, item: itemKey, score, bulan: monthStr
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
      // Reset form
      setObsType("");
      setSelectedNama("");
      setSelectedNik("");
      setHqScores({});
      setAssessmentScores({});
      setHqDuration("");
      setHqQty("");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert("Gagal menyimpan: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const hqItems = [
    "1. Persiapan Area Kerja (Kebersihan & Kerapian Kasir)",
    "2. Kesopanan & Keramahan Sapaan Pelanggan (3S: Senyum, Salam, Sapa)",
    "3. Ketepatan Scan Barcode & Kecepatan Layanan",
    "4. Penawaran Program Berjalan (Promosi / Ecobag / Member)",
    "5. Ketelitian Penghitungan Uang Tunai & Non-Tunai",
    "6. Penggunaan Seragam Sesuai Standar Grooming AEON",
    "7. Koordinasi dengan Supervisor/TRC saat Kendala Sistem"
  ];

  const assessmentManners = [
    "Sikap Tubuh & Postur Berdiri Selama Melayani",
    "Kontak Mata & Ekspresi Wajah Ramah",
    "Kejelasan Suara & Intonasi Komunikasi",
    "Responsif Terhadap Komplain / Kendala Pelanggan"
  ];

  const assessmentSsm = [
    "Pemahaman Alur Transaksi Kasir Tunai & Kartu",
    "Ketepatan Prosedur Void / Refund / Cancel Item",
    "Penanganan Produk Fresh & Pecah Belah dengan Aman",
    "Kecepatan Pengemasan (Bagging) Belanjaan Customer"
  ];

  const assessmentDelsusbak = [
    "Prosedur Pemeriksaan Keaslian Uang Kertas",
    "Ketelitian Input Data E-Voucher / Kupon Diskon",
    "Prosedur Penutupan Shift & Serah Terima Kas (Closing)"
  ];

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
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-2xl font-bold text-sm">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipe Observasi */}
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

        {/* Tanggal & Evaluator */}
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

        {/* Pilih Karyawan */}
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

        {/* Assessment Test Selection */}
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
              <option value="manners">1. Professional Manners Only</option>
              <option value="ssm">2. SSM Produk Only</option>
              <option value="delsusbak">3. Delsusbak Produk Only</option>
              <option value="full">4. Full Test (Semua Komponen)</option>
            </select>
          </div>
        )}

        {/* HQ Form Sections */}
        {obsType === "hq" && (
          <div className="space-y-6 pt-4 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-pink-50/50 p-4 rounded-2xl border border-pink-100">
              <div>
                <label className="block text-xs font-black uppercase text-pink-700 mb-2">Durasi Waktu (MM:SS)</label>
                <input
                  type="text"
                  placeholder="Contoh: 03:45"
                  value={hqDuration}
                  onChange={(e) => setHqDuration(e.target.value)}
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
              <h3 className="font-extrabold text-sm text-gray-800 uppercase tracking-wide">Poin Penilaian HQ (Skor 1 - 5)</h3>
              {hqItems.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-2xl gap-3 border border-gray-100">
                  <span className="text-sm font-semibold text-gray-700 flex-1">{item}</span>
                  <select
                    value={hqScores[item] || ""}
                    onChange={(e) => handleScoreChange(item, e.target.value, true)}
                    className="p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-800 sm:w-32"
                    required
                  >
                    <option value="">Pilih Skor</option>
                    <option value="5">5 - Sangat Baik</option>
                    <option value="4">4 - Baik</option>
                    <option value="3">3 - Cukup</option>
                    <option value="2">2 - Kurang</option>
                    <option value="1">1 - Sangat Kurang</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assessment Sections */}
        {obsType === "assesment" && (testType === "manners" || testType === "full") && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="font-extrabold text-sm text-[#c2006b] uppercase tracking-wide">1. Professional Manners</h3>
            {assessmentManners.map((item, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-2xl gap-3 border border-gray-100">
                <span className="text-sm font-semibold text-gray-700 flex-1">{item}</span>
                <select
                  value={assessmentScores[`manners_${idx}`] || ""}
                  onChange={(e) => handleScoreChange(`manners_${idx}`, e.target.value)}
                  className="p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-800 sm:w-32"
                  required
                >
                  <option value="">Pilih Skor</option>
                  <option value="5">5</option>
                  <option value="4">4</option>
                  <option value="3">3</option>
                  <option value="2">2</option>
                  <option value="1">1</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {obsType === "assesment" && (testType === "ssm" || testType === "full") && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="font-extrabold text-sm text-[#c2006b] uppercase tracking-wide">2. SSM Produk</h3>
            {assessmentSsm.map((item, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-2xl gap-3 border border-gray-100">
                <span className="text-sm font-semibold text-gray-700 flex-1">{item}</span>
                <select
                  value={assessmentScores[`ssm_${idx}`] || ""}
                  onChange={(e) => handleScoreChange(`ssm_${idx}`, e.target.value)}
                  className="p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-800 sm:w-32"
                  required
                >
                  <option value="">Pilih Skor</option>
                  <option value="5">5</option>
                  <option value="4">4</option>
                  <option value="3">3</option>
                  <option value="2">2</option>
                  <option value="1">1</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {obsType === "assesment" && (testType === "delsusbak" || testType === "full") && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="font-extrabold text-sm text-[#c2006b] uppercase tracking-wide">3. Delsusbak Produk</h3>
            {assessmentDelsusbak.map((item, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-2xl gap-3 border border-gray-100">
                <span className="text-sm font-semibold text-gray-700 flex-1">{item}</span>
                <select
                  value={assessmentScores[`delsusbak_${idx}`] || ""}
                  onChange={(e) => handleScoreChange(`delsusbak_${idx}`, e.target.value)}
                  className="p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-800 sm:w-32"
                  required
                >
                  <option value="">Pilih Skor</option>
                  <option value="5">5</option>
                  <option value="4">4</option>
                  <option value="3">3</option>
                  <option value="2">2</option>
                  <option value="1">1</option>
                </select>
              </div>
            ))}
          </div>
        )}

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
