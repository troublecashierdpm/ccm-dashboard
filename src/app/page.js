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
      const finalMemberHistory = Object.values(memberGroups)
        .sort((a, b) => b.bulan.localeCompare(a.bulan))
        .map(group => ({
          bulan: group.bulan, totalPerBulan: group.totalPerBulan,
          details: Object.keys(group.dailyMap).map(tgl => ({ tgl, qty: group.dailyMap[tgl] })).sort((a,b) => (parseInt(b.tgl.split('-')[0])||0) - (parseInt(a.tgl.split('-')[0])||0))
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
      const finalShortageHistory = Object.values(shortGroups)
        .sort((a, b) => b.bulan.localeCompare(a.bulan))
        .map(group => {
          group.details.sort((a,b) => (parseInt(b.tgl.split('-')[0])||0) - (parseInt(a.tgl.split('-')[0])||0));
          return group;
        });

      // 3. DATA ECOBAG
      const { data: ecobagData } = await supabase.from('ecobag_per_day').select('*').eq('staff_name', user.nama);
      let totalEcobag = 0; let ecobagList = [];
      if (ecobagData) {
        ecobagData.forEach(row => {
          const qtyTotal = parseInt(row.total) || 0; totalEcobag += qtyTotal;
          ecobagList.push({ bulan: row.year_month || row.month, la: parseInt(row.bag_la) || 0, me: parseInt(row.bag_me) || 0, sm: parseInt(row.bag_sm) || 0, totalPerBulan: qtyTotal });
        });
        ecobagList.sort((a, b) => b.bulan.localeCompare(a.bulan));
      }

      // 4. DATA SAKIT
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
      const finalSakitHistory = Object.values(sakitGroups)
        .sort((a, b) => b.bulan.localeCompare(a.bulan))
        .map(group => {
          group.details.sort((a,b) => (parseInt(b.tglTidakMasuk.split('-')[0])||0) - (parseInt(a.tglTidakMasuk.split('-')[0])||0));
          return group;
        });

      // 5. DATA SP/BA
      const { data: spbaData } = await supabase.from('sp_ba_per_day').select('*').eq('nama', user.nama);
      let totalSp = 0; let spGroups = {};
      if (spbaData) {
        spbaData.forEach(row => {
          const bulan = row.bulan || 'Unknown'; totalSp++;
          if (!spGroups[bulan]) spGroups[bulan] = { bulan, totalPerBulan: 0, details: [] };
          spGroups[bulan].totalPerBulan++;
          spGroups[bulan].details.push({ tanggal: row.tanggal || '-', jenis: row.jenis_pelanggaran || '-', remarks: row.remarks || '-', surat: row.surat_pernyataan || '-', under: row.pic_under || '-' });
        });
      }
      const finalSpHistory = Object.values(spGroups)
        .sort((a, b) => b.bulan.localeCompare(a.bulan))
        .map(group => {
          group.details.sort((a,b) => (parseInt(b.tanggal.split('-')[0])||0) - (parseInt(a.tanggal.split('-')[0])||0));
          return group;
        });

      setStats({ member: totalMember, shortage: totalShortage, ecobag: totalEcobag, sakit: totalSakit, sp: totalSp, audit: '-' });
      setHistory({ member: finalMemberHistory, shortage: finalShortageHistory, ecobag: ecobagList, sakit: finalSakitHistory, sp: finalSpHistory });

    } catch (err) {
      console.error("Gagal menarik data:", err);
    }
  };

  const prosesLogin = async () => {
    if (!nik || !password) { alert("Wajib isi NIK & ID Swipe!"); return; }
    setLoading(true);
    const { data: userData, error } = await supabase.from('nik').select('*').eq('nik', nik).eq('id_swipe', password).single();
    if (error) { 
      await supabase.from('log_login').insert([{ nik: nik, nama: '-', status: 'LOGIN FAILED: Wrong NIK/Password' }]);
      alert(error.code === 'PGRST116' ? "Login Gagal: NIK atau ID Swipe salah." : "Sistem Error: " + error.message); 
      setLoading(false); return; 
    }
    await supabase.from('log_login').insert([{ nik: userData.nik, nama: userData.nama, status: 'LOGIN SUCCESS' }]);
    setUser(userData); setIsLoggedIn(true); setLoading(false);
  };

  const prosesLogout = async () => {
    if(confirm("Yakin ingin keluar dari portal?")) {
      if (user) {
        await supabase.from('log_login').insert([{ nik: user.nik, nama: user.nama, status: 'LOGOUT' }]);
      }
      setIsLoggedIn(false); setUser(null); setNik(""); setPassword("");
      setStats({ member: 0, ecobag: 0, shortage: 0, sp: 0, sakit: 0, audit: '-' });
      setDetailType(null); setActiveModalData(null);
    }
  };

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.nama || 'A')}&background=FCE7F3&color=E20074&bold=true`;
  const getPhotoUrl = () => {
    if (user?.file_id && user.file_id.trim() !== '') {
      return `https://drive.google.com/thumbnail?id=${user.file_id.trim()}&sz=w500`;
    }
    return fallbackAvatar;
  };

  return (
    <>
      <style jsx global>{`
        @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes fadeInScale { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
        .anim-slide-up { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-pop-in { animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .anim-fade-in { animation: fadeInScale 0.5s ease-out forwards; }
        .delay-100 { animation-delay: 100ms; }
        .glass-card { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        
        body { overflow: ${activeModalData ? 'hidden' : 'auto'}; }
      `}</style>

      {isLoggedIn ? (
        <>
          <div className="min-h-screen bg-[#f8f9fc] font-sans text-[#1a1a1a] pb-12 overflow-x-hidden anim-fade-in relative z-0">
            
            <div className="bg-gradient-to-br from-[#e20074] to-[#ff1a8c] pt-14 pb-28 px-6 rounded-b-[2.5rem] shadow-[0_10px_40px_-10px_rgba(226,0,116,0.5)] text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20"></div>
              
              <div className="flex items-center justify-between mb-10 relative z-10">
                <div>
                  <h3 className="font-bold opacity-80 uppercase tracking-widest text-[10px] mb-1">Staff Performance</h3>
                  <p className="text-xl font-extrabold tracking-tight">Halo, Kasir!</p>
                </div>
                <button onClick={prosesLogout} className="bg-white/20 hover:bg-white/30 backdrop-blur-md p-3.5 rounded-2xl transition-all duration-300 active:scale-90 shadow-sm">
                  <svg style={{width:"20px",height:"20px"}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                </button>
              </div>

              <div className="flex items-start gap-5 relative z-10">
                <div className="relative group shrink-0 bg-white/10 rounded-3xl p-1 shadow-2xl">
                  <img src={getPhotoUrl()} onError={(e) => { e.currentTarget.src = fallbackAvatar; }} referrerPolicy="no-referrer" className="w-24 h-24 object-cover rounded-[1.2rem] border-2 border-white/40 bg-white/20 transition-transform duration-300 group-hover:scale-105" alt="Foto Profil" />
                  <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-green-400 border-4 border-[#e20074] rounded-full shadow-lg z-10"></div>
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h1 className="text-xl sm:text-2xl font-black drop-shadow-md leading-tight break-words pr-2">{user.nama}</h1>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-[10px] bg-black/25 px-3.5 py-1.5 rounded-xl backdrop-blur-sm border border-white/10">NIK: <span className="font-bold">{user.nik}</span></span>
                    {user.join_date && (
                      <span className="text-[10px] bg-white/20 px-3.5 py-1.5 rounded-xl backdrop-blur-sm border border-white/10 shadow-sm">Join: <span className="font-bold">{user.join_date}</span></span>
                    )}
                    <span className="text-[10px] bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-950 px-3.5 py-1.5 rounded-xl font-bold shadow-sm">Under: {user.under}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 -mt-12 space-y-4 relative z-20">
              <div className="grid grid-cols-2 gap-4 anim-slide-up">
                <div onClick={() => setDetailType(detailType === 'member' ? null : 'member')} className="glass-card p-6 rounded-[2rem] shadow-lg border-b-4 border-pink-500 cursor-pointer group hover:-translate-y-1 transition-all">
                  <p className="text-[11px] text-gray-500 uppercase font-extrabold group-hover:text-pink-500">Member</p>
                  <h3 className="text-3xl font-black">{stats.member}</h3>
                </div>
                <div onClick={() => setDetailType(detailType === 'ecobag' ? null : 'ecobag')} className="glass-card p-6 rounded-[2rem] shadow-lg border-b-4 border-[#e20074] cursor-pointer group hover:-translate-y-1 transition-all">
                  <p className="text-[11px] text-gray-500 uppercase font-extrabold group-hover:text-[#e20074]">Ecobag</p>
                  <h3 className="text-3xl font-black">{stats.ecobag}</h3>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 anim-slide-up delay-100">
                <div onClick={() => setDetailType(detailType === 'shortage' ? null : 'shortage')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-red-400 cursor-pointer hover:-translate-y-1 transition-all">
                  <p className="text-[9px] font-bold text-gray-500">Shortage</p>
                  <h4 className="text-base font-black text-red-500">{stats.shortage}</h4>
                </div>
                <div onClick={() => setDetailType(detailType === 'sp' ? null : 'sp')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-orange-400 cursor-pointer hover:-translate-y-1 transition-all">
                  <p className="text-[9px] font-bold text-gray-500">SP/BA</p>
                  <h4 className="text-base font-black text-orange-600">{stats.sp}</h4>
                </div>
                <div onClick={() => setDetailType(detailType === 'sakit' ? null : 'sakit')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-blue-400 cursor-pointer hover:-translate-y-1 transition-all">
                  <p className="text-[9px] font-bold text-gray-500">Sakit/Izin</p>
                  <h4 className="text-base font-black text-blue-500">{stats.sakit}</h4>
                </div>
                <div className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-purple-400 opacity-80">
                  <p className="text-[9px] font-bold text-gray-400">Audit</p>
                  <h4 className="text-base font-black text-purple-600">{stats.audit}</h4>
                </div>
              </div>

              {detailType && (
                <div className="glass-card p-6 rounded-[2.5rem] mt-6 shadow-xl anim-pop-in">
                  <div className="flex justify-between items-center mb-5">
                    <h4 className="font-black text-sm uppercase">Tabel {detailType}</h4>
                    <button onClick={() => setDetailType(null)} className="bg-gray-100 p-2.5 rounded-xl text-gray-500">✕</button>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border bg-white/50">
                    <table className="w-full text-[11px] text-left">
                        <thead className="bg-gray-50 text-[#e20074] border-b uppercase">
                          {(detailType === 'member' || detailType === 'ecobag') && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Total</th></tr>)}
                          {detailType === 'sakit' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Absen</th></tr>)}
                          {detailType === 'sp' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Kasus</th></tr>)}
                          {detailType === 'shortage' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-center'>Freq</th><th className='p-4 text-right'>Short</th><th className='p-4 text-right'>Over</th></tr>)}
                        </thead>
                        <tbody>
                          {detailType === 'member' && history.member.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'member', data: item })} className='border-b cursor-pointer hover:bg-pink-50'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-lg'>{item.totalPerBulan}</td></tr>))}
                          {detailType === 'ecobag' && history.ecobag.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'ecobag', data: item })} className='border-b cursor-pointer hover:bg-pink-50'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-[#e20074] text-lg'>{item.totalPerBulan}</td></tr>))}
                          {detailType === 'sakit' && history.sakit.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'sakit', data: item })} className='border-b cursor-pointer hover:bg-blue-50'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-blue-600 text-lg'>{item.totalPerBulan}x</td></tr>))}
                          {detailType === 'sp' && history.sp.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'sp', data: item })} className='border-b cursor-pointer hover:bg-orange-50'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-orange-600 text-lg'>{item.totalPerBulan}x</td></tr>))}
                          {detailType === 'shortage' && history.shortage.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'shortage', data: item })} className='border-b cursor-pointer hover:bg-red-50'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-center text-gray-500'>{item.frekuensi}x</td><td className='p-4 text-right font-black text-red-600'>{item.totalShort.toLocaleString('id-ID')}</td><td className='p-4 text-right font-black text-green-600'>+{item.totalOver.toLocaleString('id-ID')}</td></tr>))}
                        </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* MODAL POP UP */}
          {activeModalData?.type === 'member' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-xs rounded-[2.5rem] overflow-hidden anim-pop-in shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center"><h3 className="font-black uppercase text-sm">Detail Member</h3><button onClick={() => setActiveModalData(null)} className="bg-white/20 p-1.5 rounded-xl">✕</button></div><div className="p-4 bg-pink-50/50 border-b text-center text-xs font-black text-pink-900 tracking-widest uppercase">{activeModalData.data.bulan}</div><div className="p-5 max-h-[50vh] overflow-y-auto space-y-2.5"><div className="space-y-2">{activeModalData.data.details.map((det, i) => (<div key={i} className="flex justify-between p-3.5 border border-gray-100 rounded-2xl bg-white shadow-sm text-[11px]"><span className="font-bold">{det.tgl}</span><span className="font-black text-[#e20074] bg-pink-50 px-3 py-1.5 rounded-lg">{det.qty} Member</span></div>))}</div></div><div className="p-5 bg-white text-center font-black text-[#e20074] border-t text-lg shadow-inner">TOTAL: {activeModalData.data.totalPerBulan}</div></div></div> )}
          {activeModalData?.type === 'ecobag' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-xs rounded-[2.5rem] overflow-hidden anim-pop-in shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center"><h3 className="font-black uppercase text-sm">Rincian Ecobag</h3><button onClick={() => setActiveModalData(null)} className="bg-white/20 p-1.5 rounded-xl">✕</button></div><div className="p-4 bg-pink-50/50 border-b text-center text-xs font-black text-pink-900 tracking-widest uppercase">{activeModalData.data.bulan}</div><div className="p-6 space-y-3.5"><div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl bg-white shadow-sm text-xs"><span className="font-bold">Large (LA)</span><span className="font-black text-[#e20074] text-lg">{activeModalData.data.la}</span></div><div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl bg-white shadow-sm text-xs"><span className="font-bold">Medium (ME)</span><span className="font-black text-[#e20074] text-lg">{activeModalData.data.me}</span></div><div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl bg-white shadow-sm text-xs"><span className="font-bold">Small (SM)</span><span className="font-black text-[#e20074] text-lg">{activeModalData.data.sm}</span></div></div><div className="p-5 bg-white text-center font-black text-[#e20074] border-t text-sm shadow-inner">TOTAL TERJUAL: <span className="text-xl">{activeModalData.data.totalPerBulan}</span> Pcs</div></div></div> )}
          {activeModalData?.type === 'sakit' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden anim-pop-in shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center"><h3 className="font-black uppercase text-sm">Absensi Sakit</h3><button onClick={() => setActiveModalData(null)} className="bg-white/20 p-1.5 rounded-xl">✕</button></div><div className="p-4 bg-gray-50 border-b text-center text-xs font-black text-gray-600 tracking-widest uppercase">{activeModalData.data.bulan}</div><div className="p-5 max-h-[50vh] overflow-y-auto space-y-4">{activeModalData.data.details.map((det, i) => (<div key={i} className="p-4 border border-blue-100 rounded-2xl bg-white shadow-sm text-[11px] space-y-2 border-l-[5px] border-l-blue-500"><div className="flex justify-between font-bold text-gray-800 bg-gray-50 px-3 py-2 rounded-lg"><span>Libur: <span className="text-blue-600">{det.tglTidakMasuk}</span></span><span>Masuk: <span className="text-green-600">{det.tglMulaiMasuk}</span></span></div><div className="mt-2"><span className="text-[9px] bg-blue-100 text-blue-800 font-black px-2.5 py-1 rounded-md uppercase">{det.keterangan}</span></div><p className="text-gray-700 font-medium"><span className="font-bold text-gray-900">Diagnosa:</span> {det.diagnosa}</p><div className="pt-2 mt-2 border-t border-dashed"><p className="text-gray-500 text-[10px] italic"><span className="font-bold text-gray-600 not-italic">Klinik:</span> {det.klinik}</p></div></div>))}</div><div className="p-5 bg-white text-center font-black text-[#e20074] border-t text-sm shadow-inner">TOTAL FREKUENSI: <span className="text-xl">{activeModalData.data.totalPerBulan}x</span></div></div></div> )}
          {activeModalData?.type === 'shortage' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden anim-pop-in shadow-2xl"><div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center"><h3 className="font-black uppercase text-sm">Detail Shortage</h3><button onClick={() => setActiveModalData(null)} className="bg-white/20 p-1.5 rounded-xl">✕</button></div><div className="p-5 bg-gray-50 border-b flex flex-col gap-4"><div className="font-black text-gray-600 text-xs text-center tracking-widest uppercase">{activeModalData.data.bulan}</div><div className="flex justify-between w-full gap-3"><div className="bg-red-50 p-3 rounded-2xl flex-1 text-center border border-red-100 shadow-sm"><p className="text-[10px] text-red-500 font-extrabold uppercase tracking-wide">Total Short</p><p className="font-black text-lg text-red-600 mt-1">{activeModalData.data.totalShort === 0 ? '0' : activeModalData.data.totalShort.toLocaleString('id-ID')}</p></div><div className="bg-green-50 p-3 rounded-2xl flex-1 text-center border border-green-100 shadow-sm"><p className="text-[10px] text-green-600 font-extrabold uppercase tracking-wide">Total Over</p><p className="font-black text-lg text-green-600 mt-1">{activeModalData.data.totalOver === 0 ? '0' : '+' + activeModalData.data.totalOver.toLocaleString('id-ID')}</p></div></div></div><div className="p-5 max-h-[50vh] overflow-y-auto space-y-3">{activeModalData.data.details.map((det, i) => { let valColor = det.nominal < 0 ? 'text-red-600' : (det.nominal > 0 ? 'text-green-600' : 'text-gray-600'); let valBg = det.nominal < 0 ? 'bg-red-50 border-red-200' : (det.nominal > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'); let valLabel = det.nominal < 0 ? 'Minus' : (det.nominal > 0 ? 'Plus' : 'Pas'); let tanda = det.nominal > 0 ? '+' : ''; return (<div key={i} className={`flex justify-between items-center p-4 border rounded-2xl shadow-sm text-[11px] ${valBg}`}><div><p className="font-extrabold text-gray-900 text-xs mb-1">{det.tgl}</p><p className="text-[9px] text-gray-600 uppercase font-bold bg-white/60 inline-block px-2 py-1 rounded-md">POS: {det.pos} • {det.shift}</p></div><div className="text-right"><span className="text-[9px] bg-white/80 px-2.5 py-1 rounded-lg font-bold text-gray-600 uppercase shadow-sm">{valLabel}</span><p className={`font-black mt-2 text-sm ${valColor}`}>{tanda}{det.nominal.toLocaleString('id-ID')}</p></div></div>); })}</div></div></div> )}
          {activeModalData?.type === 'sp' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden anim-pop-in shadow-2xl"><div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white flex justify-between items-center"><h3 className="font-black uppercase text-sm">Detail SP/BA</h3><button onClick={() => setActiveModalData(null)} className="bg-white/20 p-1.5 rounded-xl">✕</button></div><div className="p-4 bg-orange-50/30 border-b text-center text-xs font-black text-orange-900 tracking-widest uppercase">{activeModalData.data.bulan}</div><div className="p-5 max-h-[50vh] overflow-y-auto space-y-4">{activeModalData.data.details.map((det, i) => (<div key={i} className="p-4 border border-orange-100 rounded-2xl bg-white shadow-sm text-[11px] space-y-2.5 border-l-[5px] border-l-orange-500"><div className="flex justify-between items-center font-bold text-gray-800 border-b pb-2"><span className="text-xs">{det.tanggal}</span><span className="text-[9px] bg-orange-100 text-orange-800 font-black px-2.5 py-1 rounded-md uppercase">{det.surat}</span></div><p className="text-gray-700 font-medium mt-2"><span className="font-bold text-gray-900 block text-[10px] uppercase text-gray-400">Pelanggaran:</span> {det.jenis}</p><p className="text-gray-700 bg-gray-50 p-2.5 rounded-lg border"><span className="font-bold text-gray-900 block text-[10px] uppercase text-gray-400 mb-0.5">Remarks:</span> {det.remarks}</p><div className="pt-1 mt-2 flex items-center gap-1.5"><span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1"><span className="w-3 h-3 bg-orange-100 rounded-full inline-block"></span> PIC: {det.under}</span></div></div>))}</div><div className="p-5 bg-white text-center font-black text-orange-600 border-t text-sm shadow-inner">TOTAL KASUS: <span className="text-xl">{activeModalData.data.totalPerBulan}x</span></div></div></div> )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#f8f9fc] anim-fade-in relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-pink-300 rounded-full opacity-20 blur-[80px]"></div>
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#e20074] rounded-full opacity-10 blur-[100px]"></div>

          <div className="glass-card p-10 rounded-[3rem] shadow-[0_20px_50px_-10px_rgba(226,0,116,0.15)] w-full max-w-[360px] text-center border relative z-10 anim-slide-up">
            <div className="bg-gradient-to-br from-[#e20074] to-[#ff1a8c] w-24 h-24 rounded-[1.5rem] mx-auto flex items-center justify-center mb-8 shadow-xl shadow-pink-500/30 transform transition-transform hover:scale-105 hover:rotate-3 duration-300">
               <span className="text-white font-black text-3xl tracking-tighter drop-shadow-md">AEON</span>
            </div>
            <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Dashboard</h2>
            <p className="text-gray-500 text-[13px] font-medium mb-10 tracking-wide uppercase">Login to access CCM DPM</p>
            
            <div className="space-y-4">
              <div className="relative group">
                <input type="text" placeholder="Masukkan NIK" value={nik} onChange={(e) => setNik(e.target.value)} className="w-full pl-5 pr-4 py-4.5 rounded-2xl bg-gray-50/80 border-2 border-transparent outline-none focus:border-pink-400 focus:bg-white transition-all duration-300 text-sm text-gray-900 font-bold placeholder:text-gray-400 placeholder:font-medium shadow-inner" />
              </div>
              <div className="relative group">
                <input type="password" placeholder="ID Swipe (Password)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-5 pr-4 py-4.5 rounded-2xl bg-gray-50/80 border-2 border-transparent outline-none focus:border-pink-400 focus:bg-white transition-all duration-300 text-sm text-gray-900 font-bold placeholder:text-gray-400 placeholder:font-medium shadow-inner" />
              </div>
            </div>

            <button onClick={prosesLogin} disabled={loading} className="mt-10 bg-gradient-to-r from-[#e20074] to-[#ff1a8c] text-white font-black py-4.5 px-6 rounded-2xl w-full shadow-lg shadow-pink-500/30 hover:shadow-pink-500/50 hover:-translate-y-1 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 tracking-wide text-[13px] uppercase">
              {loading ? "MEMVERIFIKASI..." : "Masuk Sekarang"}
            </button>
          </div>
          <p className="absolute bottom-6 text-[10px] text-gray-400 font-medium tracking-widest uppercase">© 2026 CCM AEON DPM</p>
        </div>
      )}
    </>
  );
}
