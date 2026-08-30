// src/app/absensi/page.js
"use client";
import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const ALLOWED_LOCATIONS = [
  { lat: -6.9826417, lon: 110.4152754 },
  { lat: -6.984346, lon: 110.413325 },
  { lat: -6.984115008522686, lon: 110.4136480045519 },
  { lat: -6.982823, lon: 110.411941 }
];
const MAX_DISTANCE = 200;

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function AbsensiPage() {
  const [user, setUser] = useState(null);
  const [nik, setNik] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // step: 'home' | 'map' | 'camera'
  const [step, setStep] = useState("home");
  const [tipeAbsen, setTipeAbsen] = useState("");
  const [gpsStatus, setGpsStatus] = useState({ text: "Mencari sinyal GPS...", ok: false, color: "gray" });
  const [submitting, setSubmitting] = useState(false);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const leafletRef = useRef(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // ============ LOGIN ============
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
      if (json.success) setUser(json.data);
      else setError(json.message || "Login gagal.");
    } catch (err) {
      setError("Koneksi terputus: " + err.message);
    }
    setLoading(false);
  }

  function logout() {
    cleanupResources();
    setUser(null);
    setNik("");
    setPassword("");
    setStep("home");
  }

  function cleanupResources() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  // ============ STEP 1: PETA / GPS ============
  function startAttendanceFlow(tipe) {
    if (tipe === "Clock In" && user.actualIn !== "-" && user.actualIn !== "") {
      alert("🚨 GAGAL PENCET:\n\nAnda SUDAH melakukan Clock In pada jam " + user.actualIn);
      return;
    }
    if (tipe === "Clock Out" && user.actualOut !== "-" && user.actualOut !== "") {
      alert("🚨 GAGAL PENCET:\n\nAnda SUDAH melakukan Clock Out pada jam " + user.actualOut);
      return;
    }
    setTipeAbsen(tipe);
    setStep("map");
  }

  useEffect(() => {
    if (step !== "map") return;

    let cancelled = false;
    setGpsStatus({ text: "Mencari sinyal GPS akurat...", ok: false, color: "gray" });

    import("leaflet").then((L) => {
      if (cancelled) return;
      leafletRef.current = L;

      if (!mapInstanceRef.current && mapRef.current) {
        const map = L.map(mapRef.current, { zoomControl: false }).setView([-6.982823, 110.411941], 17);
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
        ALLOWED_LOCATIONS.forEach(loc => {
          L.circle([loc.lat, loc.lon], { color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15, radius: MAX_DISTANCE }).addTo(map);
        });
        mapInstanceRef.current = map;
      }
      setTimeout(() => mapInstanceRef.current && mapInstanceRef.current.invalidateSize(), 300);

      if (navigator.geolocation) {
        const onSuccess = (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const map = mapInstanceRef.current;
          if (!map) return;

          if (!userMarkerRef.current) {
            const iconPulse = L.divIcon({
              className: "custom-div-icon",
              html: "<div style='background:#e20074;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3);'></div>",
              iconSize: [16, 16]
            });
            userMarkerRef.current = L.marker([lat, lon], { icon: iconPulse }).addTo(map);
          } else {
            userMarkerRef.current.setLatLng([lat, lon]);
          }
          map.setView([lat, lon]);

          let minDistance = Infinity;
          ALLOWED_LOCATIONS.forEach(loc => {
            const d = getDistanceInMeters(lat, lon, loc.lat, loc.lon);
            if (d < minDistance) minDistance = d;
          });

          if (minDistance <= MAX_DISTANCE) {
            setGpsStatus({ text: `Posisi Sesuai. Jarak: ${Math.round(minDistance)} meter`, ok: true, color: "green" });
          } else {
            setGpsStatus({ text: `Di luar jangkauan (${Math.round(minDistance)}m)`, ok: false, color: "red" });
          }
        };
        const onError = (err) => {
          if (err.code === 3 || err.code === 2) {
            navigator.geolocation.getCurrentPosition(onSuccess, () => {
              setGpsStatus({ text: "Sinyal GPS lemah / terhalang gedung.", ok: false, color: "gray" });
            }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 });
          } else {
            setGpsStatus({ text: "GPS Ditolak. Izinkan di pengaturan HP.", ok: false, color: "red" });
          }
        };
        watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
          enableHighAccuracy: true, timeout: 10000, maximumAge: 0
        });
      } else {
        alert("GPS tidak didukung oleh browser Anda.");
      }
    });

    return () => { cancelled = true; };
  }, [step]);

  function batalkanAbsen() {
    cleanupResources();
    setStep("home");
  }

  function goToCamera() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStep("camera");
  }

  // ============ STEP 2: KAMERA LIVE ============
  useEffect(() => {
    if (step !== "camera") return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        alert("Tidak bisa mengakses kamera. Pastikan izin kamera diaktifkan.");
        setStep("map");
      });
    return () => { cancelled = true; };
  }, [step]);

  function kembaliKeMap() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStep("map");
  }

  function tambahWatermark(canvasSrc, callback) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_W = 900;
      const scale = img.width > MAX_W ? MAX_W / img.width : 1;
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const now = new Date();
      const jkt = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3600000 * 7);
      const pad = (n) => (n < 10 ? "0" + n : "" + n);
      const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const MONS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const timeStr = `${pad(jkt.getHours())}:${pad(jkt.getMinutes())}:${pad(jkt.getSeconds())} WIB`;
      const dateStr = `${DAYS[jkt.getDay()]}, ${pad(jkt.getDate())} ${MONS[jkt.getMonth()]} ${jkt.getFullYear()}`;

      const W = canvas.width, H = canvas.height;
      const padX = Math.round(W * 0.03);
      const barH = Math.round(H * 0.15);
      const barY = H - barH;

      ctx.fillStyle = "rgba(0,0,0,0.60)";
      ctx.fillRect(0, barY, W, barH);
      const lineH = Math.max(3, Math.round(W * 0.007));
      ctx.fillStyle = "#e20074";
      ctx.fillRect(0, barY, W, lineH);

      const fsTime = Math.max(14, Math.round(W * 0.062));
      const fsDate = Math.max(11, Math.round(W * 0.04));
      const fsName = Math.max(10, Math.round(W * 0.034));
      const lineGap = Math.round(barH * 0.05);
      const startY = barY + lineH + lineGap;

      ctx.textBaseline = "top";
      ctx.font = `bold ${fsTime}px Arial, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(timeStr, padX, startY);

      ctx.font = `${fsDate}px Arial, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillText(dateStr, padX, startY + fsTime + lineGap);

      const label = tipeAbsen ? `${tipeAbsen}  ·  ${user.nama}` : user.nama;
      ctx.font = `bold ${fsName}px Arial, sans-serif`;
      ctx.fillStyle = "#fce7f3";
      ctx.textAlign = "right";
      ctx.fillText(label, W - padX, startY);

      callback(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = canvasSrc;
  }

  function captureAndSubmit() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      alert("Kamera belum siap.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL("image/jpeg", 0.8);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    tambahWatermark(base64Data, (b64watermarked) => {
      eksekusiAbsen(b64watermarked);
    });
  }

  async function eksekusiAbsen(base64Photo) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/absensi/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nik: user.nik, nama: user.nama, tipeAbsen,
          shiftCode: user.shiftCode, base64Photo
        })
      });
      const json = await res.json();
      setSubmitting(false);
      setStep("home");
      if (json.success) {
        setUser(prev => ({
          ...prev,
          actualIn: json.tipe === "Clock In" ? json.waktu : prev.actualIn,
          actualOut: json.tipe === "Clock Out" ? json.waktu : prev.actualOut
        }));
        setToast(`✅ ${json.tipe} Berhasil pada ${json.waktu}`);
        setTimeout(() => setToast(""), 4000);
      } else {
        alert("Gagal Absen: " + json.message);
      }
    } catch (err) {
      setSubmitting(false);
      setStep("home");
      alert("Gagal Absen: " + err.message);
    }
  }

  // ============ RENDER ============
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
            <input type="text" placeholder="NIK" value={nik} onChange={(e) => setNik(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-pink-400 text-sm" />
            <input type="password" placeholder="Password / ID Swipe" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-pink-400 text-sm" />
            {error && <div className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-[#e20074] text-white font-bold rounded-2xl shadow-lg shadow-pink-200 disabled:opacity-60">
              {loading ? "Memverifikasi..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // STEP: MAP
  if (step === "map") {
    return (
      <div className="min-h-screen relative bg-black">
        <div className="absolute top-0 left-0 w-full z-20 bg-gradient-to-r from-[#e20074] to-[#ff1a8c] text-white p-5 flex items-center gap-4">
          <button onClick={batalkanAbsen} className="text-xl">←</button>
          <h2 className="font-bold">Step 1: Lokasi ({tipeAbsen})</h2>
        </div>
        <div ref={mapRef} style={{ height: "100vh", width: "100%" }} />
        <div className="fixed bottom-0 left-0 w-full bg-white rounded-t-3xl p-6 shadow-2xl z-20">
          <div className={`p-3 rounded-xl text-center text-sm font-bold mb-4 ${
            gpsStatus.color === "green" ? "bg-green-100 text-green-700" :
            gpsStatus.color === "red" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
          }`}>
            {gpsStatus.text}
          </div>
          <button onClick={goToCamera} disabled={!gpsStatus.ok}
            className={`w-full py-4 rounded-2xl font-bold text-white ${gpsStatus.ok ? "bg-[#e20074]" : "bg-gray-300"}`}>
            Lanjut Ambil Foto →
          </button>
        </div>
      </div>
    );
  }

  // STEP: CAMERA
  if (step === "camera") {
    return (
      <div className="min-h-screen bg-black relative">
        <div className="absolute top-0 left-0 w-full z-20 bg-black/50 text-white p-5 flex items-center gap-4">
          <button onClick={kembaliKeMap} className="text-xl">←</button>
          <h2 className="font-bold">Step 2: Foto ({tipeAbsen})</h2>
        </div>
        <div className="relative w-full h-screen flex items-center justify-center overflow-hidden">
          <video ref={videoRef} autoPlay playsInline
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div style={{ width: 220, height: 320, border: "4px dashed rgba(255,255,255,0.9)", borderRadius: "50% 50% 40% 40%", boxShadow: "0 0 0 2000px rgba(0,0,0,0.6)" }} />
          </div>
        </div>
        <div className="fixed bottom-0 left-0 w-full p-8 flex justify-center bg-gradient-to-t from-black/80 to-transparent z-20">
          <button onClick={captureAndSubmit} disabled={submitting}
            className="w-full py-4 bg-blue-500 text-white font-bold rounded-2xl shadow-lg disabled:opacity-60">
            {submitting ? "Mengirim..." : "📷 Submit Absen"}
          </button>
        </div>
      </div>
    );
  }

  // STEP: HOME
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
        {toast && <div className="bg-green-100 text-green-700 font-bold text-sm p-3 rounded-xl text-center">{toast}</div>}

        {!user.isOff && (
          <div className="flex gap-3">
            <button onClick={() => startAttendanceFlow("Clock In")}
              className="flex-1 py-4 bg-[#e20074] text-white font-bold rounded-2xl shadow-lg shadow-pink-200">
              📷 Clock In
            </button>
            <button onClick={() => startAttendanceFlow("Clock Out")}
              className="flex-1 py-4 bg-white border border-gray-200 text-gray-800 font-bold rounded-2xl shadow-sm">
              📷 Clock Out
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm flex justify-between text-sm">
          <span className="text-gray-500 font-semibold">Clock In</span>
          <span className="font-black text-gray-800">{user.actualIn}</span>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm flex justify-between text-sm">
          <span className="text-gray-500 font-semibold">Clock Out</span>
          <span className="font-black text-gray-800">{user.actualOut}</span>
        </div>
      </div>
    </div>
  );
}
