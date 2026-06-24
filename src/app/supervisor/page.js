"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Chart from "chart.js/auto";

export default function SupervisorDashboard() {
  const [activePanel, setActivePanel] = useState("dir"); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [allKaryawan, setAllKaryawan] = useState([]);
  const [rawShortage, setRawShortage] = useState([]);
  const [rawEcobag, setRawEcobag] = useState([]);
  const [rawMember, setRawMember] = useState([]);
  const [rawSakit, setRawSakit] = useState([]);
  const [rawSpBa, setRawSpBa] = useState([]);

  // FILTER UNTUK PANEL GLOBAL (Shortage, Ecobag, dll)
  const [searchNama, setSearchNama] = useState("");
  const [filterBulan, setFilterBulan] = useState("");
  const [filterTipe, setFilterTipe] = useState("");
  const [showL, setShowL] = useState(true);
  const [showM, setShowM] = useState(true);
  const [showS, setShowS] = useState(true);

  // FILTER KHUSUS DIREKTORI STAFF
  const [dirSearch, setDirSearch] = useState("");
  const [dirStatus, setDirStatus] = useState("");
  const [dirUnder, setDirUnder] = useState("");

  const [selectedKaryawan, setSelectedKaryawan] = useState(null);
  const [empMenu, setEmpMenu] = useState("shortage");
  const [empStats, setEmpStats] = useState({ member: 0, ecobag: 0, shortage: 0, sp: 0, sakit: 0 });
  const [empHistory, setEmpHistory] = useState({ member: [], shortage: [], ecobag: [], sakit: [], sp: [] });

  const [activeModalData, setActiveModalData] = useState(null);

  useEffect(() => {
    fetchGlobalData();
  }, []);

  useEffect(() => {
    if (selectedKaryawan) {
      renderIndividualChart();
    }
  }, [selectedKaryawan, empMenu]);

  // LOGIKA BARU: TARIK SEMUA DATA TANPA BATAS 1000 BARIS (PAGINATION LOOP)
  const fetchAllData = async (table, orderByCol = null) => {
    let all = [];
    let from = 0;
    const step = 1000;
    while (true) {
      let q = supabase.from(table).select("*").range(from, from + step - 1);
      if (orderByCol) q = q.order(orderByCol, { ascending: true });
      
      const { data, error } = await q;
      if (error) { console.error(`Error fetch ${table}:`, error); break; }
      
      if (data && data.length > 0) {
        all = [...all, ...data];
        if (data.length < step) break; // Jika data yang ditarik kurang dari 1000, berarti sudah habis
        from += step;
      } else {
        break;
      }
    }
    return all;
  };

  const fetchGlobalData = async () => {
    setLoading(true);
    try {
      // Menjalankan semua penarikan data secara bersamaan agar cepat
      const [nikData, shortData, ecoData, memData, sakData, spData] = await Promise.all([
        fetchAllData("nik", "nama"),
        fetchAllData("shortage_per_day"),
        fetchAllData("ecobag_per_day"),
        fetchAllData("member_per_day"),
        fetchAllData("sakit_per_day"),
        fetchAllData("sp_ba_per_day")
      ]);

      setAllKaryawan(nikData || []);
      setRawShortage(shortData || []);
      setRawEcobag(ecoData || []);
      setRawMember(memData || []);
      setRawSakit(sakData || []);
      setRawSpBa(spData || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleKaryawanClick = (karyawan) => {
    setSelectedKaryawan(karyawan);
    setEmpMenu("shortage");

    const nama = karyawan.nama;
    const mData = rawMember.filter(r => r.nama === nama);
    let tMem = 0; let mGroups = {};
    mData.forEach(r => {
      tMem += parseInt(r.qty) || 0;
      if (!mGroups[r.bulan]) mGroups[r.bulan] = { bulan: r.bulan, totalPerBulan: 0, details: [] };
      mGroups[r.bulan].totalPerBulan += parseInt(r.qty) || 0;
      mGroups[r.bulan].details.push({ tgl: r.tanggal, qty: r.qty });
    });

    const sPagi = rawShortage.filter(r => r.nama === nama);
    const sSiang = rawShortage.filter(r => r.nama_1 === nama);
    let tShort = 0; let sGroups = {};
    const processS = (arr, isPagi) => {
      arr.forEach(r => {
        tShort++;
        const nominal = parseInt(isPagi ? r.short_over_shift_pagi : r.short_over_shift_siang) || 0;
        if (!sGroups[r.periode]) sGroups[r.periode] = { bulan: r.periode, frekuensi: 0, totalShort: 0, totalOver: 0, details: [] };
        sGroups[r.periode].frekuensi++;
        if (nominal < 0) sGroups[r.periode].totalShort += nominal;
        if (nominal > 0) sGroups[r.periode].totalOver += nominal;
        sGroups[r.periode].details.push({ tgl: r.tanggal, pos: r.pos, shift: isPagi?'PAGI':'SIANG', nominal });
      });
    };
    processS(sPagi, true); processS(sSiang, false);

    const eData = rawEcobag.filter(r => r.staff_name === nama);
    let tEco = 0; let eList = [];
    eData.forEach(r => {
      tEco += parseInt(r.total) || 0;
      eList.push({ bulan: r.year_month || r.month, la: r.bag_la, me: r.bag_me, sm: r.bag_sm, totalPerBulan: r.total });
    });

    const sakData = rawSakit.filter(r => r.nama === nama);
    let tSak = sakData.length; let sakGroups = {};
    sakData.forEach(r => {
      if (!sakGroups[r.bulan]) sakGroups[r.bulan] = { bulan: r.bulan, totalPerBulan: 0, details: [] };
      sakGroups[r.bulan].totalPerBulan++;
      sakGroups[r.bulan].details.push({ tglTidakMasuk: r.tgl_tidak_masuk, tglMulaiMasuk: r.tgl_mulai_masuk, keterangan: r.keterangan, diagnosa: r.reason_diagnosa, klinik: r.alamat_klinik });
    });

    const spData = rawSpBa.filter(r => r.nama === nama);
    let tSp = spData.length; let spGroups = {};
    spData.forEach(r => {
      if (!spGroups[r.bulan]) spGroups[r.bulan] = { bulan: r.bulan, totalPerBulan: 0, details: [] };
      spGroups[r.bulan].totalPerBulan++;
      spGroups[r.bulan].details.push({ tanggal: r.tanggal, jenis: r.jenis_pelanggaran, remarks: r.remarks, surat: r.surat_pernyataan, under: r.pic_under });
    });

    setEmpStats({ member: tMem, ecobag: tEco, shortage: tShort, sp: tSp, sakit: tSak });
    setEmpHistory({
      member: Object.values(mGroups).sort((a,b)=>b.bulan.localeCompare(a.bulan)),
      shortage: Object.values(sGroups).sort((a,b)=>b.bulan.localeCompare(a.bulan)),
      ecobag: eList.sort((a,b)=>b.bulan.localeCompare(a.bulan)),
      sakit: Object.values(sakGroups).sort((a,b)=>b.bulan.localeCompare(a.bulan)),
      sp: Object.values(spGroups).sort((a,b)=>b.bulan.localeCompare(a.bulan))
    });
    setActivePanel("emp_detail");
  };

  const renderIndividualChart = () => {
    const canvas = document.getElementById("individualChartCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const existingChart = Chart.getChart("individualChartCanvas");
    if (existingChart) existingChart.destroy();

    if (empMenu === "shortage") {
      const labels = empHistory.shortage.map(h => h.bulan).reverse();
      const shorts = empHistory.shortage.map(h => Math.abs(h.totalShort)).reverse();
      const overs = empHistory.shortage.map(h => h.totalOver).reverse();
      new Chart(ctx, { type: "line", data: { labels, datasets: [ { label: "Short", data: shorts, borderColor: "#e74c3c", tension: 0.3, fill: true, backgroundColor: "rgba(231,76,60,0.05)" }, { label: "Over", data: overs, borderColor: "#3498db", tension: 0.3, fill: true, backgroundColor: "rgba(52,152,219,0.05)" } ] }, options: { responsive: true, maintainAspectRatio: false } });
    } else if (empMenu === "member") {
      const labels = empHistory.member.map(h => h.bulan).reverse();
      const totals = empHistory.member.map(h => h.totalPerBulan).reverse();
      new Chart(ctx, { type: "bar", data: { labels, datasets: [{ label: "Total Member", data: totals, backgroundColor: "#C80082", borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false } });
    } else if (empMenu === "ecobag") {
      const labels = empHistory.ecobag.map(h => h.bulan).reverse();
      const totals = empHistory.ecobag.map(h => h.totalPerBulan).reverse();
      new Chart(ctx, { type: "bar", data: { labels, datasets: [{ label: "Total Ecobag", data: totals, backgroundColor: "#2ecc71", borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
  };

  const getPhotoUrl = (fileId, nama) => {
    if (fileId && fileId.trim() !== "") return `https://drive.google.com/thumbnail?id=${fileId.trim()}&sz=w300`;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nama)}&background=FCE7F3&color=E20074&bold=true`;
  };

  // -------------------------------------------------------------
  // LOGIKA DIREKTORI STAFF: PENGELOMPOKAN & FILTER
  // -------------------------------------------------------------
  const uniqueUnders = [...new Set(allKaryawan.map(k => k.under || "OTHERS"))].sort();
  const uniqueStatuses = [...new Set(allKaryawan.map(k => k.status || "UNKNOWN"))].sort();

  const filteredKaryawanDir = allKaryawan.filter(k => {
    const matchSearch = (k.nama?.toLowerCase() || "").includes(dirSearch.toLowerCase()) || (k.nik?.toLowerCase() || "").includes(dirSearch.toLowerCase());
    const matchStatus = dirStatus ? (k.status || "UNKNOWN") === dirStatus : true;
    const matchUnder = dirUnder ? (k.under || "OTHERS") === dirUnder : true;
    return matchSearch && matchStatus && matchUnder;
  });

  const isFolderView = !dirSearch && !dirStatus && !dirUnder;

  // -------------------------------------------------------------
  // LOGIKA GLOBAL PANEL LAINNYA
  // -------------------------------------------------------------
  const getFilteredGlobalData = () => {
    if (activePanel === "shortage") {
      const map = {};
      rawShortage.forEach(r => {
        if (filterBulan && r.periode !== filterBulan) return;
        const namaKasir = r.nama || r.nama_1 || "Unknown";
        if (searchNama && !namaKasir.toLowerCase().includes(searchNama.toLowerCase())) return;
        
        const key = namaKasir + "||" + r.periode;
        if (!map[key]) map[key] = { nama: namaKasir, periode: r.periode, totalShort: 0, totalOver: 0, frekuensi: 0, details: [] };
        
        const nomPagi = parseInt(r.short_over_shift_pagi) || 0;
        const nomSiang = parseInt(r.short_over_shift_siang) || 0;
        
        map[key].frekuensi++;
        if (nomPagi < 0) map[key].totalShort += nomPagi;
        if (nomPagi > 0) map[key].totalOver += nomPagi;
        if (nomSiang < 0) map[key].totalShort += nomSiang;
        if (nomSiang > 0) map[key].totalOver += nomSiang;
        
        map[key].details.push({ tanggal: r.tanggal, pos: r.pos, shiftPagi: nomPagi, shiftSiang: nomSiang });
      });
      return Object.values(map).sort((a,b) => b.periode.localeCompare(a.periode));
    }
    
    if (activePanel === "ecobag") return rawEcobag.filter(r => (!filterBulan || r.year_month === filterBulan || r.month === filterBulan) && (!searchNama || (r.staff_name && r.staff_name.toLowerCase().includes(searchNama.toLowerCase()))) && ((showL && r.bag_la > 0) || (showM && r.bag_me > 0) || (showS && r.bag_sm > 0) || (!showL && !showM && !showS)) );
    
    if (activePanel === "member") { const map = {}; rawMember.forEach(r => { if (filterBulan && r.bulan !== filterBulan) return; if (searchNama && !r.nama.toLowerCase().includes(searchNama.toLowerCase())) return; const key = r.nama + "||" + r.bulan; if (!map[key]) map[key] = { nama: r.nama, bulan: r.bulan, total: 0 }; map[key].total += parseInt(r.qty) || 0; }); return Object.values(map).sort((a,b)=>b.bulan.localeCompare(a.bulan)); }
    
    if (activePanel === "sakit") return rawSakit.filter(r => (!filterBulan || r.bulan === filterBulan) && (!filterTipe || r.keterangan === filterTipe) && (!searchNama || r.nama.toLowerCase().includes(searchNama.toLowerCase())) );
    
    if (activePanel === "sp") return rawSpBa.filter(r => (!filterBulan || r.bulan === filterBulan) && (!filterTipe || r.surat_pernyataan === filterTipe) && (!searchNama || r.nama.toLowerCase().includes(searchNama.toLowerCase())) );
    
    return [];
  };
  
  const filteredData = getFilteredGlobalData();

  const getGlobalSummary = () => {
    let card1 = 0, card2 = 0, card3 = 0;
    filteredData.forEach(r => {
      if (activePanel === "shortage") { 
        card1 += Math.abs(r.totalShort || 0); 
        card2 += (r.totalOver || 0); 
      }
      if (activePanel === "ecobag") card1 += r.total || 0;
      if (activePanel === "member") card1 += r.total || 0;
    });
    return { card1, card2, card3 };
  };
  
  const gSum = getGlobalSummary();

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans flex text-gray-800">
      
      <style jsx global>{`
        @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes fadeInScale { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
        .anim-slide-up { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-pop-in { animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .anim-fade-in { animation: fadeInScale 0.5s ease-out forwards; }
        .delay-100 { animation-delay: 100ms; }
        .glass-card { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.6); }
        
        body { overflow: ${activeModalData ? 'hidden' : 'auto'}; }
      `}</style>

      <aside className={`fixed inset-y-0 left-0 w-64 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="bg-[#e20074] p-5 text-white flex items-center justify-between"><div className="flex items-center gap-2 font-black text-sm tracking-wider"><span className="bg-white text-[#e20074] px-2 py-1 rounded-lg font-black shadow-sm">AEON</span> TRC PANEL</div><button onClick={() => setSidebarOpen(false)} className="md:hidden text-white font-bold text-xl">✕</button></div>
        <nav className="p-4 space-y-2">
          {[{ id: "dir", label: "Direktori Staff", icon: "👥" }, { id: "shortage", label: "Monitoring Shortage", icon: "⚠️" }, { id: "ecobag", label: "Monitoring Ecobag", icon: "🛍️" }, { id: "member", label: "Monitoring Member", icon: "💳" }, { id: "sp", label: "Surat Pernyataan (SP)", icon: "📄" }, { id: "sakit", label: "Absensi Sakit/Izin", icon: "🏥" }].map(menu => (
            <button key={menu.id} onClick={() => { setActivePanel(menu.id); setSelectedKaryawan(null); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wide transition-all ${activePanel === menu.id && !selectedKaryawan ? "bg-[#e20074] text-white shadow-lg shadow-pink-500/30" : "text-gray-500 hover:bg-pink-50 hover:text-[#e20074]"}`}><span>{menu.icon}</span> {menu.label}</button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 md:ml-64 min-w-0 p-6 anim-fade-in relative">
        
        {/* HEADER GRADIENT */}
        <header className="flex items-center justify-between bg-gradient-to-r from-[#e20074] to-[#ff1a8c] text-white px-6 py-5 rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(226,0,116,0.5)] mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <div className="flex items-center gap-4 relative z-10"><button onClick={() => setSidebarOpen(true)} className="md:hidden text-2xl">☰</button><h2 className="font-black text-lg uppercase tracking-wide">{selectedKaryawan ? `Profil: ${selectedKaryawan.nama}` : activePanel === "dir" ? "Direktori Karyawan DPM" : `Panel ${activePanel}`}</h2></div>
          {selectedKaryawan && <button onClick={() => setActivePanel("dir")} className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition shadow-sm relative z-10">← Kembali</button>}
        </header>

        {loading ? ( <div className="flex flex-col items-center justify-center py-40 gap-3"><div className="w-12 h-12 border-4 border-[#e20074] border-t-transparent rounded-full animate-spin"></div><p className="text-gray-400 font-bold text-xs tracking-widest uppercase animate-pulse">Memuat Database...</p></div> ) : (
          <>
            {/* ========================================================= */}
            {/* VIEW 1: DIREKTORI STAFF DENGAN FILTER & FOLDER LEADER     */}
            {/* ========================================================= */}
            {activePanel === "dir" && !selectedKaryawan && (
              <div className="space-y-6 anim-slide-up">
                
                {/* FILTER BAR DIREKTORI */}
                <div className="glass-card p-5 rounded-[2rem] shadow-sm flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
                    <label className="text-[9px] font-black tracking-wider uppercase text-gray-400">Pencarian Cepat</label>
                    <input type="text" placeholder="Nama / NIK..." value={dirSearch} onChange={(e) => setDirSearch(e.target.value)} className="p-3.5 border border-white/60 rounded-xl bg-white/50 outline-none text-xs font-bold focus:ring-2 focus:ring-pink-400" />
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[140px]">
                    <label className="text-[9px] font-black tracking-wider uppercase text-gray-400">Filter Status</label>
                    <select value={dirStatus} onChange={(e) => setDirStatus(e.target.value)} className="p-3.5 border border-white/60 rounded-xl bg-white/50 outline-none text-xs font-bold focus:ring-2 focus:ring-pink-400 cursor-pointer">
                      <option value="">Semua Status</option>
                      {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[140px]">
                    <label className="text-[9px] font-black tracking-wider uppercase text-gray-400">Filter Under (Leader)</label>
                    <select value={dirUnder} onChange={(e) => setDirUnder(e.target.value)} className="p-3.5 border border-white/60 rounded-xl bg-white/50 outline-none text-xs font-bold focus:ring-2 focus:ring-pink-400 cursor-pointer">
                      <option value="">Semua Leader</option>
                      {uniqueUnders.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <button onClick={() => { setDirSearch(""); setDirStatus(""); setDirUnder(""); }} className="bg-white/80 hover:bg-pink-50 hover:text-[#e20074] border px-5 py-3.5 rounded-xl text-xs font-bold transition shadow-sm">Reset</button>
                </div>

                {/* KONDISI: TAMPILKAN FOLDER LEADER ATAU DAFTAR KARYAWAN */}
                {isFolderView ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 anim-pop-in">
                    {uniqueUnders.map(under => {
                      const count = allKaryawan.filter(k => (k.under || "OTHERS") === under).length;
                      return (
                        <div key={under} onClick={() => setDirUnder(under)} className="glass-card p-6 rounded-[2rem] shadow-md shadow-pink-500/5 border-b-4 border-b-[#e20074] cursor-pointer hover:-translate-y-1.5 hover:shadow-xl hover:shadow-[#e20074]/10 transition-all active:scale-95 group">
                          <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center text-[#e20074] text-xl group-hover:scale-110 transition-transform">📁</div>
                            <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-3 py-1 rounded-full">{count} Staff</span>
                          </div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Under Leader</p>
                          <h3 className="text-lg font-black text-gray-800 break-words leading-tight">{under}</h3>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="glass-card p-6 rounded-[2.5rem] shadow-xl shadow-gray-200/50 anim-pop-in">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <div>
                        <h3 className="font-black text-sm text-[#e20074] uppercase tracking-widest mb-1">Hasil Filter Staff</h3>
                        <p className="text-xs text-gray-500 font-bold">Ditemukan {filteredKaryawanDir.length} Karyawan</p>
                      </div>
                      <button onClick={() => { setDirSearch(""); setDirStatus(""); setDirUnder(""); }} className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl text-xs font-bold uppercase transition">← Kembali ke Grup</button>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {filteredKaryawanDir.map(k => (
                        <div key={k.nik} onClick={() => handleKaryawanClick(k)} className="bg-white/60 hover:bg-white p-4 rounded-[1.5rem] border border-gray-100 shadow-sm text-center cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-pink-500/10 group active:scale-95">
                          <img src={getPhotoUrl(k.file_id, k.nama)} onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(k.nama)}&background=FCE7F3&color=E20074&bold=true`; }} referrerPolicy="no-referrer" className="w-20 h-24 object-cover rounded-[1.2rem] mx-auto border-2 border-gray-100 group-hover:border-[#e20074] shadow-sm transition-colors" alt={k.nama} />
                          <h4 className="font-extrabold text-xs text-gray-800 mt-3 leading-snug break-words max-w-full px-1 group-hover:text-[#e20074] transition-colors">{k.nama}</h4>
                          <p className="text-[10px] text-gray-400 font-bold mt-1 bg-gray-50/80 inline-block px-2 py-0.5 rounded-md">NIK: {k.nik}</p>
                          {k.status && <p className={`text-[8px] font-black uppercase mt-1.5 px-2 py-0.5 rounded-full inline-block ${k.status.includes('RESIGN') ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>{k.status}</p>}
                        </div>
                      ))}
                      {filteredKaryawanDir.length === 0 && (
                        <div className="col-span-full py-10 text-center text-gray-400 font-bold">Tidak ada staff yang cocok dengan filter tersebut.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* PANEL LAINNYA (SHORTAGE, ECOBAG, DLL)                     */}
            {/* ========================================================= */}
            {["shortage", "ecobag", "member", "sakit", "sp"].includes(activePanel) && !selectedKaryawan && (
              <div className="space-y-6 anim-slide-up">
                <div className="glass-card p-5 rounded-[2rem] shadow-sm flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5 min-w-[140px] flex-1 sm:flex-none"><label className="text-[9px] font-black tracking-wider uppercase text-gray-400">Cari Karyawan</label><input type="text" placeholder="Ketik nama..." value={searchNama} onChange={(e) => setSearchNama(e.target.value)} className="p-3.5 border border-white/60 rounded-xl bg-white/50 outline-none text-xs font-bold focus:ring-2 focus:ring-pink-400" /></div>
                  <div className="flex flex-col gap-1.5 min-w-[120px]"><label className="text-[9px] font-black tracking-wider uppercase text-gray-400">Periode</label><input type="text" placeholder="Contoh: 2025-10" value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)} className="p-3.5 border border-white/60 rounded-xl bg-white/50 outline-none text-xs font-bold focus:ring-2 focus:ring-pink-400" /></div>
                  {["sakit", "sp"].includes(activePanel) && ( <div className="flex flex-col gap-1.5 min-w-[140px]"><label className="text-[9px] font-black tracking-wider uppercase text-gray-400">Keterangan</label><input type="text" placeholder="Sakit, SP1, BA..." value={filterTipe} onChange={(e) => setFilterTipe(e.target.value)} className="p-3.5 border border-white/60 rounded-xl bg-white/50 outline-none text-xs font-bold focus:ring-2 focus:ring-pink-400" /></div> )}
                  <button onClick={() => { setSearchNama(""); setFilterBulan(""); setFilterTipe(""); }} className="bg-white/80 hover:bg-pink-50 hover:text-[#e20074] border px-5 py-3.5 rounded-xl text-xs font-bold transition shadow-sm">Reset</button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="glass-card p-5 rounded-[1.5rem] border-b-4 border-b-pink-500 shadow-sm"><p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Total Baris</p><h3 className="text-2xl font-black mt-1 text-gray-800">{filteredData.length}</h3></div>
                  {activePanel === "shortage" && ( <><div className="glass-card p-5 rounded-[1.5rem] border-b-4 border-b-red-500 shadow-sm"><p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Total Short</p><h3 className="text-xl font-black text-red-600 mt-1">Rp {gSum.card1.toLocaleString("id-ID")}</h3></div><div className="glass-card p-5 rounded-[1.5rem] border-b-4 border-b-green-500 shadow-sm"><p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Total Over</p><h3 className="text-xl font-black text-green-600 mt-1">Rp {gSum.card2.toLocaleString("id-ID")}</h3></div></> )}
                  {(activePanel === "ecobag" || activePanel === "member") && ( <div className="glass-card p-5 rounded-[1.5rem] border-b-4 border-b-[#e20074] shadow-sm"><p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Total Kantong/Member</p><h3 className="text-2xl font-black text-[#e20074] mt-1">{gSum.card1.toLocaleString("id-ID")}</h3></div> )}
                </div>

                <div className="glass-card rounded-[2rem] shadow-xl overflow-hidden anim-pop-in">
                  <div className="p-4 bg-white/40 border-b flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider"><span>{filteredData.length} Data Terangkum</span></div>
                  <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-left text-xs min-w-[500px]">
                      <thead className="bg-white/80 text-[#e20074] font-black border-b sticky top-0 uppercase tracking-wider text-[9px] z-10 backdrop-blur-md">
                        {activePanel === "shortage" && (<tr><th className="p-4">Periode</th><th className="p-4">Nama Kasir</th><th className="p-4 text-center">Frekuensi</th><th className="p-4 text-right">Total Short</th><th className="p-4 text-right">Total Over</th></tr>)}
                        {activePanel === "ecobag" && (<tr><th className="p-4">Bulan</th><th className="p-4">Nama Kasir</th><th className="p-4 text-right">Large</th><th className="p-4 text-right">Medium</th><th className="p-4 text-right">Small</th><th className="p-4 text-right font-black">Total</th></tr>)}
                        {activePanel === "member" && (<tr><th className="p-4">Nama Kasir</th><th className="p-4">Bulan</th><th className="p-4 text-right font-black">Total Member</th></tr>)}
                        {activePanel === "sakit" && (<tr><th className="p-4">Nama</th><th className="p-4">Mulai Absen</th><th className="p-4">Masuk Kembali</th><th className="p-4">Bulan</th><th className="p-4">Keterangan</th><th className="p-4">Diagnosa Dokter</th></tr>)}
                        {activePanel === "sp" && (<tr><th className="p-4">Tanggal</th><th className="p-4">Nama Karyawan</th><th className="p-4">Jenis Surat</th><th className="p-4">Kasus / Pelanggaran</th><th className="p-4">Bulan</th><th className="p-4">PIC Under</th></tr>)}
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                        
                        {activePanel === "shortage" && filteredData.map((r, i) => (
                          <tr key={i} onClick={() => setActiveModalData({ type: 'global_shortage', data: r })} className="hover:bg-pink-50/50 transition-colors cursor-pointer group">
                            <td className="p-4 font-bold">{r.periode}</td>
                            <td className="p-4 font-black group-hover:text-[#e20074] transition-colors">{r.nama}</td>
                            <td className="p-4 text-center"><span className="bg-gray-100 px-2.5 py-1 rounded-md text-[10px] font-bold">{r.frekuensi}x</span></td>
                            <td className="p-4 text-right text-red-600 font-black text-sm">{r.totalShort === 0 ? '-' : r.totalShort.toLocaleString("id-ID")}</td>
                            <td className="p-4 text-right text-green-600 font-black text-sm">{r.totalOver === 0 ? '-' : '+' + r.totalOver.toLocaleString("id-ID")}</td>
                          </tr>
                        ))}

                        {activePanel === "ecobag" && filteredData.map((r, i) => (<tr key={i} className="hover:bg-pink-50/50 transition-colors"><td className="p-4 font-bold">{r.year_month || r.month}</td><td className="p-4 font-black">{r.staff_name}</td><td className="p-4 text-right text-red-500 font-bold">{r.bag_la}</td><td className="p-4 text-right text-orange-500 font-bold">{r.bag_me}</td><td className="p-4 text-right text-blue-500 font-bold">{r.bag_sm}</td><td className="p-4 text-right text-[#e20074] font-black">{r.total} Pcs</td></tr>))}
                        {activePanel === "member" && filteredData.map((r, i) => (<tr key={i} className="hover:bg-pink-50/50 transition-colors"><td className="p-4 font-black">{r.nama}</td><td className="p-4 font-bold">{r.bulan}</td><td className="p-4 text-right font-black text-lg text-[#e20074]">{r.total}</td></tr>))}
                        {activePanel === "sakit" && filteredData.map((r, i) => (<tr key={i} className="hover:bg-pink-50/50 transition-colors"><td className="p-4 font-black">{r.nama}</td><td className="p-4 font-bold">{r.tgl_tidak_masuk}</td><td className="p-4 font-bold">{r.tgl_mulai_masuk}</td><td className="p-4 text-gray-400 font-bold">{r.bulan}</td><td className="p-4"><span className="bg-blue-50 text-blue-600 font-black px-2.5 py-1 rounded-md text-[9px] uppercase">{r.keterangan}</span></td><td className="p-4 font-bold text-gray-600">{r.reason_diagnosa} <p className="text-[10px] italic font-normal text-gray-400 mt-0.5">{r.alamat_klinik}</p></td></tr>))}
                        {activePanel === "sp" && filteredData.map((r, i) => (<tr key={i} className="hover:bg-pink-50/50 transition-colors"><td className="p-4 font-bold">{r.tanggal}</td><td className="p-4 font-black">{r.nama}</td><td className="p-4"><span className="bg-orange-50 text-orange-600 font-black px-2.5 py-1 rounded-md text-[9px] uppercase">{r.surat_pernyataan}</span></td><td className="p-4"><p className="font-bold text-gray-800">{r.jenis_pelanggaran}</p><p className="text-[10px] text-gray-500 font-medium mt-0.5">{r.remarks}</p></td><td className="p-4 text-gray-400 font-bold">{r.bulan}</td><td className="p-4 text-gray-500 font-black">{r.pic_under}</td></tr>))}
                        {filteredData.length === 0 && (<tr><td colSpan="10" className="p-10 text-center text-gray-400 font-bold">Belum ada data terfilter yang cocok di Supabase.</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activePanel === "emp_detail" && selectedKaryawan && (
              <div className="space-y-6 anim-pop-in">
                <div className="flex flex-wrap gap-2 glass-card p-3 rounded-2xl shadow-sm">
                  {[{ id: "shortage", label: "📊 Shortage", count: empStats.shortage }, { id: "ecobag", label: "🛍️ Ecobag", count: empStats.ecobag }, { id: "member", label: "💳 Member", count: empStats.member }, { id: "sp", label: "📄 SP/BA", count: empStats.sp }, { id: "sakit", label: "🏥 Sakit", count: empStats.sakit }].map(tab => (
                    <button key={tab.id} onClick={() => setEmpMenu(tab.id)} className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${empMenu === tab.id ? "bg-[#e20074] text-white shadow-md shadow-pink-500/30 anim-pop-in" : "bg-white/50 text-gray-500 hover:bg-pink-50"}`}>{tab.label} <span className={`text-[10px] px-2 py-0.5 rounded-full ${empMenu === tab.id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>{tab.count}</span></button>
                  ))}
                </div>

                {["shortage", "member", "ecobag"].includes(empMenu) && ( <div className="glass-card p-6 rounded-[2rem] shadow-sm"><div className="h-64 relative w-full"><canvas id="individualChartCanvas"></canvas></div></div> )}

                <div className="glass-card rounded-[2rem] shadow-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-left text-xs min-w-[400px]">
                      <thead className="bg-white/80 text-[#e20074] font-black border-b uppercase tracking-wider text-[9px] sticky top-0 z-10 backdrop-blur-md">
                        {empMenu === "shortage" && (<tr><th className="p-4">Bulan</th><th className="p-4 text-center">Freq</th><th className="p-4 text-right">Short Minus</th><th className="p-4 text-right">Over Plus</th></tr>)}
                        {empMenu === "member" && (<tr><th className="p-4">Bulan</th><th className="p-4 text-right">Total Akumulasi</th></tr>)}
                        {empMenu === "ecobag" && (<tr><th className="p-4">Bulan</th><th className="p-4 text-right">Size L</th><th className="p-4 text-right">Size M</th><th className="p-4 text-right">Size S</th><th className="p-4 text-right">Total</th></tr>)}
                        {empMenu === "sakit" && (<tr><th className="p-4 w-24">Bulan</th><th className="p-4">Detail Absen Sakit Karyawan</th></tr>)}
                        {empMenu === "sp" && (<tr><th className="p-4 w-24">Bulan</th><th className="p-4">Riwayat Pelanggaran & Kasus</th></tr>)}
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                        {empMenu === "shortage" && empHistory.shortage.map((h, i) => (<tr key={i} className="hover:bg-red-50/40 transition-colors"><td className="p-4 font-black">{h.bulan}</td><td className="p-4 text-center text-gray-400 font-bold bg-gray-50/50">{h.frekuensi}x</td><td className="p-4 text-right text-red-600 font-black text-sm">{h.totalShort.toLocaleString("id-ID")}</td><td className="p-4 text-right text-green-600 font-black text-sm">+{h.totalOver.toLocaleString("id-ID")}</td></tr>))}
                        {empMenu === "member" && empHistory.member.map((h, i) => (<tr key={i} className="hover:bg-pink-50/40 transition-colors"><td className="p-4 font-black">{h.bulan}</td><td className="p-4 text-right text-[#e20074] font-black text-lg">{h.totalPerBulan} <span className="text-[10px] text-gray-500">Member</span></td></tr>))}
                        {empMenu === "ecobag" && empHistory.ecobag.map((h, i) => (<tr key={i} className="hover:bg-pink-50/40 transition-colors"><td className="p-4 font-black">{h.bulan}</td><td className="p-4 text-right text-red-500 font-bold">{h.la}</td><td className="p-4 text-right text-orange-500 font-bold">{h.me}</td><td className="p-4 text-right text-blue-500 font-bold">{h.sm}</td><td className="p-4 text-right text-[#e20074] font-black text-sm">{h.totalPerBulan} Pcs</td></tr>))}
                        {empMenu === "sakit" && empHistory.sakit.map((h, i) => ( <tr key={i}><td className="p-4 font-black border-r bg-white/40">{h.bulan}</td><td className="p-4 space-y-3 bg-white/20">{h.details.map((det, idx) => ( <div key={idx} className="p-4 border border-blue-100 rounded-2xl bg-white shadow-sm flex flex-col gap-1.5 border-l-[5px] border-l-blue-500 hover:shadow-md transition-shadow"><div className="flex justify-between font-bold text-gray-800 bg-gray-50 px-3 py-2 rounded-lg text-[10px]"><span>Libur: <span className="text-blue-600">{det.tglTidakMasuk}</span></span> <span>Masuk: <span className="text-green-600">{det.tglMulaiMasuk}</span></span></div><div><span className="text-[9px] bg-blue-100 text-blue-800 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">{det.keterangan}</span></div><p className="text-gray-700 mt-1"><span className="font-bold text-gray-900">Diagnosa:</span> {det.diagnosa}</p><p className="text-[10px] text-gray-400 italic font-bold border-t pt-1 border-dashed mt-1">Klinik: {det.klinik}</p></div> ))}</td></tr> ))}
                        {empMenu === "sp" && empHistory.sp.map((h, i) => ( <tr key={i}><td className="p-4 font-black border-r bg-white/40">{h.bulan}</td><td className="p-4 space-y-3 bg-white/20">{h.details.map((det, idx) => ( <div key={idx} className="p-4 border border-orange-100 rounded-2xl bg-white shadow-sm flex flex-col gap-1.5 border-l-[5px] border-l-orange-500 hover:shadow-md transition-shadow"><div className="flex justify-between items-center font-bold text-gray-800 border-b pb-2"><span className="text-[11px]">{det.tanggal}</span> <span className="text-[9px] bg-orange-100 text-orange-800 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">{det.surat}</span></div><p className="text-gray-700 mt-1"><span className="font-bold text-gray-900 block text-[9px] uppercase text-gray-400">Pelanggaran:</span> {det.jenis}</p><p className="text-gray-700 bg-gray-50 p-2.5 rounded-lg border"><span className="font-bold text-gray-900 block text-[9px] uppercase text-gray-400 mb-0.5">Remarks</span> {det.remarks}</p><p className="text-[9px] font-black text-gray-500 uppercase tracking-wider mt-1 flex items-center gap-1.5"><span className="w-3 h-3 bg-orange-100 rounded-full inline-block"></span> PIC Under: {det.under}</p></div> ))}</td></tr> ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ========================================================= */}
      {/* MODAL POP-UP GLOBAL SHORTAGE                              */}
      {/* ========================================================= */}
      {activeModalData?.type === 'global_shortage' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl anim-pop-in">
            <div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center">
              <h3 className="font-black text-sm uppercase tracking-wider">Detail Shortage {activeModalData.data.periode}</h3>
              <button onClick={() => setActiveModalData(null)} className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors active:scale-90">✕</button>
            </div>
            <div className="p-4 bg-gray-50 border-b text-center text-xs font-black text-gray-800 uppercase tracking-widest">
              {activeModalData.data.nama}
            </div>
            <div className="p-5 max-h-[50vh] overflow-y-auto space-y-3 bg-gray-50/50">
              {activeModalData.data.details.map((det, i) => {
                const tPagi = det.shiftPagi;
                const tSiang = det.shiftSiang;
                return (
                  <div key={i} className="p-4 border border-gray-200 rounded-2xl bg-white shadow-sm text-[11px] space-y-2 border-l-[5px] border-l-gray-400 hover:shadow-md transition-shadow">
                    <div className="flex justify-between font-bold text-gray-800 border-b pb-2">
                      <span>{det.tanggal}</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded text-[9px] uppercase tracking-wide">POS: {det.pos}</span>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Shift Pagi:</span>
                      <span className={`font-black ${tPagi < 0 ? 'text-red-600' : tPagi > 0 ? 'text-green-600' : 'text-gray-400'}`}>{tPagi !== 0 ? tPagi.toLocaleString('id-ID') : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Shift Siang:</span>
                      <span className={`font-black ${tSiang < 0 ? 'text-red-600' : tSiang > 0 ? 'text-green-600' : 'text-gray-400'}`}>{tSiang !== 0 ? tSiang.toLocaleString('id-ID') : '-'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-5 bg-white border-t flex justify-between text-sm shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
              <span className="font-black text-red-600">Short: {activeModalData.data.totalShort.toLocaleString('id-ID')}</span>
              <span className="font-black text-green-600">Over: +{activeModalData.data.totalOver.toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
