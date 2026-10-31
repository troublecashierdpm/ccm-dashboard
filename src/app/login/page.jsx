// src/app/login/page.jsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { isSupervisorWhitelisted, isPicWhitelisted } from "@/lib/accessControl";

// Cari dashboard tujuan berdasarkan sesi tersimpan (role-aware).
function detectRoleRedirect() {
  try {
    const pic = localStorage.getItem("ccm_pic");
    const sup = localStorage.getItem("ccm_sup");
    const user = localStorage.getItem("ccm_user");
    const sessionStart = localStorage.getItem("session_start");

    // Sesi sudah lewat 10 menit? Anggap logout — paksa login ulang.
    if (sessionStart && Date.now() - parseInt(sessionStart, 10) > 10 * 60 * 1000) {
      return null;
    }

    if (pic) {
      const p = JSON.parse(pic);
      if (p?.nama && isPicWhitelisted(p.nama)) return "/pic";
    }
    if (sup) {
      const s = JSON.parse(sup);
      if (s?.nama && isSupervisorWhitelisted(s.nama)) return "/supervisor";
    }
    if (user) {
      const u = JSON.parse(user);
      if (u?.nik) return "/kasir";
    }
  } catch {}
  return null;
}

export default function LoginHubPage() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const target = detectRoleRedirect();
    if (target) {
      window.location.replace(target);
      return;
    }
    setChecking(false);
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#fffcfd] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#e20074] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Memeriksa sesi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fffcfd] via-pink-50 to-indigo-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="bg-[#e20074] w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-lg shadow-pink-200">
            <span className="text-white font-black text-xl tracking-tighter">AEON</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-1">CCM DPM Portal</h1>
          <p className="text-gray-400 text-sm">Silakan pilih dashboard sesuai authority Anda</p>
        </div>

        <div className="space-y-4 mb-6">
          <Link href="/kasir"
            className="group flex items-center gap-4 bg-white border border-gray-100 rounded-[1.75rem] p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-[#e20074] to-[#ff1a8c] flex items-center justify-center text-2xl shadow-md">🛒</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 text-base group-hover:text-[#e20074] transition-colors">Kasir</h2>
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">Dashboard performa, request schedule</p>
            </div>
            <span className="text-gray-300 group-hover:text-[#e20074] group-hover:translate-x-1 transition-all text-lg">→</span>
          </Link>

          <Link href="/absensi"
            className="group flex items-center gap-4 bg-white border border-gray-100 rounded-[1.75rem] p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-2xl shadow-md">🕐</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 text-base group-hover:text-teal-600 transition-colors">Absensi PPKK</h2>
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">Clock in/out, request attendance & shift</p>
            </div>
            <span className="text-gray-300 group-hover:text-teal-500 group-hover:translate-x-1 transition-all text-lg">→</span>
          </Link>

          <Link href="/supervisor"
            className="group flex items-center gap-4 bg-white border border-gray-100 rounded-[1.75rem] p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-2xl shadow-md">📊</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 text-base group-hover:text-indigo-600 transition-colors">Supervisor</h2>
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">Monitoring, approval, sinkronisasi data</p>
            </div>
            <span className="text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all text-lg">→</span>
          </Link>

          <Link href="/pic"
            className="group flex items-center gap-4 bg-white border border-gray-100 rounded-[1.75rem] p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-2xl shadow-md">🪪</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 text-base group-hover:text-amber-600 transition-colors">PIC / TRC</h2>
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">Manajemen ID Swipe & Audit Clinic</p>
            </div>
            <span className="text-gray-300 group-hover:text-amber-500 group-hover:translate-x-1 transition-all text-lg">→</span>
          </Link>
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-8 font-semibold uppercase tracking-wider">
          AEON DPM Semarang
        </p>
      </div>
    </div>
  );
}
