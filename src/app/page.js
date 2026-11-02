// src/app/page.js
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useActiveSession } from "@/lib/useActiveSession";
import { isSupervisorWhitelisted, isPicWhitelisted } from "@/lib/accessControl";

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Login States
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isFalling, setIsFalling] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [eyePos, setEyePos] = useState({ x: 0, y: 0 });

  useActiveSession(user, setUser, setIsLoggedIn);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data, error } = await supabase
          .from("log_login")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(20);
        if (!error && data) setLogs(data);
      } catch (err) { console.error(err); }
      finally { setLoadingLogs(false); }
    }
    fetchLogs();
  }, []);

  // --- LOGIKA MATA MENGIKUTI KURSOR / SENTUHAN ---
  useEffect(() => {
    if (isLoggedIn) return;
    const handleMove = (e) => {
      if (isPasswordFocused || isSuccess) return; 
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      if (clientX === undefined || clientY === undefined) return;
      const moveX = (clientX / window.innerWidth - 0.5) * 8; 
      const moveY = (clientY / window.innerHeight - 0.5) * 8; 
      setEyePos({ x: moveX, y: moveY });
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
    };
  }, [isPasswordFocused, isSuccess, isLoggedIn]);

  const handleLogoClick = () => {
    if (isFalling || isSuccess || isPasswordFocused) return;
    setIsFalling(true);
    setTimeout(() => setIsFalling(false), 1200); 
  };

  useEffect(() => {
    const savedUser = localStorage.getItem("ccm_user");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        const sessionStart = localStorage.getItem("session_start");
        const elapsed = Date.now() - parseInt(sessionStart || "0", 10);
        
        if (sessionStart && elapsed < 10 * 60 * 1000) {
          setUser(parsed);
          setIsLoggedIn(true);
        } else {
          localStorage.removeItem("ccm_user");
          localStorage.removeItem("ccm_sup");
          localStorage.removeItem("ccm_pic");
          localStorage.removeItem("session_start");
        }
      } catch (e) {
        localStorage.clear();
      }
    }
    setCheckingSession(false);
  }, []);

  const prosesLogin = async () => {
    if (!nik || !password) { 
      alert("Wajib isi NIK & ID Swipe!"); 
      return; 
    }
    
    setLoading(true);
    const { data: userData, error } = await supabase.from('nik').select('*').eq('nik', nik).eq('id_swipe', password).single();
    
    if (error) { 
      await supabase.from('log_login').insert([{ nik: nik, nama: '-', status: 'LOGIN FAILED: Wrong NIK/Password (Portal)' }]);
      alert("Login Gagal: NIK atau ID Swipe salah."); 
      setLoading(false); 
      return; 
    }

    await supabase.from('nik').update({ active_session: new Date().toISOString() }).eq('nik', nik);
    const token = Math.random().toString(36).substring(2);
    await supabase.from('user_sessions').delete().eq('nik', nik);
    await supabase.from('user_sessions').insert([{ nik: nik, token: token, login_at: new Date().toISOString(), last_active: new Date().toISOString() }]);
    await supabase.from('log_login').insert([{ nik: userData.nik, nama: userData.nama, status: 'LOGIN SUCCESS (Portal)' }]);
    
    setIsSuccess(true);
    setTimeout(() => {
      localStorage.setItem("ccm_user", JSON.stringify(userData));
      localStorage.setItem("ccm_sup", JSON.stringify(userData));
      localStorage.setItem("session_token", token);
      localStorage.setItem("session_start", Date.now().toString());
      setUser(userData); 
      setIsLoggedIn(true); 
      setLoading(false);
      setIsSuccess(false);
    }, 1500);
  };

  const prosesLogout = () => {
    if (confirm("Yakin ingin keluar dari portal?")) {
      localStorage.clear();
      setIsLoggedIn(false);
      setUser(null);
      setNik("");
      setPassword("");
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fffcfd]">
        <div className="w-10 h-10 border-4 border-[#e20074] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isWhitelist = user && isSupervisorWhitelisted(user.nama);

  const menuItems = [
    {
      href: "/kasir",
      icon: "🛒",
      title: "Dashboard Kasir",
      desc: "Raport performa, request schedule & alteration",
      color: "from-[#e20074] to-[#ff1a8c]",
      enabled: true
    },
    {
      href: "/absensi",
      icon: "🕐",
      title: "Absensi PPKK",
      desc: "Clock in/out, request attendance & shift",
      color: "from-teal-500 to-emerald-500",
      enabled: true
    },
    {
      href: "/supervisor",
      icon: "📊",
      title: "Panel Supervisor",
      desc: "Monitoring, approval & sinkronisasi data",
      color: "from-indigo-500 to-purple-500",
      enabled: isWhitelist
    },
    {
      href: "/pic",
      icon: "🪪",
      title: "Panel PIC",
      desc: "Dashboard management ID Swipe & Audit Clinic",
      color: "from-amber-500 to-orange-500",
      enabled: isWhitelist
    },
  ];

  return (
    <>
      <style jsx global>{`
        @keyframes slideUpFade { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes fadeInScale { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes floating { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
        @keyframes logoDropCatch {
          0% { transform: translateY(0) rotate(0deg); }
          15% { transform: translateY(45px) rotate(-15deg); }
          40% { transform: translateY(45px) rotate(-5deg); }
          70% { transform: translateY(-10px) rotate(5deg); }
          100% { transform: translateY(0) rotate(0deg); }
        }
        @keyframes handCatchLeft {
          0% { top: 6rem; left: -0.5rem; transform: rotate(-20deg); }
          15% { top: 7.5rem; left: 0.5rem; transform: rotate(-60deg); }
          40% { top: 7.5rem; left: 0.5rem; transform: rotate(-45deg); }
          70% { top: 5rem; left: -0.5rem; transform: rotate(-20deg); }
          100% { top: 6rem; left: -0.5rem; transform: rotate(-20deg); }
        }
        @keyframes handCatchRight {
          0% { top: 6rem; right: -0.5rem; transform: rotate(20deg); }
          15% { top: 7.5rem; right: 0.5rem; transform: rotate(60deg); }
          40% { top: 7.5rem; right: 0.5rem; transform: rotate(45deg); }
          70% { top: 5rem; right: -0.5rem; transform: rotate(20deg); }
          100% { top: 6rem; right: -0.5rem; transform: rotate(20deg); }
        }
        .anim-slide-up { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-pop-in { animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .anim-floating { animation: floating 3.5s ease-in-out infinite; }
        .anim-logo-drop { animation: logoDropCatch 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .anim-hand-catch-l { animation: handCatchLeft 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .anim-hand-catch-r { animation: handCatchRight 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .anim-fade-in { animation: fadeInScale 0.5s ease-out forwards; }
        .eye-happy {
          width: 0 !important; height: 0 !important;
          border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 6px solid #1f2937;
          background: transparent !important; transform: rotate(180deg); margin-top: 4px;
        }
      `}</style>

      {!isLoggedIn ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#f4f6f9] anim-fade-in overflow-hidden">
          <div className="bg-white px-8 pt-20 pb-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-[380px] text-center anim-slide-up border border-gray-100 relative mt-10">
            
            {/* Mako Chan Character Wrapper */}
            <div 
              className={`absolute -top-16 left-0 right-0 mx-auto w-32 h-32 cursor-pointer z-40 flex justify-center ${isFalling ? 'anim-fumble' : 'anim-floating'}`}
              onClick={handleLogoClick}
              title="Coba klik aku!"
            >
              <div className="absolute top-1 left-2 w-10 h-10 bg-[#811051] rounded-[0.8rem] rotate-[-25deg] shadow-inner"></div>
              <div className="absolute top-1 right-2 w-10 h-10 bg-[#811051] rounded-[0.8rem] rotate-[25deg] shadow-inner"></div>
              <div className="absolute inset-0 bg-[#9c1869] rounded-[4rem] shadow-[0_15px_30px_rgba(156,24,105,0.4)] overflow-hidden flex flex-col items-center pt-5 border-b-8 border-[#7a0c4f]">
                <div className="absolute top-4 w-[120%] h-7 bg-[#111] z-10 flex items-center justify-center shadow-md rotate-[-2deg]">
                  <div className="bg-white px-3 py-0.5 rounded-full text-[9px] font-black text-black tracking-widest border-2 border-gray-300">MAKO</div>
                </div>
                <div className="absolute top-12 w-[85%] h-14 bg-white rounded-[2rem] shadow-inner flex justify-center z-0">
                  <div className={`absolute top-2 left-5 w-3.5 h-1.5 bg-gray-800 rounded-full transition-all duration-300 ${isSuccess ? 'rotate-[25deg] -translate-y-1' : 'rotate-[15deg]'}`}></div>
                  <div className={`absolute top-2 right-5 w-3.5 h-1.5 bg-gray-800 rounded-full transition-all duration-300 ${isSuccess ? 'rotate-[-25deg] -translate-y-1' : 'rotate-[-15deg]'}`}></div>
                  <div className="flex gap-5 mt-4">
                    <div className="relative w-3.5 h-3.5 flex items-center justify-center">
                      <div style={{ transform: (isPasswordFocused || isSuccess) ? 'none' : `translate(${eyePos.x}px, ${eyePos.y}px)` }} className={`absolute w-3 h-3.5 bg-gray-800 rounded-full transition-all duration-75 ${isPasswordFocused ? 'scale-y-0 opacity-0' : isSuccess ? 'eye-happy' : 'opacity-100'}`}></div>
                    </div>
                    <div className="relative w-3.5 h-3.5 flex items-center justify-center">
                      <div style={{ transform: (isPasswordFocused || isSuccess) ? 'none' : `translate(${eyePos.x}px, ${eyePos.y}px)` }} className={`absolute w-3 h-3.5 bg-gray-800 rounded-full transition-all duration-75 ${isPasswordFocused ? 'scale-y-0 opacity-0' : isSuccess ? 'eye-happy' : 'opacity-100'}`}></div>
                    </div>
                  </div>
                  <div className={`absolute top-6 left-2 w-4 h-1.5 bg-red-400/70 rounded-full transition-all duration-300 ${isSuccess ? 'scale-125' : ''}`}></div>
                  <div className={`absolute top-6 right-2 w-4 h-1.5 bg-red-400/70 rounded-full transition-all duration-300 ${isSuccess ? 'scale-125' : ''}`}></div>
                  <div className={`absolute transition-all duration-300 ${isPasswordFocused ? 'top-6 w-2 h-2 border-b-2 border-gray-800 rounded-full' : isSuccess || isFalling ? 'top-5 w-6 h-5 bg-[#d81b60] rounded-b-full' : 'top-6 w-5 h-4 bg-gray-800 rounded-b-full overflow-hidden flex justify-center items-end'}`}>
                    {!isPasswordFocused && <div className={`w-3.5 bg-pink-400 rounded-t-full ${isSuccess || isFalling ? 'h-3' : 'h-2'}`}></div>}
                  </div>
                </div>
                <div className="absolute bottom-1 flex gap-1.5 text-[#d4af37] text-[12px] font-serif font-black drop-shadow-md">
                   <span className="rotate-[-10deg]">|</span><span className="rotate-[-5deg]">|</span><span className="text-[14px] -mt-1">福</span><span className="rotate-[5deg]">|</span><span className="rotate-[10deg]">|</span>
                </div>
              </div>
              <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 w-14 h-14 bg-[#e20074] rounded-[1rem] flex items-center justify-center shadow-lg border-2 border-white/20 z-30 ${isFalling ? 'anim-logo-drop' : ''}`}>
                 <span className="text-white font-black text-sm tracking-tighter">AEON</span>
              </div>
              <div className={`absolute w-7 h-8 bg-[#9c1869] border-t-2 border-l-2 border-[#ff6bb6] rounded-[1.5rem] transition-all duration-500 z-40 shadow-lg ${isPasswordFocused ? 'top-12 left-4 rotate-[45deg] scale-110' : isFalling ? 'anim-hand-catch-l' : 'top-[6rem] -left-2 rotate-[-20deg]'}`}></div>
              <div className={`absolute w-7 h-8 bg-[#9c1869] border-t-2 border-r-2 border-[#ff6bb6] rounded-[1.5rem] transition-all duration-500 z-40 shadow-lg ${isPasswordFocused ? 'top-12 right-4 -rotate-[45deg] scale-110' : isFalling ? 'anim-hand-catch-r' : 'top-[6rem] -right-2 rotate-[20deg]'}`}></div>
            </div>
            
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1.5 tracking-tight mt-6">Portal CCM DPM</h2>
            <p className="text-gray-500 text-[13px] font-medium mb-8">Silakan login dengan NIK & ID Swipe</p>
            
            <div className="space-y-4 relative z-30">
              <input type="text" placeholder="NIK" value={nik} onChange={(e) => setNik(e.target.value)} className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-200 outline-none focus:bg-white focus:border-pink-400 focus:ring-4 focus:ring-pink-100/50 transition-all text-sm text-gray-900 font-bold" />
              <input type="password" placeholder="ID Swipe" value={password} onFocus={() => setIsPasswordFocused(true)} onBlur={() => setIsPasswordFocused(false)} onChange={(e) => setPassword(e.target.value)} className="w-full px-5 py-4 rounded-xl bg-gray-50 border border-gray-200 outline-none focus:bg-white focus:border-pink-400 focus:ring-4 focus:ring-pink-100/50 transition-all text-sm text-gray-900 font-bold" />
            </div>

            <button onClick={prosesLogin} disabled={loading || isSuccess} className={`mt-8 text-white font-black py-4 px-6 rounded-xl w-full shadow-lg active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 text-[13px] uppercase tracking-wider relative z-30 ${isSuccess ? 'bg-green-500 shadow-green-500/30' : 'bg-[#e20074] hover:bg-[#c80066] shadow-pink-500/20'}`}>
              {loading ? "MEMVERIFIKASI..." : isSuccess ? "BERHASIL LOGIN!" : "MASUK DASHBOARD"}
            </button>
            
            {/* Live Log Login Notice */}
            <div className="mt-8 pt-8 border-t border-gray-100 text-left">
              <h3 className="font-extrabold text-[10px] text-gray-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                <span>📋 Aktivitas Login</span>
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {loadingLogs ? <p className="text-gray-400 text-[10px] text-center">Memuat...</p> : logs.map((log, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-[10px]">
                    <span className="font-bold text-gray-800 truncate max-w-[120px]">{log.nama}</span>
                    <span className="text-gray-400">{new Date(log.timestamp || log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-screen p-6 max-w-md mx-auto anim-fade-in">
          <div className="text-center mb-10 pt-10">
            <div className="bg-[#e20074] w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-lg shadow-pink-200">
              <span className="text-white font-black text-lg tracking-tighter">AEON</span>
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Halo, {user?.nama?.split(' ')[0]}!</h1>
            <p className="text-gray-400 text-sm">Pilih dashboard untuk memulai</p>
          </div>

          <div className="space-y-4 mb-10">
            {menuItems.map((item, idx) => (
              <div key={item.href} className="anim-slide-up" style={{ animationDelay: `${(idx + 1) * 0.1}s` }}>
                {item.enabled ? (
                  <Link href={item.href} className="group flex items-center gap-4 bg-white border border-gray-100 rounded-[1.75rem] p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                    <div className={`w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-2xl shadow-md`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-gray-900 text-base group-hover:text-[#e20074] transition-colors">{item.title}</h2>
                      <p className="text-xs text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                    <span className="text-gray-300 group-hover:text-[#e20074] group-hover:translate-x-1 transition-all text-lg">→</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-4 bg-gray-50/50 border border-gray-100 rounded-[1.75rem] p-5 grayscale opacity-60 cursor-not-allowed">
                    <div className="w-14 h-14 shrink-0 rounded-2xl bg-gray-200 flex items-center justify-center text-2xl">{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-gray-400 text-base">{item.title}</h2>
                        <span className="bg-gray-100 text-[8px] font-black uppercase px-1.5 py-0.5 rounded text-gray-400 border border-gray-200">Restricted</span>
                      </div>
                      <p className="text-xs text-gray-300 mt-0.5 leading-snug">Hanya untuk Supervisor/PIC terdaftar</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={prosesLogout} className="w-full py-4 rounded-2xl bg-gray-100 text-gray-500 font-bold text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors">
            Keluar Portal
          </button>
        </div>
      )}
    </>
  );
}
