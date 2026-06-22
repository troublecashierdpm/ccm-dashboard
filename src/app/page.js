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
      const finalMemberHistory = Object.values(memberGroups).sort((a, b) => b.bulan.localeCompare(a.bulan)).map(group => ({
        bulan: group.bulan, totalPerBulan: group.totalPerBulan,
        details: Object.keys(group.dailyMap).map(tgl => ({ tgl, qty: group.dailyMap[tgl] })).sort((a,b) => (parseInt(b.tgl.split('-')[0])||0) - (parseInt(a.tgl.split('-')[0])||0))
      }));

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
      const finalShortageHistory = Object.values(shortGroups).sort((a, b) => b.bulan.localeCompare(a.bulan)).map(group => {
        group.details.sort((a,b) => (parseInt(b.tgl.split('-')[0])||0) - (parseInt(a.tgl.split('-')[0])||0));
        return group;
      });

      const { data: ecobagData } = await supabase.from('ecobag_per_day').select('*').eq('staff_name', user.nama);
      let totalEcobag = 0; let ecobagList = [];
      if (ecobagData) {
        ecobagData.forEach(row => {
          const qtyTotal = parseInt(row.total) || 0; totalEcobag += qtyTotal;
          ecobagList.push({ bulan: row.year_month || row.month, la: parseInt(row.bag_la) || 0, me: parseInt(row.bag_me) || 0, sm: parseInt(row.bag_sm) || 0, totalPerBulan: qtyTotal });
        });
        ecobagList.sort((a, b) => b.bulan.localeCompare(a.bulan)); 
      }

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
      const finalSakitHistory = Object.values(sakitGroups).sort((a, b) => b.bulan.localeCompare(a.bulan)).map(group => {
        group.details.sort((a,b) => (parseInt(b.tglTidakMasuk.split('-')[0])||0) - (parseInt(a.tglTidakMasuk.split('-')[0])||0));
        return group;
      });

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
      const finalSpHistory = Object.values(spGroups).sort((a, b) => b.bulan.localeCompare(a.bulan)).map(group => {
        group.details.sort((a,b) => (parseInt(b.tanggal.split('-')[0])||0) - (parseInt(a.tanggal.split('-')[0])||0));
        return group;
      });

      setStats({ member: totalMember, shortage: totalShortage, ecobag: totalEcobag, sakit: totalSakit, sp: totalSp, audit: '-' });
      setHistory({ member: finalMemberHistory, shortage: finalShortageHistory, ecobag: ecobagList, sakit: finalSakitHistory, sp: finalSpHistory });
    } catch (err) { console.error(err); }
  };

  const prosesLogin = async () => {
    if (!nik || !password) { alert("Wajib isi NIK & ID Swipe!"); return; }
    setLoading(true);
    const { data: userData, error } = await supabase.from('nik').select('*').eq('nik', nik).eq('id_swipe', password).single();
    if (error) { 
      await supabase.from('log_login').insert([{ nik: nik, nama: '-', status: 'LOGIN FAILED' }]);
      alert("Login Gagal: NIK atau ID Swipe salah."); setLoading(false); return; 
    }
    await supabase.from('log_login').insert([{ nik: userData.nik, nama: userData.nama, status: 'LOGIN SUCCESS' }]);
    setUser(userData); setIsLoggedIn(true); setLoading(false);
  };

  const prosesLogout = async () => {
    if(confirm("Yakin ingin keluar dari portal?")) {
      if (user) await supabase.from('log_login').insert([{ nik: user.nik, nama: user.nama, status: 'LOGOUT' }]);
      setIsLoggedIn(false); setUser(null); setNik(""); setPassword("");
      setStats({ member: 0, ecobag: 0, shortage: 0, sp: 0, sakit: 0, audit: '-' });
      setDetailType(null); setActiveModalData(null);
    }
  };

  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.nama || 'A')}&background=FCE7F3&color=E20074&bold=true`;
  const getPhotoUrl = () => {
    if (user?.file_id && user.file_id.trim() !== '') return `https://drive.google.com/thumbnail?id=${user.file_id.trim()}&sz=w500`;
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
        <div className="min-h-screen bg-[#f8f9fc] font-sans text-[#1a1a1a] pb-12 overflow-x-hidden anim-fade-in relative z-0">
          <div className="bg-gradient-to-br from-[#e20074] to-[#ff1a8c] pt-14 pb-28 px-6 rounded-b-[2.5rem] shadow-lg text-white relative overflow-hidden">
            <div className="flex items-center justify-between mb-10 relative z-10">
              <div><h3 className="font-bold opacity-80 uppercase tracking-widest text-[10px] mb-1">Staff Performance</h3><p className="text-xl font-extrabold tracking-tight">Halo, Kasir!</p></div>
              <button onClick={prosesLogout} className="bg-white/20 hover:bg-white/30 p-3.5 rounded-2xl transition-all shadow-sm">✕ Logout</button>
            </div>
            <div className="flex items-start gap-5 relative z-10">
              <img src={getPhotoUrl()} onError={(e) => { e.currentTarget.src = fallbackAvatar; }} className="w-24 h-24 object-cover rounded-3xl border-2 border-white/40 bg-white/20" alt="Foto Profil" />
              <div className="flex-1 min-w-0 pt-1">
                <h1 className="text-xl sm:text-2xl font-black drop-shadow-md break-words">{user.nama}</h1>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-[10px] bg-black/25 px-3 py-1.5 rounded-xl">NIK: {user.nik}</span>
                  {user.join_date && <span className="text-[10px] bg-white/20 px-3 py-1.5 rounded-xl">Join: {user.join_date}</span>}
                  <span className="text-[10px] bg-gradient-to-r from-yellow-400 to-amber-500 text-amber-950 px-3 py-1.5 rounded-xl font-bold">Under: {user.under}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 -mt-12 space-y-4 relative z-20">
            <div className="grid grid-cols-2 gap-4 anim-slide-up">
              <div onClick={() => setDetailType(detailType === 'member' ? null : 'member')} className="glass-card p-6 rounded-[2rem] shadow-lg border-b-4 border-pink-500 cursor-pointer"><p className="text-[11px] text-gray-500 uppercase font-extrabold">Member</p><h3 className="text-3xl font-black">{stats.member}</h3></div>
              <div onClick={() => setDetailType(detailType === 'ecobag' ? null : 'ecobag')} className="glass-card p-6 rounded-[2rem] shadow-lg border-b-4 border-[#e20074] cursor-pointer"><p className="text-[11px] text-gray-500 uppercase font-extrabold">Ecobag</p><h3 className="text-3xl font-black">{stats.ecobag}</h3></div>
            </div>
            <div className="grid grid-cols-4 gap-3 anim-slide-up delay-100">
              <div onClick={() => setDetailType(detailType === 'shortage' ? null : 'shortage')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-red-400 cursor-pointer"><p className="text-[9px] font-bold text-gray-500">Shortage</p><h4 className="text-base font-black text-red-500">{stats.shortage}</h4></div>
              <div onClick={() => setDetailType(detailType === 'sp' ? null : 'sp')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-orange-400 cursor-pointer"><p className="text-[9px] font-bold text-gray-500">SP/BA</p><h4 className="text-base font-black text-orange-600">{stats.sp}</h4></div>
              <div onClick={() => setDetailType(detailType === 'sakit' ? null : 'sakit')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-blue-400 cursor-pointer"><p className="text-[9px] font-bold text-gray-500">Sakit/Izin</p><h4 className="text-base font-black text-blue-500">{stats.sakit}</h4></div>
              <div className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-purple-400 opacity-80"><p className="text-[9px] font-bold text-gray-400">Audit</p><h4 className="text-base font-black text-purple-600">{stats.audit}</h4></div>
            </div>

            {detailType && (
              <div className="glass-card p-6 rounded-[2.5rem] mt-6 shadow-xl anim-pop-in">
                <div className="flex justify-between items-center mb-5"><h4 className="font-black text-sm uppercase">Tabel {detailType}</h4><button onClick={() => setDetailType(null)} className="bg-gray-100 p-2.5 rounded-xl">✕</button></div>
                <div className="overflow-x-auto rounded-2xl border bg-white/50">
                  <table className="w-full text-[11px] text-left">
                      <thead className="bg-gray-50 text-[#e20074] border-b uppercase">
                        {(detailType === 'member' || detailType === 'ecobag') && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Total</th></tr>)}
                        {detailType === 'sakit' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Absen</th></tr>)}
                        {detailType === 'sp' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Kasus</th></tr>)}
                        {detailType === 'shortage' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-center'>Freq</th><th className='p-4 text-right'>Short</th><th className='p-4 text-right'>Over</th></tr>)}
                      </thead>
                      <tbody>
                        {detailType === 'member' && history.member.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'member', data: item })} className='border-b cursor-pointer'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-lg'>{item.totalPerBulan}</td></tr>))}
                        {detailType === 'ecobag' && history.ecobag.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'ecobag', data: item })} className='border-b cursor-pointer'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-[#e20074] text-lg'>{item.totalPerBulan}</td></tr>))}
                        {detailType === 'sakit' && history.sakit.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'sakit', data: item })} className='border-b cursor-pointer'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-blue-600 text-lg'>{item.totalPerBulan}x</td></tr>))}
                        {detailType === 'sp' && history.sp.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'sp', data: item })} className='border-b cursor-pointer'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-right font-black text-orange-600 text-lg'>{item.totalPerBulan}x</td></tr>))}
                        {detailType === 'shortage' && history.shortage.map((item, idx) => (<tr key={idx} onClick={() => setActiveModalData({ type: 'shortage', data: item })} className='border-b cursor-pointer'><td className='p-4 font-bold'>{item.bulan}</td><td className='p-4 text-center text-gray-500'>{item.frekuensi}x</td><td className='p-4 text-right font-black text-red-600'>{item.totalShort.toLocaleString('id-ID')}</td><td className='p-4 text-right font-black text-green-600'>+{item.totalOver.toLocaleString('id-ID')}</td></tr>))}
                      </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* MODAL POP UP BAWAH */}
          {activeModalData?.type === 'member' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-xs rounded-3xl overflow-hidden anim-pop-in"><div className="bg-[#e20074] p-5 text-white flex justify-between"><h3 className="font-black">Detail Member</h3><button onClick={() => setActiveModalData(null)}>✕</button></div><div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">{activeModalData.data.details.map((det, i) => (<div key={i} className="flex justify-between p-3 border rounded-xl"><span className="font-bold">{det.tgl}</span><span className="font-black text-[#e20074]">{det.qty} Member</span></div>))}</div></div></div> )}
          {activeModalData?.type === 'ecobag' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-xs rounded-3xl overflow-hidden anim-pop-in"><div className="bg-[#e20074] p-5 text-white flex justify-between"><h3 className="font-black">Detail Ecobag</h3><button onClick={() => setActiveModalData(null)}>✕</button></div><div className="p-4 space-y-3"><div className="flex justify-between border p-3 rounded-xl"><span className="font-bold">Large</span><span className="font-black text-[#e20074]">{activeModalData.data.la}</span></div><div className="flex justify-between border p-3 rounded-xl"><span className="font-bold">Medium</span><span className="font-black text-[#e20074]">{activeModalData.data.me}</span></div><div className="flex justify-between border p-3 rounded-xl"><span className="font-bold">Small</span><span className="font-black text-[#e20074]">{activeModalData.data.sm}</span></div></div></div></div> )}
          {activeModalData?.type === 'shortage' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-xs rounded-3xl overflow-hidden anim-pop-in"><div className="bg-[#e20074] p-5 text-white flex justify-between"><h3 className="font-black">Detail Shortage</h3><button onClick={() => setActiveModalData(null)}>✕</button></div><div className="p-4 max-h-[50vh] overflow-y-auto space-y-3">{activeModalData.data.details.map((det, i) => (<div key={i} className="flex justify-between p-3 border rounded-xl"><div><p className="font-bold">{det.tgl}</p><p className="text-[10px] text-gray-500">POS: {det.pos} | {det.shift}</p></div><p className="font-black mt-2 text-sm">{det.nominal}</p></div>))}</div></div></div> )}
          {activeModalData?.type === 'sakit' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden anim-pop-in"><div className="bg-[#e20074] p-5 text-white flex justify-between"><h3 className="font-black">Detail Sakit</h3><button onClick={() => setActiveModalData(null)}>✕</button></div><div className="p-4 max-h-[50vh] overflow-y-auto space-y-3">{activeModalData.data.details.map((det, i) => (<div key={i} className="p-3 border rounded-xl space-y-1"><p className="font-bold">Libur: {det.tglTidakMasuk} - Masuk: {det.tglMulaiMasuk}</p><p className="text-xs bg-blue-100 text-blue-600 inline-block px-2 rounded">{det.keterangan}</p><p className="text-xs">Diagnosa: {det.diagnosa}</p></div>))}</div></div></div> )}
          {activeModalData?.type === 'sp' && ( <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-6"><div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden anim-pop-in"><div className="bg-orange-500 p-5 text-white flex justify-between"><h3 className="font-black">Detail SP</h3><button onClick={() => setActiveModalData(null)}>✕</button></div><div className="p-4 max-h-[50vh] overflow-y-auto space-y-3">{activeModalData.data.details.map((det, i) => (<div key={i} className="p-3 border rounded-xl space-y-1"><p className="font-bold">{det.tanggal}</p><p className="text-xs bg-orange-100 text-orange-600 inline-block px-2 rounded">{det.surat}</p><p className="text-xs font-bold">Kasus: {det.jenis}</p></div>))}</div></div></div> )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#f8f9fc] anim-fade-in relative">
          <div className="glass-card p-10 rounded-[3rem] shadow-xl w-full max-w-[360px] text-center border relative z-10 anim-slide-up">
            <div className="bg-gradient-to-br from-[#e20074] to-[#ff1a8c] w-24 h-24 rounded-2xl mx-auto flex items-center justify-center mb-8"><span className="text-white font-black text-3xl">AEON</span></div>
            <h2 className="text-3xl font-black mb-2">Dashboard</h2>
            <p className="text-gray-500 text-[13px] font-medium mb-10 uppercase">Login to access CCM DPM</p>
            <div className="space-y-4">
              <input type="text" placeholder="Masukkan NIK" value={nik} onChange={(e) => setNik(e.target.value)} className="w-full p-4 rounded-2xl bg-gray-50 border outline-none font-bold" />
              <input type="password" placeholder="ID Swipe (Password)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 rounded-2xl bg-gray-50 border outline-none font-bold" />
            </div>
            <button onClick={prosesLogin} disabled={loading} className="mt-10 bg-[#e20074] text-white font-black py-4 px-6 rounded-2xl w-full">
              {loading ? "MEMVERIFIKASI..." : "Masuk Sekarang"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
