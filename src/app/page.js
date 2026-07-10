"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function App() {
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // State untuk interaksi animasi karakter
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isTicklish, setIsTicklish] = useState(false);
  const [eyePos, setEyePos] = useState({ x: 0, y: 0 });
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  const [stats, setStats] = useState({ member: 0, ecobag: 0, shortage: 0, sp: 0, sakit: 0, audit: '-' });
  const [history, setHistory] = useState({ member: [], shortage: [], ecobag: [], sakit: [], sp: [] });
  
  const [detailType, setDetailType] = useState(null);
  const [activeModalData, setActiveModalData] = useState(null);

  // --- LOGIKA MATA MENGIKUTI KURSOR / SENTUHAN ---
  useEffect(() => {
    const handleMove = (e) => {
      // Jika sedang tutup mata, matikan sensor
      if (isPasswordFocused) return; 

      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);

      if (clientX === undefined || clientY === undefined) return;

      // Kalkulasi pergerakan mata (Maksimal bergeser 3px ke segala arah agar tidak lepas dari wajah)
      const moveX = (clientX / window.innerWidth - 0.5) * 6; 
      const moveY = (clientY / window.innerHeight - 0.5) * 6; 
      
      setEyePos({ x: moveX, y: moveY });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
    };
  }, [isPasswordFocused]);

  // --- LOGIKA ANIMASI GELI SAAT DIKLIK ---
  const handleLogoClick = () => {
    if (isTicklish) return;
    setIsTicklish(true);
    // Kembalikan ke keadaan semula setelah animasi selesai (600ms)
    setTimeout(() => setIsTicklish(false), 600);
  };

  useEffect(() => {
    if (isLoggedIn && user) fetchDashboardData();
  }, [isLoggedIn, user]);

  const fetchDashboardData = async () => {
    try {
      const fetchUserRecords = async (table, column) => {
        let all = [];
        let from = 0;
        const step = 1000;
        while (true) {
          const { data, error } = await supabase.from(table).select('*').eq(column, user.nama).range(from, from + step - 1);
          if (error) { console.error(`Error fetch ${table}:`, error); break; }
          if (data && data.length > 0) {
            all = [...all, ...data];
            if (data.length < step) break; 
            from += step;
          } else {
            break;
          }
        }
        return all;
      };

      // 1. DATA MEMBER
      const memberData = await fetchUserRecords('member_per_day', 'nama');
      let totalMember = 0; let memberGroups = {};
      if (memberData && memberData.length > 0) {
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

      // 2. DATA SHORTAGE
      const shortagePagi = await fetchUserRecords('shortage_per_day', 'nama');
      const shortageSiang = await fetchUserRecords('shortage_per_day', 'nama_1');
      let shortGroups = {}; let totalShortage = 0;
      const processShortage = (data, isPagi) => {
        if (!data || data.length === 0) return;
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

      // 3. DATA ECOBAG
      const ecobagData = await fetchUserRecords('ecobag_per_day', 'staff_name');
      let totalEcobag = 0; let ecobagList = [];
      if (ecobagData && ecobagData.length > 0) {
        ecobagData.forEach(row => {
          const qtyTotal = parseInt(row.total) || 0; totalEcobag += qtyTotal;
          ecobagList.push({ bulan: row.year_month || row.month, la: parseInt(row.bag_la) || 0, me: parseInt(row.bag_me) || 0, sm: parseInt(row.bag_sm) || 0, totalPerBulan: qtyTotal });
        });
        ecobagList.sort((a, b) => b.bulan.localeCompare(a.bulan)); 
      }

      // 4. DATA SAKIT
      const sakitData = await fetchUserRecords('sakit_per_day', 'nama');
      let totalSakit = 0; let sakitGroups = {};
      if (sakitData && sakitData.length > 0) {
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

      // 5. DATA SP/BA
      const spbaData = await fetchUserRecords('sp_ba_per_day', 'nama');
      let totalSp = 0; let spGroups = {};
      if (spbaData && spbaData.length > 0) {
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

    } catch (err) {
      console.error("Gagal menarik data:", err);
    }
  };

  const prosesLogin = async () => {
    if (!nik || !password) { 
      alert("Wajib isi NIK & ID Swipe!"); 
      return; 
    }
    
    setLoading(true);
    const { data: userData, error } = await supabase.from('nik').select('*').eq('nik', nik).eq('id_swipe', password).single();
    
    if (error) { 
      await supabase.from('log_login').insert([{ nik: nik, nama: '-', status: 'LOGIN FAILED: Wrong NIK/Password' }]);
      alert("Login Gagal: NIK atau ID Swipe salah."); 
      setLoading(false); 
      return; 
    }

    await supabase.from('log_login').insert([{ nik: userData.nik, nama: userData.nama, status: 'LOGIN SUCCESS' }]);
    setUser(userData); 
    setIsLoggedIn(true); 
    setLoading(false);
  };

  const prosesLogout = async () => {
    if(confirm("Yakin ingin keluar dari portal?")) {
      if (user) {
        await supabase.from('log_login').insert([{ nik: user.nik, nama: user.nama, status: 'LOGOUT' }]);
      }
      setIsLoggedIn(false); 
      setUser(null); 
      setNik(""); 
      setPassword("");
      setStats({ member: 0, ecobag: 0, shortage: 0, sp: 0, sakit: 0, audit: '-' });
      setDetailType(null); 
      setActiveModalData(null);
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
        @keyframes slideUpFade { 
          0% { opacity: 0; transform: translateY(30px); } 
          100% { opacity: 1; transform: translateY(0); } 
        }
        @keyframes popIn { 
          0% { opacity: 0; transform: scale(0.9); } 
          100% { opacity: 1; transform: scale(1); } 
        }
        @keyframes fadeInScale { 
          0% { opacity: 0; transform: scale(0.95); } 
          100% { opacity: 1; transform: scale(1); } 
        }
        @keyframes floating {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes tickle {
          0%, 100% { transform: scale(1) rotate(0deg); }
          15% { transform: scale(1.15) rotate(-15deg); }
          30% { transform: scale(1.15) rotate(15deg); }
          45% { transform: scale(1.15) rotate(-15deg); }
          60% { transform: scale(1.15) rotate(15deg); }
          75% { transform: scale(1.15) rotate(-15deg); }
        }
        .anim-slide-up { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-pop-in { animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .anim-fade-in { animation: fadeInScale 0.5s ease-out forwards; }
        .anim-floating { animation: floating 3.5s ease-in-out infinite; }
        .anim-tickle { animation: tickle 0.6s ease-in-out; }
        .glass-card { 
          background: rgba(255, 255, 255, 0.85); 
          backdrop-filter: blur(12px); 
          -webkit-backdrop-filter: blur(12px); 
          border: 1px solid rgba(255,255,255,0.6); 
        }
        body { overflow: ${activeModalData ? 'hidden' : 'auto'}; }
      `}</style>

      {isLoggedIn ? (
        <>
          {/* HALAMAN UTAMA DASHBOARD KASIR (TETAP PREMIUM) */}
          <div className="min-h-screen bg-[#f8f9fc] font-sans text-[#1a1a1a] pb-12 overflow-x-hidden anim-fade-in relative z-0">
            
            <div className="bg-gradient-to-br from-[#e20074] to-[#ff1a8c] pt-14 pb-28 px-6 rounded-b-[2.5rem] shadow-[0_10px_40px_-10px_rgba(226,0,116,0.5)] text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20"></div>
              
              <div className="flex items-center justify-between mb-10 relative z-10">
                <div>
                  <h3 className="font-bold opacity-80 uppercase tracking-widest text-[10px] mb-1">Staff Performance</h3>
                  <p className="text-xl font-extrabold tracking-tight">Halo, Kasir!</p>
                </div>
                <button onClick={prosesLogout} className="bg-white/20 hover:bg-white/30 backdrop-blur-md p-3.5 rounded-2xl transition-all duration-300 active:scale-90 shadow-sm">
                  <svg style={{width:"20px",height:"20px"}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>

              <div className="flex items-start gap-5 relative z-10">
                <div className="relative group shrink-0 bg-white/10 rounded-3xl p-1 shadow-2xl">
                  <img 
                    src={getPhotoUrl()} 
                    onError={(e) => { e.currentTarget.src = fallbackAvatar; }} 
                    referrerPolicy="no-referrer" 
                    className="w-24 h-24 object-cover rounded-[1.2rem] border-2 border-white/40 bg-white/20 transition-transform duration-300 group-hover:scale-105" 
                    alt="Foto Profil" 
                  />
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
                <div onClick={() => setDetailType(detailType === 'member' ? null : 'member')} className="glass-card border border-white/50 p-6 rounded-[2rem] shadow-lg shadow-pink-500/5 border-b-4 border-b-pink-500 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-pink-500/10 cursor-pointer active:scale-95 group">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[11px] text-gray-500 uppercase font-extrabold tracking-wider group-hover:text-pink-500 transition-colors">Member</p>
                    <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-pink-500 group-hover:scale-110 transition-transform">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-gray-800">{stats.member}</h3>
                </div>
                
                <div onClick={() => setDetailType(detailType === 'ecobag' ? null : 'ecobag')} className="glass-card border border-white/50 p-6 rounded-[2rem] shadow-lg shadow-[#e20074]/5 border-b-4 border-b-[#e20074] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-[#e20074]/10 cursor-pointer active:scale-95 group">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[11px] text-gray-500 uppercase font-extrabold tracking-wider group-hover:text-[#e20074] transition-colors">Ecobag</p>
                    <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-[#e20074] group-hover:scale-110 transition-transform">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/></svg>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-gray-800">{stats.ecobag}</h3>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 anim-slide-up delay-100">
                <div onClick={() => setDetailType(detailType === 'shortage' ? null : 'shortage')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-t-red-400 cursor-pointer active:scale-90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-red-500/10 border border-white/50 group">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide group-hover:text-red-500">Shortage</p>
                  <h4 className="text-base font-black text-red-500 mt-1">{stats.shortage}</h4>
                </div>
                <div onClick={() => setDetailType(detailType === 'sp' ? null : 'sp')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-t-orange-400 cursor-pointer active:scale-90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-orange-500/10 border border-white/50 group">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide group-hover:text-orange-500">SP/BA</p>
                  <h4 className="text-base font-black text-orange-600 mt-1">{stats.sp}</h4>
                </div>
                <div onClick={() => setDetailType(detailType === 'sakit' ? null : 'sakit')} className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-t-blue-400 cursor-pointer active:scale-90 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10 border border-white/50 group">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide group-hover:text-blue-500">Sakit/Izin</p>
                  <h4 className="text-base font-black text-blue-500 mt-1">{stats.sakit}</h4>
                </div>
                <div className="glass-card py-5 rounded-[1.5rem] text-center border-t-[3px] border-t-purple-400 cursor-default border border-white/50 opacity-80">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Audit</p>
                  <h4 className="text-base font-black text-purple-600 mt-1">{stats.audit}</h4>
                </div>
              </div>

              {/* TABEL RANGKUMAN */}
              {detailType && (
                <div className="glass-card p-6 rounded-[2.5rem] mt-6 shadow-xl shadow-gray-200/50 border border-white/60 anim-pop-in">
                  <div className="flex justify-between items-center mb-5">
                    <h4 className="font-black text-gray-800 text-sm uppercase tracking-wide">Tabel {detailType}</h4>
                    <button onClick={() => setDetailType(null)} className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-xl text-gray-500 transition-colors active:scale-90">✕</button>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white/50">
                    <table className="w-full text-[11px] text-left min-w-[300px]">
                        <thead className="bg-gray-50 text-[#e20074] font-extrabold border-b border-gray-100 uppercase tracking-wider text-[9px]">
                          {(detailType === 'member' || detailType === 'ecobag') && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Total</th></tr>)}
                          {detailType === 'sakit' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Frekuensi Absen</th></tr>)}
                          {detailType === 'sp' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-right'>Total Pelanggaran</th></tr>)}
                          {detailType === 'shortage' && (<tr><th className='p-4'>Bulan</th><th className='p-4 text-center'>Freq</th><th className='p-4 text-right'>Short</th><th className='p-4 text-right'>Over</th></tr>)}
                        </thead>
                        <tbody className="text-gray-700">
                          {detailType === 'member' && history.member.map((item, idx) => (
                            <tr key={idx} onClick={() => setActiveModalData({ type: 'member', data: item })} className='hover:bg-pink-50 border-b border-gray-50 cursor-pointer transition-colors active:bg-pink-100'>
                              <td className='p-4 font-bold'>{item.bulan}</td>
                              <td className='p-4 text-right font-black text-lg'>{item.totalPerBulan}</td>
                            </tr>
                          ))}
                          {detailType === 'ecobag' && history.ecobag.map((item, idx) => (
                            <tr key={idx} onClick={() => setActiveModalData({ type: 'ecobag', data: item })} className='hover:bg-pink-50 border-b border-gray-50 cursor-pointer transition-colors active:bg-pink-100'>
                              <td className='p-4 font-bold'>{item.bulan}</td>
                              <td className='p-4 text-right font-black text-[#e20074] text-lg'>{item.totalPerBulan} <span className="text-[10px]">Pcs</span></td>
                            </tr>
                          ))}
                          {detailType === 'sakit' && history.sakit.map((item, idx) => (
                            <tr key={idx} onClick={() => setActiveModalData({ type: 'sakit', data: item })} className='hover:bg-blue-50 border-b border-gray-50 cursor-pointer transition-colors active:bg-blue-100'>
                              <td className='p-4 font-bold'>{item.bulan}</td>
                              <td className='p-4 text-right font-black text-blue-600 text-lg'>{item.totalPerBulan}x <span className="text-[10px]">Absen</span></td>
                            </tr>
                          ))}
                          {detailType === 'sp' && history.sp.map((item, idx) => (
                            <tr key={idx} onClick={() => setActiveModalData({ type: 'sp', data: item })} className='hover:bg-orange-50 border-b border-gray-50 cursor-pointer transition-colors active:bg-orange-100'>
                              <td className='p-4 font-bold'>{item.bulan}</td>
                              <td className='p-4 text-right font-black text-orange-600 text-lg'>{item.totalPerBulan}x <span className="text-[10px]">Pelanggaran</span></td>
                            </tr>
                          ))}
                          {detailType === 'shortage' && history.shortage.map((item, idx) => (
                            <tr key={idx} onClick={() => setActiveModalData({ type: 'shortage', data: item })} className='hover:bg-red-50 border-b border-gray-50 cursor-pointer transition-colors active:bg-red-100'>
                              <td className='p-4 font-bold'>{item.bulan}</td>
                              <td className='p-4 text-center font-bold text-gray-500 bg-gray-50/50'>{item.frekuensi}x</td>
                              <td className='p-4 text-right font-black text-red-600 text-sm'>{item.totalShort === 0 ? '-' : item.totalShort.toLocaleString('id-ID')}</td>
                              <td className='p-4 text-right font-black text-green-600 text-sm'>{item.totalOver === 0 ? '-' : '+' + item.totalOver.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                          {history[detailType]?.length === 0 && (
                            <tr><td colSpan="4" className="p-8 text-center text-gray-400 font-medium">Belum ada data tercatat.</td></tr>
                          )}
                        </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* MODAL POP-UP */}
          {activeModalData?.type === 'member' && ( 
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-xs rounded-[2.5rem] overflow-hidden shadow-2xl anim-pop-in">
                <div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-wider">Detail Member</h3>
                  <button onClick={() => setActiveModalData(null)} className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors active:scale-90">✕</button>
                </div>
                <div className="p-4 bg-pink-50/50 border-b text-center text-xs font-black text-pink-900 tracking-widest uppercase">{activeModalData.data.bulan}</div>
                <div className="p-5 max-h-[50vh] overflow-y-auto space-y-2.5 bg-gray-50/30">
                  {activeModalData.data.details.map((det, i) => (
                    <div key={i} className="flex justify-between items-center p-3.5 border border-gray-100 rounded-2xl bg-white shadow-sm text-[11px] hover:border-pink-200 transition-colors">
                      <span className="font-bold text-gray-600">{det.tgl}</span>
                      <span className="font-black text-[#e20074] bg-pink-50 px-3 py-1.5 rounded-lg">{det.qty} Member</span>
                    </div>
                  ))}
                </div>
                <div className="p-5 bg-white text-center font-black text-[#e20074] border-t text-lg shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                  TOTAL: {activeModalData.data.totalPerBulan}
                </div>
              </div>
            </div> 
          )}
          
          {activeModalData?.type === 'ecobag' && ( 
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-xs rounded-[2.5rem] overflow-hidden shadow-2xl anim-pop-in">
                <div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-wider">Rincian Ecobag</h3>
                  <button onClick={() => setActiveModalData(null)} className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors active:scale-90">✕</button>
                </div>
                <div className="p-4 bg-pink-50/50 border-b text-center text-xs font-black text-pink-900 tracking-widest uppercase">{activeModalData.data.bulan}</div>
                <div className="p-6 space-y-3.5 bg-gray-50/30">
                  <div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl bg-white shadow-sm text-xs hover:border-pink-200 transition-colors">
                    <span className="font-bold text-gray-600">Size Large (LA)</span>
                    <span className="font-black text-[#e20074] text-lg">{activeModalData.data.la}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl bg-white shadow-sm text-xs hover:border-pink-200 transition-colors">
                    <span className="font-bold text-gray-600">Size Medium (ME)</span>
                    <span className="font-black text-[#e20074] text-lg">{activeModalData.data.me}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 border border-gray-100 rounded-2xl bg-white shadow-sm text-xs hover:border-pink-200 transition-colors">
                    <span className="font-bold text-gray-600">Size Small (SM)</span>
                    <span className="font-black text-[#e20074] text-lg">{activeModalData.data.sm}</span>
                  </div>
                </div>
                <div className="p-5 bg-white text-center font-black text-[#e20074] border-t text-sm shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                  TOTAL TERJUAL: <span className="text-xl">{activeModalData.data.totalPerBulan}</span> Pcs
                </div>
              </div>
            </div> 
          )}
          
          {activeModalData?.type === 'sakit' && ( 
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl anim-pop-in">
                <div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-wider">Absensi Sakit/Izin</h3>
                  <button onClick={() => setActiveModalData(null)} className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors active:scale-90">✕</button>
                </div>
                <div className="p-4 bg-gray-50 border-b text-center text-xs font-black text-gray-600 tracking-widest uppercase">{activeModalData.data.bulan}</div>
                <div className="p-5 max-h-[50vh] overflow-y-auto space-y-4 bg-gray-50/50">
                  {activeModalData.data.details.map((det, i) => (
                    <div key={i} className="p-4 border border-blue-100 rounded-2xl bg-white shadow-sm text-[11px] space-y-2 border-l-[5px] border-l-blue-500 hover:shadow-md transition-shadow">
                      <div className="flex justify-between font-bold text-gray-800 bg-gray-50 px-3 py-2 rounded-lg">
                        <span>Libur: <span className="text-blue-600">{det.tglTidakMasuk}</span></span>
                        <span>Masuk: <span className="text-green-600">{det.tglMulaiMasuk}</span></span>
                      </div>
                      <div className="mt-2">
                        <span className="text-[9px] bg-blue-100 text-blue-800 font-black px-2.5 py-1 rounded-md uppercase tracking-wider inline-block mb-1">{det.keterangan}</span>
                      </div>
                      <p className="text-gray-700 font-medium leading-relaxed"><span className="font-bold text-gray-900">Diagnosa:</span> {det.diagnosa}</p>
                      <div className="pt-2 mt-2 border-t border-dashed"><p className="text-gray-500 text-[10px] italic"><span className="font-bold text-gray-600 not-italic">Klinik:</span> {det.klinik}</p></div>
                    </div>
                  ))}
                </div>
                <div className="p-5 bg-white text-center font-black text-[#e20074] border-t shadow-[0_-10px_20px_rgba(0,0,0,0.02)] text-sm">
                  TOTAL FREKUENSI: <span className="text-xl">{activeModalData.data.totalPerBulan}x</span>
                </div>
              </div>
            </div> 
          )}
          
          {activeModalData?.type === 'shortage' && ( 
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl anim-pop-in">
                <div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] p-6 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-wider">Detail Short/Over</h3>
                  <button onClick={() => setActiveModalData(null)} className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors active:scale-90">✕</button>
                </div>
                <div className="p-5 bg-gray-50 border-b flex flex-col gap-4">
                  <div className="font-black text-gray-600 text-xs text-center tracking-widest uppercase">{activeModalData.data.bulan}</div>
                  <div className="flex justify-between w-full gap-3">
                    <div className="bg-red-50 p-3 rounded-2xl flex-1 text-center border border-red-100 shadow-sm">
                      <p className="text-[10px] text-red-500 font-extrabold uppercase tracking-wide">Total Short</p>
                      <p className="font-black text-lg text-red-600 mt-1">{activeModalData.data.totalShort === 0 ? '0' : activeModalData.data.totalShort.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-2xl flex-1 text-center border border-green-100 shadow-sm">
                      <p className="text-[10px] text-green-600 font-extrabold uppercase tracking-wide">Total Over</p>
                      <p className="font-black text-lg text-green-600 mt-1">{activeModalData.data.totalOver === 0 ? '0' : '+' + activeModalData.data.totalOver.toLocaleString('id-ID')}</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 max-h-[50vh] overflow-y-auto space-y-3 bg-gray-50/50">
                  {activeModalData.data.details.map((det, i) => { 
                    let valColor = det.nominal < 0 ? 'text-red-600' : (det.nominal > 0 ? 'text-green-600' : 'text-gray-600'); 
                    let valBg = det.nominal < 0 ? 'bg-red-50 border-red-200' : (det.nominal > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'); 
                    let valLabel = det.nominal < 0 ? 'Minus' : (det.nominal > 0 ? 'Plus' : 'Pas'); 
                    let tanda = det.nominal > 0 ? '+' : ''; 
                    return (
                      <div key={i} className={`flex justify-between items-center p-4 border rounded-2xl shadow-sm text-[11px] hover:shadow-md transition-shadow ${valBg}`}>
                        <div>
                          <p className="font-extrabold text-gray-900 text-xs mb-1">{det.tgl}</p>
                          <p className="text-[9px] text-gray-600 uppercase font-bold bg-white/60 inline-block px-2 py-1 rounded-md">POS: {det.pos} • SHIFT: <span className="text-gray-900">{det.shift}</span></p>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] bg-white/80 px-2.5 py-1 rounded-lg font-bold text-gray-600 uppercase shadow-sm">{valLabel}</span>
                          <p className={`font-black mt-2 text-sm ${valColor}`}>{tanda}{det.nominal.toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                    ); 
                  })}
                </div>
              </div>
            </div> 
          )}
          
          {activeModalData?.type === 'sp' && ( 
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl anim-pop-in">
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm uppercase tracking-wider">Detail SP / BA</h3>
                  <button onClick={() => setActiveModalData(null)} className="p-1.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors active:scale-90">✕</button>
                </div>
                <div className="p-4 bg-orange-50/30 border-b text-center text-xs font-black text-orange-900 tracking-widest uppercase">{activeModalData.data.bulan}</div>
                <div className="p-5 max-h-[50vh] overflow-y-auto space-y-4 bg-gray-50/50">
                  {activeModalData.data.details.map((det, i) => (
                    <div key={i} className="p-4 border border-orange-100 rounded-2xl bg-white shadow-sm text-[11px] space-y-2.5 border-l-[5px] border-l-orange-500 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-center font-bold text-gray-800 border-b pb-2">
                        <span className="text-xs">{det.tanggal}</span>
                        <span className="text-[9px] bg-orange-100 text-orange-800 font-black px-2.5 py-1 rounded-md uppercase tracking-wider">{det.surat}</span>
                      </div>
                      <p className="text-gray-700 font-medium leading-relaxed mt-2"><span className="font-bold text-gray-900 block mb-0.5 text-[10px] uppercase tracking-wide text-gray-400">Pelanggaran:</span> {det.jenis}</p>
                      <p className="text-gray-700 font-medium leading-relaxed bg-gray-50 p-2.5 rounded-lg"><span className="font-bold text-gray-900 block mb-0.5 text-[10px] uppercase tracking-wide text-gray-400">Remarks:</span> {det.remarks}</p>
                      <div className="pt-1 mt-2 flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-orange-100 rounded-full flex items-center justify-center text-orange-500">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>
                        </div>
                        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide">PIC Under: <span className="text-gray-800">{det.under}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-5 bg-white text-center font-black text-orange-600 border-t shadow-[0_-10px_20px_rgba(0,0,0,0.02)] text-sm">
                  TOTAL KASUS: <span className="text-xl">{activeModalData.data.totalPerBulan}x</span>
                </div>
              </div>
            </div> 
          )}
        </>
      ) : (
        /* HALAMAN LOGIN BARU (MINIMALIS DENGAN ANIMASI KARAKTER LUCU) */
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#f4f6f9] anim-fade-in overflow-hidden">
          
          <div className="bg-white px-10 pt-16 pb-10 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-[380px] text-center anim-slide-up border border-gray-100 relative">
            
            {/* Karakter Animasi Login */}
            <div className="relative w-20 h-20 mx-auto mb-8 mt-2 anim-floating">
              
              {/* Wajah / Kepala */}
              <div className={`absolute left-1/2 -translate-x-1/2 w-16 h-12 bg-pink-100 rounded-t-[2rem] flex flex-col items-center pt-2.5 z-0 transition-all duration-300 ease-in-out border-2 border-pink-200 ${isPasswordFocused ? '-top-5' : '-top-8'}`}>
                
                {/* Mata dengan efek Eye Tracking */}
                <div className="flex gap-3 mb-1.5 relative">
                  <div 
                    style={{ transform: isPasswordFocused ? 'none' : `translate(${eyePos.x}px, ${eyePos.y}px)` }}
                    className={`w-2 h-2.5 bg-gray-800 rounded-full transition-all duration-75 ${isPasswordFocused ? 'h-0.5 mt-1 opacity-0' : 'opacity-100'}`}
                  ></div>
                  <div 
                    style={{ transform: isPasswordFocused ? 'none' : `translate(${eyePos.x}px, ${eyePos.y}px)` }}
                    className={`w-2 h-2.5 bg-gray-800 rounded-full transition-all duration-75 ${isPasswordFocused ? 'h-0.5 mt-1 opacity-0' : 'opacity-100'}`}
                  ></div>
                </div>

                {/* Mulut yang Bereaksi saat geli */}
                <div className={`border-gray-800 rounded-full transition-all duration-300 ${
                  isPasswordFocused ? 'scale-0' : 
                  isTicklish ? 'w-3.5 h-3.5 bg-gray-800 border-0' : 'w-3.5 h-1.5 border-b-2'
                }`}></div>
              </div>

              {/* Kotak AEON (Sensor Geli) */}
              <div 
                className={`bg-[#e20074] w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/20 relative z-10 cursor-pointer ${isTicklish ? 'anim-tickle' : ''}`}
                onClick={handleLogoClick}
                title="Gelitikin aku!"
              >
                 <span className="text-white font-black text-2xl tracking-tighter">AEON</span>
              </div>

              {/* Tangan Kiri */}
              <div className={`absolute w-6 h-8 bg-pink-100 border-2 border-pink-200 rounded-full transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] z-20 ${isPasswordFocused ? '-top-5 left-1.5 rotate-[40deg]' : 'top-6 -left-3 rotate-[-20deg]'}`}></div>
              
              {/* Tangan Kanan */}
              <div className={`absolute w-6 h-8 bg-pink-100 border-2 border-pink-200 rounded-full transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] z-20 ${isPasswordFocused ? '-top-5 right-1.5 -rotate-[40deg]' : 'top-6 -right-3 rotate-[20deg]'}`}></div>
            </div>
            
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1.5 tracking-tight">Dashboard CCM DPM</h2>
            <p className="text-gray-500 text-[13px] font-medium mb-8">Silakan login dengan NIK & ID Swipe</p>
            
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="NIK" 
                value={nik} 
                onChange={(e) => setNik(e.target.value)} 
                className="w-full px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-200 outline-none focus:bg-white focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-sm text-gray-900 font-semibold placeholder:text-gray-400 placeholder:font-medium relative z-30" 
              />
              <input 
                type="password" 
                placeholder="ID Swipe" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
                className="w-full px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-200 outline-none focus:bg-white focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-sm text-gray-900 font-semibold placeholder:text-gray-400 placeholder:font-medium relative z-30" 
              />
            </div>

            <button 
              onClick={prosesLogin} 
              disabled={loading} 
              className="mt-8 bg-[#e20074] hover:bg-[#c80066] text-white font-bold py-3.5 px-6 rounded-xl w-full shadow-lg shadow-pink-500/20 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 text-[13px] uppercase tracking-wide relative z-30"
            >
              {loading ? (
                <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> MEMVERIFIKASI...</>
              ) : "MASUK DASHBOARD"}
            </button>

          </div>

        </div>
      )}
    </>
  );
}
