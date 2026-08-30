// src/app/absensi/page.js
"use client";
import { useState } from "react";

export default function AbsensiPage() {
  const [user, setUser] = useState(null);
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/absensi/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik, password })
      });
      const json = await res.json();
      if (json.success) {
        setUser(json.data);
      } else {
        setError(json.message || "Login gagal.");
      }
    } catch (err) {
      setError("Koneksi terputus: " + err.message);
    }
    setLoading(false);
  }

  function logout() {
    setUser(null);
    setNik("");
    setPassword("");
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fffcfd] p-6">
        <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-xl p-8">
          <div className="bg-[#e20074] w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg">
            <span className="text-white text-2xl">🕐</span>
          </div>
          <h1 className="text-xl font-extrabold text-center text-gray-900 mb-1">Absensi PPKK DPM</h1>
          <p className="text-xs text-center text-gray-400 mb-8">Silakan login dengan NIK & Password</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              placeholder="NIK"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-pink-400 text-sm"
            />
            <input
              type="password"
              placeholder="Password / ID Swipe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-pink-400 text-sm"
            />
            {error && (
              <div className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#e20074] text-white font-bold rounded-2xl shadow-lg shadow-pink-200 disabled:opacity-60"
            >
              {loading ? "Memverifikasi..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="bg-gradient-to-r from-[#e20074] to-[#ff1a8c] text-white px-6 py-8 rounded-b-[2.5rem] shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase opacity-70 font-bold">Absensi PPKK DPM</p>
            <h2 className="text-lg font-extrabold">Halo, {user.nama}</h2>
          </div>
          <button onClick={logout} className="bg-white/20 px-3 py-2 rounded-xl text-xs font-bold">Logout</button>
        </div>
        <div className="bg-white/10 rounded-2xl p-4">
          <p className="text-[10px] uppercase opacity-70 font-bold mb-1">Jadwal {user.tanggalHariIni}</p>
          <h3 className="text-xl font-black">{user.isOff ? "Hari Ini Libur" : user.shiftCode}</h3>
          <p className="text-sm opacity-90">{user.shiftJam}</p>
        </div>
      </div>

      <div className="p-6 space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex justify-between text-sm">
          <span className="text-gray-500 font-semibold">Clock In</span>
          <span className="font-black text-gray-800">{user.actualIn}</span>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm flex justify-between text-sm">
          <span className="text-gray-500 font-semibold">Clock Out</span>
          <span className="font-black text-gray-800">{user.actualOut}</span>
        </div>
        <div className="text-center text-xs text-gray-400 pt-4">
          Fitur Clock In/Out (GPS + Kamera) menyusul di Fase 2.
        </div>
      </div>
    </div>
  );
}
