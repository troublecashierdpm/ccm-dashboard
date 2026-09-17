// src/lib/useActiveSession.js
"use client";
import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

const SESSION_LIMIT_MS = 10 * 60 * 1000; // 10 menit

export function useActiveSession(user, setUser, setIsLoggedIn) {
  const mountTime = useRef(Date.now());

  const performLogout = useCallback(async (reason = "LOGOUT") => {
    if (user) {
      try {
        await supabase.from('log_login').insert([{ nik: user.nik, nama: user.nama, status: reason }]);
      } catch (e) {
        console.error(e);
      }
    }
    localStorage.removeItem("ccm_user");
    localStorage.removeItem("ccm_sup");
    localStorage.removeItem("session_token");
    localStorage.removeItem("session_start");
    if (setIsLoggedIn) setIsLoggedIn(false);
    if (setUser) setUser(null);
    window.location.reload();
  }, [user, setUser, setIsLoggedIn]);

  // Cek berkala (tiap 1 menit) selama tab tetap terbuka
  const verifyAndPing = useCallback(async () => {
    if (!user || !user.nik) return;

    // Hindari logout tak sengaja sesaat setelah mount/login
    if (Date.now() - mountTime.current < 5000) return;

    const sessionStart = localStorage.getItem("session_start");
    if (sessionStart && Date.now() - parseInt(sessionStart, 10) > SESSION_LIMIT_MS) {
      await performLogout("SESSION_EXPIRED");
    }

    // CATATAN: pengecekan per-NIK / satu-sesi-per-device (via /api/user_sessions)
    // SENGAJA belum diaktifkan dulu sesuai permintaan — hanya limit waktu 10 menit.
  }, [user, performLogout]);

  useEffect(() => {
    if (!user) return;

    const existingStart = localStorage.getItem("session_start");

    if (!existingStart) {
      // Sesi baru (baru saja login)
      localStorage.setItem("session_start", Date.now().toString());
    } else {
      // Sesi lama sudah ada di localStorage (misal browser sempat ditutup lalu
      // dibuka lagi jam/hari berikutnya) — cek LANGSUNG saat halaman dibuka,
      // jangan tunggu interval 1 menit pertama.
      const elapsed = Date.now() - parseInt(existingStart, 10);
      if (elapsed > SESSION_LIMIT_MS) {
        performLogout("SESSION_EXPIRED");
        return;
      }
    }

    const interval = setInterval(() => {
      verifyAndPing();
    }, 60 * 1000); // cek ulang tiap 1 menit selama tab terbuka

    return () => {
      clearInterval(interval);
    };
  }, [user, verifyAndPing, performLogout]);

  return { performLogout };
}
