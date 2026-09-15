// src/lib/useActiveSession.js
"use client";
import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useActiveSession(user, setUser, setIsLoggedIn) {
  const mountTime = useRef(Date.now());

  const performLogout = useCallback(async (reason = "LOGOUT") => {
    if (user) {
      try {
        await supabase.from('log_login').insert([{ nik: user.nik, nama: user.nama, status: reason }]);
        await supabase.from('nik').update({ active_session: null }).eq('nik', user.nik);
        await supabase.from('user_sessions').delete().eq('nik', user.nik);
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

  const verifyAndPing = useCallback(async () => {
    return;
    if (!user || !user.nik) return;
    
    // Skip if within 5s of mount
    if (Date.now() - mountTime.current < 5000) return;

    // Strict 10m logout
    const sessionStart = localStorage.getItem("session_start");
    if (sessionStart && Date.now() - parseInt(sessionStart) > 10 * 60 * 1000) {
      await performLogout("SESSION_EXPIRED");
      return;
    }

    try {
      const storedToken = localStorage.getItem("session_token");
      const res = await fetch("/api/user_sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik: user.nik, action: 'get' })
      });
      const { token: dbToken } = await res.json();

      if (!dbToken || dbToken !== storedToken) {
        // Only flag if token existed, handle false positives
        if (storedToken) {
          alert("⚠️ Sesi berakhir: Login di perangkat lain.");
          await performLogout("SESSION_OVERRIDDEN");
        }
        return;
      }

      await fetch("/api/user_sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik: user.nik, action: 'ping' })
      });
    } catch (e) {
      console.error("Session check error:", e);
    }
  }, [user, performLogout]);

  useEffect(() => {
    if (!user) return;
    
    if (!localStorage.getItem("session_start")) {
      localStorage.setItem("session_start", Date.now().toString());
    }

    verifyAndPing();

    const interval = setInterval(() => {
      verifyAndPing();
    }, 60 * 1000); // 1 minute interval

    const handleActivity = () => {
      // Optional: reset inactivity or keep session start strict 10 mins as requested
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [user, verifyAndPing]);

  return { performLogout };
}
