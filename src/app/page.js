// src/app/page.js
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useActiveSession } from "@/lib/useActiveSession";
import { isSupervisorWhitelisted, isPicWhitelisted } from "@/lib/accessControl";

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Login States
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [isFalling, setIsFalling] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [eyePos, setEyePos] = useState({ x: 0, y: 0 });

  useActiveSession(user, setUser, setIsLoggedIn);

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

  const prosesLogin = async (e) => {
    e.preventDefault();
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
    <div className="min-h-screen bg-[#fffcfd] font-sans">
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
          0% { top: 5rem; left: -0.75rem; transform: rotate(-30deg); }
          15% { top: 7rem; left: 0.5rem; transform: rotate(-60deg); }
          40% { top: 7rem; left: 0.5rem; transform: rotate(-45deg); }
          70% { top: 4.5rem; left: -0.5rem; transform: rotate(-20deg); }
          100% { top: 5rem; left: -0.75rem; transform: rotate(-30deg); }
        }
        @keyframes handCatchRight {
          0% { top: 5rem; right: -0.75rem; transform: rotate(30deg); }
          15% { top: 7rem; right: 0.5rem; transform: rotate(60deg); }
          40% { top: 7rem; right: 0.5rem; transform: rotate(45deg); }
          70% { top: 4.5rem; right: -0.5rem; transform: rotate(20deg); }
          100% { top: 5rem; right: -0.75rem; transform: rotate(30deg); }
        }
        .anim-slide-up { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .anim-pop-in { animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .anim-floating { animation: floating 3.5s ease-in-out infinite; }
        .anim-logo-drop { animation: logoDropCatch 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .anim-hand-catch-l { animation: handCatchLeft 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .anim-hand-catch-r { animation: handCatchRight 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .eye-happy {
          width: 0 !important; height: 0 !important;
          border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 6px solid #1f2937;
          background: transparent !important; transform: rotate(180deg); margin-top: 4px;
        }
      `}</style>

      {!isLoggedIn ? (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="relative mb-8 pt-10">
              {/* Mako Chan Character Wrapper */}
              <div className="relative w-32 h-32 mx-auto">
                <div className={`absolute -top-12 left-1/2 -translate-x-1/2 w-16 h-16 bg-[#e20074] rounded-2xl flex items-center justify-center z-30 cursor-pointer shadow-lg active:scale-95 transition-transform ${isFalling ? 'anim-logo-drop' : 'anim-floating'}`} onClick={handleLogoClick}>
                  <span className="text-white font-black text-xl tracking-tighter">AEON</span>
                </div>
                
                {/* Hands */}
                <div className={`absolute top-20 -left-3 w-8 h-8 z-20 ${isFalling ? 'anim-hand-catch-l' : ''}`}>
                  <div className="w-full h-full bg-[#ffd4b8] rounded-full border-2 border-[#e20074]/10"></div>
                </div>
                <div className={`absolute top-20 -right-3 w-8 h-8 z-20 ${isFalling ? 'anim-hand-catch-r' : ''}`}>
                  <div className="w-full h-full bg-[#ffd4b8] rounded-full border-2 border-[#e20074]/10"></div>
                </div>

                {/* Face */}
                <div className="w-32 h-32 bg-[#ffd4b8] rounded-[2.5rem] relative overflow-hidden border-4 border-white shadow-xl">
                  {/* Hair */}
                  <div className="absolute top-0 left-0 w-full h-8 bg-[#1f2937]"></div>
                  <div className="absolute top-0 left-0 w-6 h-14 bg-[#1f2937] rounded-b-full"></div>
                  <div className="absolute top-0 right-0 w-6 h-14 bg-[#1f2937] rounded-b-full"></div>
                  
                  {/* Eyes Container */}
                  <div className={`flex gap-6 justify-center mt-12 transition-all duration-300 ${isPasswordFocused ? 'opacity-0 scale-50' : 'opacity-100'}`}>
                    <div className={`w-3.5 h-3.5 bg-gray-800 rounded-full relative ${isSuccess ? 'eye-happy' : ''}`}>
                      {!isSuccess && <div className="absolute top-1 left-1 w-1 h-1 bg-white rounded-full" style={{ transform: `translate(${eyePos.x}px, ${eyePos.y}px)` }}></div>}
                    </div>
                    <div className={`w-3.5 h-3.5 bg-gray-800 rounded-full relative ${isSuccess ? 'eye-happy' : ''}`}>
                      {!isSuccess && <div className="absolute top-1 left-1 w-1 h-1 bg-white rounded-full" style={{ transform: `translate(${eyePos.x}px, ${eyePos.y}px)` }}></div>}
                    </div>
                  </div>

                  {/* Password Focus Eyes (Closed) */}
                  {isPasswordFocused && (
                    <div className="flex gap-6 justify-center mt-14">
                      <div className="w-4 h-1 bg-gray-800 rounded-full"></div>
                      <div className="w-4 h-1 bg-gray-800 rounded-full"></div>
                    </div>
                  )}

                  {/* Blush */}
                  <div className="absolute top-16 left-3 w-4 h-2 bg-pink-300/40 rounded-full blur-[2px]"></div>
                  <div className="absolute top-16 right-3 w-4 h-2 bg-pink-300/40 rounded-full blur-[2px]"></div>
                  
                  {/* Mouth */}
                  <div className={`mx-auto mt-4 w-4 h-2 border-b-2 border-gray-800 rounded-full transition-all ${isSuccess ? 'w-6 h-3 border-b-4' : ''}`}></div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100 anim-pop-in">
              <h2 className="text-xl font-black text-center text-gray-900 mb-1">Portal Login</h2>
              <p className="text-xs text-center text-gray-400 mb-8 font-bold uppercase tracking-widest">CCM AEON DPM</p>
              
              <form onSubmit={prosesLogin} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">NIK Karyawan</label>
                  <input type="text" placeholder="Masukkan NIK" value={nik} onChange={(e) => setNik(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-50 outline-none transition-all text-sm font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-4 mb-1 block">ID Swipe (Password)</label>
                  <input type="password" placeholder="Masukkan ID Swipe" value={password} onFocus={() => setIsPasswordFocused(true)} onBlur={() => setIsPasswordFocused(false)} onChange={(e) => setPassword(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-50 outline-none transition-all text-sm font-bold" />
                </div>
                
                <button type="submit" disabled={loading || isSuccess} className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${isSuccess ? 'bg-green-500 text-white' : 'bg-[#e20074] text-white shadow-pink-200 hover:shadow-pink-300'}`}>
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : isSuccess ? (
                    "Berhasil!"
                  ) : "Masuk ke Portal"}
                </button>
              </form>
            </div>
            
            <p className="text-center text-[10px] text-gray-300 mt-8 font-bold uppercase tracking-widest">Aeon DPM Semarang</p>
          </div>
        </div>
      ) : (
        <div className="min-h-screen p-6 max-w-md mx-auto">
          <div className="text-center mb-10 pt-10 anim-slide-up" style={{ animationDelay: '0s' }}>
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

          <div className="anim-slide-up" style={{ animationDelay: '0.5s' }}>
            <button onClick={prosesLogout} className="w-full py-4 rounded-2xl bg-gray-100 text-gray-500 font-bold text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors">
              Keluar Portal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
