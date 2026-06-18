"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function App() {
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  const [stats, setStats] = useState({ member: 0, ecobag: 0, shortage: 0, sp: 0, sakit: 0, audit: '-' });
  const [history, setHistory] = useState({ member: [], shortage: [], ecobag: [], sakit: [], sp: [] });
  
  const [detailType, setDetailType] = useState(null);
  const [activeModalData, setActiveModalData] = useState(null);

  useEffect(() => {
    if (isLoggedIn && user) fetchDashboardData();
  }, [isLoggedIn, user]);

  const fetchDashboardData = async () => {
    try {
      // 1. DATA MEMBER
      const { data: memberData } = await supabase.from('member_per_day').select('tanggal, qty, bulan').eq('nama', user.nama);
      let totalMember = 0; let memberGroups = {};
      if (memberData) {
        memberData.forEach(row => {
          const bulan = row.bulan || 'Unknown'; const tanggal = row.tanggal || 'Unknown'; const qty = parseInt(row.qty) || 0;
          totalMember += qty;
          if (!memberGroups[bulan]) memberGroups[bulan] = { bulan, totalPerBulan: 0, dailyMap: {} };
          memberGroups[bulan].totalPerBulan += qty;
          if (!memberGroups[bulan].dailyMap[tanggal]) memberGroups[bulan].dailyMap[tanggal] = 0;
          memberGroups[bulan].dailyMap[tanggal] += qty;
        });
      }
      const finalMemberHistory = Object.values(memberGroups).map(group => ({
        bulan: group.bulan, totalPerBulan: group.totalPerBulan,
        details: Object.keys(group.dailyMap).map(tgl => ({ tgl, qty: group.dailyMap[tgl] }))
      }));

      // 2. DATA SHORTAGE
      const { data: shortagePagi } = await supabase.from('shortage_per_day').select('tanggal, pos, short_over_shift_pagi, periode').eq('nama', user.nama);
      const { data: shortageSiang } = await supabase.from('shortage_per_day').select('tanggal, pos, short_over_shift_siang, periode').eq('nama_1', user.nama);
      let shortGroups = {}; let totalShortage = 0;
      const processShortage = (data, isPagi) => {
        if (!data) return;
        data.forEach(row => {
          const bulan = row.periode || 'Unknown'; const nominal = parseInt(isPagi ? row.short_over_shift_pagi : row.short_over_shift_siang) || 0;
          totalShortage++; 
          if (!shortGroups[bulan]) shortGroups[bulan] = { bulan, frekuensi: 0, totalShort: 0, totalOver: 0, details: [] };
          shortGroups[bulan].frekuensi++;
          if (nominal < 0) shortGroups[bulan].totalShort += nominal;
          if (nominal > 0) shortGroups[bulan].totalOver += nominal;
          shortGroups[bulan].details.push({ tgl: row.tanggal, pos: row.pos || '-', shift: isPagi ? 'PAGI' : 'SIANG', nominal });
        });
      };
      processShortage(shortagePagi, true); processShortage(shortageSiang, false);

      // 3. DATA ECOBAG
      const { data: ecobagData } = await supabase.from('ecobag_per_day').select('*').eq('staff_name', user.nama);
      let totalEcobag = 0; let ecobagList = [];
      if (ecobagData) {
        ecobagData.forEach(row => {
          const qtyTotal = parseInt(row.total) || 0; totalEcobag += qtyTotal;
          ecobagList.push({ bulan: row.year_month || row.month, la: parseInt(row.bag_la) || 0, me: parseInt(row.bag_me) || 0, sm: parseInt(row.bag_sm) || 0, totalPerBulan: qtyTotal });
        });
      }

      // 4. DATA SAKIT / IZIN
      const { data: sakitData } = await supabase.from('sakit_per_day').select('*').eq('nama', user.nama);
      let totalSakit = 0; let sakitGroups = {};
      if (sakitData) {
        sakitData.forEach(row => {
          const bulan = row.bulan || 'Unknown'; totalSakit++;
          if (!sakitGroups[bulan]) sakitGroups[bulan] = { bulan, totalPerBulan: 0, details: [] };
          sakitGroups[bulan].totalPerBulan++;
          sakitGroups[bulan].details.push({ tglTidakMasuk: row.tgl_tidak_masuk || '-', tglMulaiMasuk: row.tgl_mulai_masuk || '-', keterangan: row.keterangan || '-', diagnosa: row.reason_diagnosa || '-', klinik: row.alamat_klinik || '-' });
        });
      }

      // 5. DATA SP/BA (BARU)
      const { data: spbaData } = await supabase.from('sp_ba_per_day').select('*').eq('nama', user.nama);
      let totalSp = 0; let spGroups = {};
      if (spbaData) {
        spbaData.forEach(row => {
          const bulan = row.bulan || 'Unknown'; totalSp++;
          if (!spGroups[bulan]) spGroups[bulan] = { bulan, totalPerBulan: 0, details: [] };
          spGroups[bulan].totalPerBulan++;
          spGroups[bulan].details.push({
            tanggal: row.tanggal || '-', jenis: row.jenis_pelanggaran || '-', remarks: row.remarks || '-', surat: row.surat_pernyataan || '-', under: row.pic_under || '-'
          });
        });
      }

      setStats(prev => ({ ...prev, member: totalMember, shortage: totalShortage, ecobag: totalEcobag, sakit: totalSakit, sp: totalSp }));
      setHistory({ member: finalMemberHistory, shortage: Object.values(shortGroups), ecobag: ecobagList, sakit: Object.values(sakitGroups), sp: Object.values(spGroups) });

    } catch (err) {
      console.error("Gagal menarik data:", err);
    }
  };

  const prosesLogin = async () => {
    if (!nik || !password) { alert("Wajib isi NIK & ID Swipe!"); return; }
    setLoading(true);
    const { data: userData, error } = await supabase.from('nik').select('*').eq('nik', nik).eq('id_swipe', password).single();
    if (error) { alert(error.code === 'PGRST116' ? "Login Gagal: NIK atau ID Swipe salah." : "Sistem Error: " + error.message); setLoading(false); return; }
    setUser(userData); setIsLoggedIn(true); setLoading(false);
  };

  const prosesLogout = () => {
    if(confirm("Yakin ingin keluar dari portal?")) {
      setIsLoggedIn(false); setUser(null); setNik(""); setPassword("");
      setStats({ member: 0, ecobag: 0, shortage: 0, sp: 0, sakit: 0, audit: '-' });
      setDetailType(null); setActiveModalData(null);
    }
  };

  if (isLoggedIn) {
    const photoUrl = user.photo || `https://ui-avatars.com/api/?name=${user.nama}&background=FCE7F3&color=E20074`;
    return (
      <div className="min-h-screen bg-[#fffcfd] font-sans text-[#1a1a1a] pb-10 overflow-x-hidden animate-[fadeIn_0.5s_ease-in-out]">
        <div className="bg-gradient-to-br from-[#e20074] to-[#ff1a8c] pt-12 pb-24 px-6 rounded-b-[3rem] shadow-xl text-white relative">
          <div className="flex items-center justify-between mb-8">
            <div><h3 className="font-bold opacity-70 uppercase tracking-widest text-[9px]">Staff Performance Dashboard</h3><p className="text-lg font-bold">Halo, Selamat Datang Kasir!</p></div>
            <button onClick={prosesLogout} className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-3 rounded-2xl transition active:scale-95"><svg style={{width:"20px",height:"20px"}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
          </div>
          <div className="flex items-start gap-5">
            <div className="relative"><img src={photoUrl} className="w-20 h-24 object-cover rounded-2xl border-4 border-white/20 shadow-2xl bg-white/10" alt="Foto Profil" /><div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 border-4 border-[#e20074] rounded-full shadow-lg"></div></div>
            <div className="flex-1 min-w-0 pt-2"><h1 className="text-xl font-extrabold truncate">{user.nama}</h1><div className="flex flex-wrap gap-2 mt-2"><span className="text-[9px] bg-black/20 px-3 py-1 rounded-lg">NIK: <span className="font-bold">{user.nik}</span></span><span className="text-[9px] bg-yellow-400 text-red-900 px-3 py-1 rounded-lg font-bold">Under: {user.under}</span></div></div>
          </div>
        </div>

        <div className="px-5 -mt-12 space-y-5 relative z-10">
          <div className="grid grid-cols-2 gap-4">
            <div onClick={() => setDetailType(detailType === 'member' ? null : 'member')} className="bg-white/90 backdrop-blur-md border border-pink-100 p-5 rounded-[2rem] shadow-sm border-b-4 border-b-pink-500 transition hover:-translate-y-1 cursor-pointer active:scale-95"><p className="text-[10px] text-gray-400 uppercase font-extrabold">Member</p><h3 className="text-2xl font-black">{stats.member}</h3></div>
            <div onClick={() => setDetailType(detailType === 'ecobag' ? null : 'ecobag')} className="bg-white/90 backdrop-blur-md border border-pink-100 p-5 rounded-[2rem] shadow-sm border-b-4 border-b-[#e20074] transition hover:-translate-y-1 cursor-pointer active:scale-95"><p className="text-[10px] text-gray-400 uppercase font-extrabold">Ecobag</p><h3 className="text-2xl font-black">{stats.ecobag}</h3></div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div onClick={() => setDetailType(detailType === 'shortage' ? null : 'shortage')} className="bg-white/90 backdrop-blur-md py-4 rounded-2xl text-center border-t-2 border-t-red-400 cursor-pointer active:scale-95 shadow-sm transition hover:-translate-y-1"><p className="text-[8px] font-bold">Shortage</p><h4 className="text-sm font-black text-red-500">{stats.shortage}</h4></div>
            <div onClick={() => setDetailType(detailType === 'sp' ? null : 'sp')} className="bg-white/90 backdrop-blur-md py-4 rounded-2xl text-center border-t-2 border-t-orange-400 cursor-pointer active:scale-95 shadow-sm transition hover:-translate-y-1"><p className="text-[8px] font-bold">SP/BA</p><h4 className="text-sm font-black text-orange-600">{stats.sp}</h4></div>
            <div onClick={() => setDetailType(detailType === 'sakit' ? null : 'sakit')} className="bg-white/90 backdrop-blur-md py-4 rounded-2xl text-center border-t-2 border-t-blue-400 cursor-pointer active:scale-95 shadow-sm transition hover:-translate-y-1"><p className="text-[8px] font-bold">Sakit/Izin</p><h4 className="text-sm font-black text-blue-500">{stats.sakit}</h4></div>
            <div className="bg-white/90 backdrop-blur-md py-4 rounded-2xl text-center border-t-2 border-t-purple-400 shadow-sm"><p className="text-[8px] font-bold">Audit</p><h4 className="text-sm font-black text-purple-600">{stats.audit}</h4></div>
          </div>

          {/* TABEL RANGKUMAN BAWAH */}
          {detailType && (
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-[2.5rem] mt-4 shadow-xl border border-gray-100 animate-[fadeIn_0.3s_ease-in-out]">
              <div className="flex justify-between items-center mb-4"><h4 className="font-black text-gray-800 text-xs uppercase">Detail {detailType}</h4><button onClick={() => setDetailType(null)} className="bg-gray-100 p-2 rounded-xl text-gray-400 hover:bg-gray-200">✕</button></div>
              <div className="overflow-x-auto rounded-2xl border border-gray-100 pb-2">
                 <table className="w-full text-[10px] text-left min-w-[300px]">
                    <thead className="bg-gray-50/50 text-[#e20074] font-bold border-b">
                      {(detailType === 'member' || detailType === 'ecobag') && (<tr><th className='p-3'>Bulan</th><th className='p-3 text-right'>Total</th></tr>)}
                      {detailType === 'sakit' && (<tr><th className='p-3'>Bulan</th><th className='p-3 text-right'>Frekuensi Absen</th></tr>)}
                      {detailType === 'sp' && (<tr><th className='p-3'>Bulan</th><th className='p-3 text-right'>Total Pelanggaran</th></tr>)}
                      {detailType === 'shortage' && (<tr><th className='p-3'>Bulan</th><th className='p-3 text-center'>Freq</th><th className='p-3 text-right'>Short</th><th className='p-3 text-right'>Over</th></tr>)}
                    </thead>
                    <tbody>
                      {detailType === 'member' && history.member.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'member', data: item })} className='hover:bg-pink-50 border-b cursor-pointer transition'><td className='p-3'>{item.bulan}</td><td className='p-3 text-right font-black'>{item.totalPerBulan}</td></tr>))}
                      {detailType === 'ecobag' && history.ecobag.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'ecobag', data: item })} className='hover:bg-pink-50 border-b cursor-pointer transition'><td className='p-3'>{item.bulan}</td><td className='p-3 text-right font-black text-[#e20074]'>{item.totalPerBulan} Pcs</td></tr>))}
                      {detailType === 'sakit' && history.sakit.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'sakit', data: item })} className='hover:bg-blue-50 border-b cursor-pointer transition'><td className='p-3 font-bold text-gray-700'>{item.bulan}</td><td className='p-3 text-right font-black text-blue-600'>{item.totalPerBulan}x Absen</td></tr>))}
                      {detailType === 'sp' && history.sp.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'sp', data: item })} className='hover:bg-orange-50 border-b cursor-pointer transition'><td className='p-3 font-bold text-gray-700'>{item.bulan}</td><td className='p-3 text-right font-black text-orange-600'>{item.totalPerBulan}x Pelanggaran</td></tr>))}
                      {detailType === 'shortage' && history.shortage.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'shortage', data: item })} className='hover:bg-red-50 border-b cursor-pointer transition'><td className='p-3 font-bold text-gray-700'>{item.bulan}</td><td className='p-3 text-center text-gray-500'>{item.frekuensi}x</td><td className='p-3 text-right font-black text-red-600'>{item.totalShort === 0 ? '-' : item.totalShort.toLocaleString('id-ID')}</td><td className='p-3 text-right font-black text-green-600'>{item.totalOver === 0 ? '-' : '+' + item.totalOver.toLocaleString('id-ID')}</td></tr>))}
                      {history[detailType]?.length === 0 && (<tr><td colSpan="4" className="p-4 text-center text-gray-400">Tidak ada data.</td></tr>)}
                    </tbody>
                 </table>
              </div>
            </div>
          )}
        </div>

        {/* === MODAL POP-UP SP/BA (BARU) === */}
        {activeModalData?.type === 'sp' && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease-in-out]">
            <div className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 text-white flex justify-between items-center">
                <h3 className="font-black text-sm uppercase">Detail SP / BA</h3>
                <button onClick={() => setActiveModalData(null)} className="p-1 bg-white/20 rounded-lg hover:bg-white/30">✕</button>
              </div>
              <div className="p-4 bg-gray-50 border-b text-center text-sm font-bold text-gray-700 uppercase">{activeModalData.data.bulan}</div>
              <div className="p-4 max-h-[50vh] overflow-y-auto space-y-3 bg-gray-50">
                {activeModalData.data.details.map((det, i) => (
                  <div key={i} className="p-4 border rounded-xl bg-white shadow-sm text-[10px] space-y-2 border-l-4 border-l-orange-500">
                    <div className="flex justify-between items-start font-bold text-gray-800">
                      <span>Tgl: {det.tanggal}</span>
                      <span className="text-[9px] bg-orange-100 text-orange-700 font-black px-2 py-1 rounded inline-block uppercase tracking-wider">{det.surat}</span>
                    </div>
                    <p className="text-gray-600 font-medium pt-1"><span className="font-bold text-gray-800">Pelanggaran:</span> {det.jenis}</p>
                    <p className="text-gray-600 font-medium"><span className="font-bold text-gray-800">Keterangan:</span> {det.remarks}</p>
                    <p className="text-gray-500 text-[9px] italic mt-2"><span className="font-bold text-gray-700">RC / PIC Under:</span> {det.under}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-orange-50 text-center font-black text-orange-600 border-t">TOTAL KASUS: {activeModalData.data.totalPerBulan}x</div>
            </div>
          </div>
        )}

        {/* (MODAL LAINNYA TETAP SAMA SEPERTI SEBELUMNYA) */}
        {activeModalData?.type === 'member' && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease-in-out]"><div className="bg-white w-full max-w-xs rounded-[2rem] overflow-hidden shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-5 text-white flex justify-between items-center"><h3 className="font-black text-sm uppercase">Detail Member</h3><button onClick={() => setActiveModalData(null)} className="p-1 bg-white/20 rounded-lg hover:bg-white/30">✕</button></div><div className="p-4 bg-gray-50 border-b text-center text-xs font-bold text-gray-500 uppercase">{activeModalData.data.bulan}</div><div className="p-5 max-h-[50vh] overflow-y-auto space-y-2">{activeModalData.data.details.map((det, i) => (<div key={i} className="flex justify-between p-3 border rounded-xl bg-white shadow-sm text-[10px]"><span className="font-bold text-gray-600">{det.tgl}</span><span className="font-black text-[#e20074]">{det.qty} Member</span></div>))}</div><div className="p-4 bg-gray-50 text-center font-black text-[#e20074] border-t">TOTAL: <span>{activeModalData.data.totalPerBulan}</span></div></div></div> )}
        {activeModalData?.type === 'ecobag' && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease-in-out]"><div className="bg-white w-full max-w-xs rounded-[2rem] overflow-hidden shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-5 text-white flex justify-between items-center"><h3 className="font-black text-sm uppercase">Rincian Ecobag</h3><button onClick={() => setActiveModalData(null)} className="p-1 bg-white/20 rounded-lg hover:bg-white/30">✕</button></div><div className="p-4 bg-gray-50 border-b text-center text-xs font-bold text-gray-500 uppercase">{activeModalData.data.bulan}</div><div className="p-5 space-y-3"><div className="flex justify-between p-3 border rounded-xl bg-white shadow-sm text-xs"><span className="font-bold text-gray-600">Size Large (LA)</span><span className="font-black text-[#e20074]">{activeModalData.data.la}</span></div><div className="flex justify-between p-3 border rounded-xl bg-white shadow-sm text-xs"><span className="font-bold text-gray-600">Size Medium (ME)</span><span className="font-black text-[#e20074]">{activeModalData.data.me}</span></div><div className="flex justify-between p-3 border rounded-xl bg-white shadow-sm text-xs"><span className="font-bold text-gray-600">Size Small (SM)</span><span className="font-black text-[#e20074]">{activeModalData.data.sm}</span></div></div><div className="p-4 bg-gray-50 text-center font-black text-[#e20074] border-t">TOTAL TERJUAL: <span>{activeModalData.data.totalPerBulan} Pcs</span></div></div></div> )}
        {activeModalData?.type === 'sakit' && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease-in-out]"><div className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-5 text-white flex justify-between items-center"><h3 className="font-black text-sm uppercase">Detail Absensi Sakit/Izin</h3><button onClick={() => setActiveModalData(null)} className="p-1 bg-white/20 rounded-lg hover:bg-white/30">✕</button></div><div className="p-4 bg-gray-50 border-b text-center text-sm font-bold text-gray-700 uppercase">{activeModalData.data.bulan}</div><div className="p-4 max-h-[50vh] overflow-y-auto space-y-3 bg-gray-50">{activeModalData.data.details.map((det, i) => (<div key={i} className="p-4 border rounded-xl bg-white shadow-sm text-[10px] space-y-2 border-l-4 border-l-blue-500"><div className="flex justify-between font-bold text-gray-800"><span>Mulai: {det.tglTidakMasuk}</span><span>Masuk: {det.tglMulaiMasuk}</span></div><div className="text-[9px] bg-blue-50 text-blue-700 font-black px-2 py-1 rounded inline-block uppercase tracking-wider">Status: {det.keterangan}</div><p className="text-gray-600 font-medium pt-1"><span className="font-bold text-gray-800">Diagnosa:</span> {det.diagnosa}</p><p className="text-gray-500 text-[9px] italic"><span className="font-bold text-gray-700">Klinik:</span> {det.klinik}</p></div>))}</div><div className="p-4 bg-gray-50 text-center font-black text-[#e20074] border-t">TOTAL FREKUENSI: {activeModalData.data.totalPerBulan}x</div></div></div> )}
        {activeModalData?.type === 'shortage' && ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease-in-out]"><div className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-5 text-white flex justify-between items-center"><h3 className="font-black text-sm uppercase">Detail Short/Over</h3><button onClick={() => setActiveModalData(null)} className="p-1 bg-white/20 rounded-lg hover:bg-white/30">✕</button></div><div className="p-4 bg-gray-50 border-b flex flex-col gap-3"><div className="font-bold text-gray-700 text-sm text-center uppercase">{activeModalData.data.bulan}</div><div className="flex justify-between w-full gap-2"><div className="bg-red-50 p-2 rounded-xl flex-1 text-center border border-red-100 shadow-sm"><p className="text-[9px] text-red-500 font-extrabold uppercase">Total Short</p><p className="font-black text-sm text-red-600 mt-1">{activeModalData.data.totalShort === 0 ? '0' : activeModalData.data.totalShort.toLocaleString('id-ID')}</p></div><div className="bg-green-50 p-2 rounded-xl flex-1 text-center border border-green-100 shadow-sm"><p className="text-[9px] text-green-600 font-extrabold uppercase">Total Over</p><p className="font-black text-sm text-green-600 mt-1">{activeModalData.data.totalOver === 0 ? '0' : '+' + activeModalData.data.totalOver.toLocaleString('id-ID')}</p></div></div></div><div className="p-4 max-h-[50vh] overflow-y-auto space-y-3 bg-gray-50">{activeModalData.data.details.map((det, i) => { let valColor = det.nominal < 0 ? 'text-red-600' : (det.nominal > 0 ? 'text-green-600' : 'text-gray-600'); let valBg = det.nominal < 0 ? 'bg-red-50 border-red-100' : (det.nominal > 0 ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'); let valLabel = det.nominal < 0 ? 'Minus' : (det.nominal > 0 ? 'Plus' : 'Pas'); let tanda = det.nominal > 0 ? '+' : ''; return (<div key={i} className={`flex justify-between items-center p-3 border rounded-xl shadow-sm text-[10px] ${valBg}`}><div><p className="font-bold text-gray-800">{det.tgl}</p><p className="text-[9px] text-gray-500 uppercase mt-1 font-bold">POS: {det.pos} • SHIFT: <span className="text-gray-700">{det.shift}</span></p></div><div className="text-right"><span className="text-[8px] bg-white/50 px-2 py-1 rounded font-bold text-gray-500 uppercase border border-gray-100">{valLabel}</span><p className={`font-black mt-1 text-xs ${valColor}`}>{tanda}{det.nominal.toLocaleString('id-ID')}</p></div></div>); })}</div></div></div> )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#fffcfd]">
      <div className="bg-white/80 backdrop-blur-md p-8 rounded-[2.5rem] shadow-[0_15px_35px_-5px_rgba(226,0,116,0.08)] w-full max-w-sm text-center border border-pink-100 relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-pink-100 rounded-full opacity-50 blur-2xl"></div>
        <div className="bg-[#e20074] w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg animate-[floating_4s_ease-in-out_infinite]"><span className="text-white font-black text-2xl tracking-tighter">AEON</span></div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Dashboard CCM DPM</h2>
        <p className="text-gray-400 text-xs mb-8">Silakan login dengan NIK & ID Swipe</p>
        <div className="space-y-4">
          <input type="text" placeholder="NIK" value={nik} onChange={(e) => setNik(e.target.value)} className="w-full pl-5 pr-4 py-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-pink-500 transition-all text-sm text-gray-900 font-medium placeholder:text-gray-400" />
          <input type="password" placeholder="ID Swipe" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-5 pr-4 py-4 rounded-2xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-pink-500 transition-all text-sm text-gray-900 font-medium placeholder:text-gray-400" />
        </div>
        <button onClick={prosesLogin} disabled={loading} className="mt-8 bg-[#e20074] text-white font-bold py-4 px-6 rounded-2xl w-full shadow-lg shadow-pink-100 hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2">
          {loading ? "MEMVERIFIKASI..." : "MASUK DASHBOARD"}
        </button>
      </div>
    </div>
  );
}
