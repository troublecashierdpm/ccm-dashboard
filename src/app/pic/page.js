// src/app/pic/page.js
"use client";
import { useState, useEffect, useRef } from "react";
import SignaturePad from "signature_pad";
import { supabase } from "@/lib/supabaseClient";
import { useActiveSession } from "@/lib/useActiveSession";
import { isPicWhitelisted } from "@/lib/accessControl";

export default function PicPage() {
  const [picNik, setPicNik] = useState("");
  const [picPassword, setPicPassword] = useState("");
  const [picUser, setPicUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [section, setSection] = useState("main");

  const [ids, setIds] = useState({ tersedia: [], aktif: [], nonAktif: [] });
  const [sigs, setSigs] = useState({ requesters: [], superiors: [] });
  const [loadingData, setLoadingData] = useState(false);

  // Stock form
  const [stockAction, setStockAction] = useState("ADD_FROM_HRD");
  const [stockPic, setStockPic] = useState("");
  const [stockRows, setStockRows] = useState([""]);
  const [stockMsg, setStockMsg] = useState({ text: "", ok: null });
  const [stockLoading, setStockLoading] = useState(false);

  // User form
  const [requestType, setRequestType] = useState("Activation");
  const [newUser, setNewUser] = useState(true);
  const [activationIdCard, setActivationIdCard] = useState(true);
  const [userRows, setUserRows] = useState([{ id: "", name: "", type: "", pos: "", c: true, m: false, s: false, a: false }]);
  const [reqSelect, setReqSelect] = useState("");
  const [reqNameNew, setReqNameNew] = useState("");
  const [reqPosNew, setReqPosNew] = useState("");
  const [reqEditFlag, setReqEditFlag] = useState(false);
  const [supSelect, setSupSelect] = useState("");
  const [supNameNew, setSupNameNew] = useState("");
  const [supPosNew, setSupPosNew] = useState("");
  const [supEditFlag, setSupEditFlag] = useState(false);
  const [formMsg, setFormMsg] = useState({ text: "", ok: null, pdf: "" });
  const [formLoading, setFormLoading] = useState(false);
  const reqCanvasRef = useRef(null);
  const supCanvasRef = useRef(null);
  const reqPadRef = useRef(null);
  const supPadRef = useRef(null);

  useActiveSession(picUser, setPicUser, setLoggedIn);

  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem("ccm_pic");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!parsed?.nik || !isPicWhitelisted(parsed?.nama)) {
            localStorage.removeItem("ccm_pic");
          } else {
            const { data: userData, error } = await supabase
              .from("nik").select("*").eq("nik", parsed.nik).eq("id_swipe", parsed.id_swipe).single();
            if (error || !userData || !isPicWhitelisted(userData.nama)) {
              localStorage.removeItem("ccm_pic");
            } else {
              localStorage.setItem("ccm_pic", JSON.stringify(userData));
              setPicUser(userData);
              setLoggedIn(true);
            }
          }
        }
      } catch { localStorage.removeItem("ccm_pic"); }
      setCheckingSession(false);
    })();
  }, []);

  async function prosesLogin(e) {
    e.preventDefault();
    setLoginError("");
    if (!picNik || !picPassword) { setLoginError("Wajib isi NIK & ID Swipe!"); return; }
    setLoginLoading(true);
    try {
      const { data: userData, error } = await supabase
        .from("nik").select("*").eq("nik", picNik).eq("id_swipe", picPassword).single();
      if (error || !userData) {
        await supabase.from('log_login').insert([{ nik: picNik, nama: '-', status: 'LOGIN FAILED: Wrong NIK/Password' }]);
        setLoginError("NIK atau ID Swipe salah!"); setLoginLoading(false); return;
      }
      if (!isPicWhitelisted(userData.nama)) { setLoginError("Akses ditolak. Panel ini khusus untuk PIC/TRC terdaftar."); setLoginLoading(false); return; }

      if (userData.active_session) {
        const confirmOverride = confirm("⚠️ Sesi aktif terdeteksi untuk NIK ini. Lanjutkan login dan ambil alih sesi?");
        if (!confirmOverride) { setLoginLoading(false); return; }
      }

      await supabase.from('nik').update({ active_session: new Date().toISOString() }).eq('nik', picNik);
      const token = Math.random().toString(36).substring(2);
      await supabase.from('user_sessions').delete().eq('nik', picNik);
      await supabase.from('user_sessions').insert([{ nik: picNik, token: token, login_at: new Date().toISOString(), last_active: new Date().toISOString() }]);
      await supabase.from('log_login').insert([{ nik: userData.nik, nama: userData.nama, status: 'LOGIN SUCCESS' }]);

      localStorage.setItem("ccm_pic", JSON.stringify(userData));
      localStorage.setItem("ccm_user", JSON.stringify(userData));
      localStorage.setItem("ccm_sup", JSON.stringify(userData));
      localStorage.setItem("session_token", token);
      localStorage.setItem("session_start", Date.now().toString());
      setPicUser(userData);
      setLoggedIn(true);
    } catch (err) { setLoginError("Error koneksi: " + err.message); }
    setLoginLoading(false);
  }

  async function prosesLogout() {
    if (!confirm("Yakin ingin keluar dari Panel PIC?")) return;
    if (picUser) {
      await supabase.from('log_login').insert([{ nik: picUser.nik, nama: picUser.nama, status: 'LOGOUT' }]);
      await supabase.from('nik').update({ active_session: null }).eq('nik', picUser.nik);
    }
    localStorage.removeItem("ccm_pic");
    localStorage.removeItem("ccm_user");
    localStorage.removeItem("ccm_sup");
    localStorage.removeItem("session_token");
    localStorage.removeItem("session_start");
    setLoggedIn(false); setPicUser(null); setPicNik(""); setPicPassword(""); setSection("main");
    setIds({ tersedia: [], aktif: [], nonAktif: [] });
    setSigs({ requesters: [], superiors: [] });
  }

  async function loadInitial() {
    setLoadingData(true);
    try {
      const res = await fetch("/api/pic/id-swipe/initial");
      const json = await parseJsonSafe(res);
      if (json.success) {
        setIds(json.data.ids || { tersedia: [], aktif: [], nonAktif: [] });
        setSigs(json.data.sigs || { requesters: [], superiors: [] });
      } else {
        setFormMsg({ text: "Gagal muat data: " + json.message, ok: false, pdf: "" });
        setStockMsg({ text: "Gagal muat data: " + json.message, ok: false });
      }
    } catch (err) {
      setFormMsg({ text: "Error: " + err.message, ok: false, pdf: "" });
    }
    setLoadingData(false);
  }

  useEffect(() => { if (loggedIn) loadInitial(); }, [loggedIn]);

  function initPads() {
    setTimeout(() => {
      if (reqCanvasRef.current && !reqPadRef.current) {
        resizePad(reqCanvasRef.current);
        reqPadRef.current = new SignaturePad(reqCanvasRef.current, { backgroundColor: "rgba(255,255,255,0)" });
      }
      if (supCanvasRef.current && !supPadRef.current) {
        resizePad(supCanvasRef.current);
        supPadRef.current = new SignaturePad(supCanvasRef.current, { backgroundColor: "rgba(255,255,255,0)" });
      }
    }, 100);
  }

  function resizePad(canvas) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = canvas.offsetWidth || 400, h = canvas.offsetHeight || 150;
    canvas.width = w * ratio; canvas.height = h * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
  }

  useEffect(() => { if (loggedIn && section === "user") initPads(); }, [loggedIn, section, reqSelect, supSelect, reqEditFlag, supEditFlag]);

  function fileToBase64(file) {
    return new Promise((resolve) => {
      if (!file) return resolve("");
      const r = new FileReader();
      r.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.round(w * scale); h = Math.round(h * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      r.onerror = () => resolve("");
      r.readAsDataURL(file);
    });
  }

  async function parseJsonSafe(res) {
    const text = await res.text();
    try { return JSON.parse(text); }
    catch {
      throw new Error(`Server balas bukan JSON (status ${res.status}): ${text.slice(0, 300)}`);
    }
  }

  function idOptions(list, withName) {
    return list.map((o) => {
      const id = typeof o === "string" ? o : o.id;
      const nm = typeof o === "string" ? "" : (o.name || "");
      return withName ? { id, label: `${id} - ${nm}`, name: nm } : { id, label: id, name: "" };
    });
  }

  // ---------- STOCK ----------
  async function handleStockSubmit(e) {
    e.preventDefault();
    const idList = stockRows.map(s => s.trim()).filter(Boolean);
    if (!stockPic.trim()) { setStockMsg({ text: "Wajib isi Nama PIC!", ok: false }); return; }
    if (idList.length === 0) { setStockMsg({ text: "Isi minimal 1 Nomor ID!", ok: false }); return; }
    setStockLoading(true);
    setStockMsg({ text: "Memproses...", ok: null });
    try {
      const fileInput = document.getElementById("stockFile");
      const proofFileBase64 = await fileToBase64(fileInput && fileInput.files[0]);
      const res = await fetch("/api/pic/id-swipe/stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockAction, pic: stockPic.trim(), stockIdsJson: JSON.stringify(idList), proofFileBase64 }),
      });
      const json = await parseJsonSafe(res);
      if (json.success) {
        setStockMsg({ text: json.message, ok: true });
        setStockRows([""]); setStockPic("");
        if (fileInput) fileInput.value = "";
        loadInitial();
      } else setStockMsg({ text: json.message, ok: false });
    } catch (err) { setStockMsg({ text: "Error: " + err.message, ok: false }); }
    setStockLoading(false);
  }

  // ---------- USER FORM ----------
  const isActivation = requestType === "Activation";
  const idPool = isActivation ? idOptions(ids.tersedia, false) : idOptions(ids.aktif, true);

  function setRow(i, patch) {
    setUserRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function onIdChange(i, val) {
    const found = idPool.find(o => o.id === val);
    setRow(i, { id: val, name: !isActivation && found ? found.name : "" });
  }
  useEffect(() => {
    setNewUser(isActivation); setActivationIdCard(isActivation);
    setUserRows([{ id: "", name: "", type: "", pos: "", c: true, m: false, s: false, a: false }]);
  }, [requestType, ids]);

  async function handleFormSubmit(e) {
    e.preventDefault();
    const items = [];
    for (const r of userRows) {
      if (!r.id || !r.name) { setFormMsg({ text: "Lengkapi Employee ID & Name tiap baris!", ok: false, pdf: "" }); return; }
      items.push({ employeeId: r.id, name: r.name, staffType: r.type, staffPosition: r.pos, authCashier: r.c, authManager: r.m, authSupervisor: r.s, authAdmin: r.a });
    }
    if (!reqSelect || !supSelect) { setFormMsg({ text: "Pilih Requester & Superior!", ok: false, pdf: "" }); return; }
    let reqSignatureData = "", supSignatureData = "";
    if (reqSelect === "NEW" || reqEditFlag) {
      if (reqSelect === "NEW" && (!reqNameNew.trim() || !reqPosNew.trim())) { setFormMsg({ text: "Isi nama & jabatan requester baru!", ok: false, pdf: "" }); return; }
      reqSignatureData = reqPadRef.current && !reqPadRef.current.isEmpty() ? reqPadRef.current.toDataURL() : "";
    }
    if (supSelect === "NEW" || supEditFlag) {
      if (supSelect === "NEW" && (!supNameNew.trim() || !supPosNew.trim())) { setFormMsg({ text: "Isi nama & jabatan superior baru!", ok: false, pdf: "" }); return; }
      supSignatureData = supPadRef.current && !supPadRef.current.isEmpty() ? supPadRef.current.toDataURL() : "";
    }
    setFormLoading(true);
    setFormMsg({ text: "Memproses PDF dan update database...", ok: null, pdf: "" });
    try {
      const payload = {
        requestType, newUser: String(newUser), activationIdCard: String(activationIdCard),
        itemsJson: JSON.stringify(items),
        reqSelect, reqNameNew, reqPosNew, reqSignatureData, reqEditFlag: String(reqEditFlag),
        supSelect, supNameNew, supPosNew, supSignatureData, supEditFlag: String(supEditFlag),
      };
      const res = await fetch("/api/pic/id-swipe/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await parseJsonSafe(res);
      if (json.success) {
        setFormMsg({ text: "Proses Berhasil!", ok: true, pdf: json.pdfUrl || "" });
        loadInitial();
      } else setFormMsg({ text: json.message, ok: false, pdf: "" });
    } catch (err) { setFormMsg({ text: "Error: " + err.message, ok: false, pdf: "" }); }
    setFormLoading(false);
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fffcfd]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Memeriksa sesi...</p>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fffcfd] p-6">
        <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-xl p-8 relative">
          <div className="absolute top-4 right-4">
            <a href="/" className="text-[10px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition-colors">← Beranda</a>
          </div>
          <div className="bg-amber-500 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg">
            <span className="text-white text-2xl">🪪</span>
          </div>
          <h1 className="text-xl font-extrabold text-center text-gray-900 mb-1">Panel PIC</h1>
          <p className="text-xs text-center text-gray-400 mb-8">Akses terbatas — khusus PIC/TRC terdaftar</p>
          <form onSubmit={prosesLogin} className="space-y-4">
            <input type="text" placeholder="NIK" value={picNik} onChange={(e) => setPicNik(e.target.value)} className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
            <input type="password" placeholder="ID Swipe" value={picPassword} onChange={(e) => setPicPassword(e.target.value)} className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-100 outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
            {loginError && <div className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl">{loginError}</div>}
            <button type="submit" disabled={loginLoading} className="w-full py-3.5 bg-amber-500 text-white font-bold rounded-2xl shadow-lg disabled:opacity-60">{loginLoading ? "Memverifikasi..." : "Masuk Panel"}</button>
          </form>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "ID Tersedia", count: ids.tersedia.length, color: "text-green-600" },
    { label: "ID Aktif", count: ids.aktif.length, color: "text-amber-600" },
    { label: "ID Non-Aktif", count: ids.nonAktif.length, color: "text-red-600" },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans text-gray-800 pb-12">
      <header className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2 font-black text-sm"><span className="bg-white text-amber-600 px-2 py-1 rounded-lg">AEON</span> PANEL PIC</div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold opacity-80 hidden sm:block">{picUser?.nama}</span>
          <button onClick={prosesLogout} className="bg-white/20 px-3 py-2 rounded-xl text-xs font-bold hover:bg-white/30">Logout</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {section === "main" && (
          <>
            <div className="text-center py-4">
              <h2 className="text-2xl font-extrabold">DASHBOARD MANAGEMENT <span className="text-amber-600">ID SWIPE</span></h2>
              <p className="text-gray-500 mt-1 text-sm">Sistem Informasi Manajemen Kartu Akses & Formulir Otomatis</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {stats.map(s => (
                <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm">
                  <p className="text-[10px] font-black text-gray-400 uppercase">{s.label}</p>
                  <h3 className={`text-2xl font-black ${s.color}`}>{loadingData ? "…" : s.count}</h3>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => setSection("stock")} className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-10 text-white text-center shadow-lg hover:-translate-y-1 transition-all">
                <span className="text-5xl block mb-3">📦</span>
                <span className="font-bold">Stok & Pengembalian HRD</span>
              </button>
              <button onClick={() => setSection("user")} className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-10 text-white text-center shadow-lg hover:-translate-y-1 transition-all">
                <span className="text-5xl block mb-3">📝</span>
                <span className="font-bold">Form Request User Swipe</span>
              </button>
            </div>
          </>
        )}

        {section !== "main" && (
          <button onClick={() => setSection("main")} className="flex items-center text-gray-600 hover:text-amber-600 font-semibold text-sm">← Kembali ke Menu</button>
        )}

        {section === "stock" && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h4 className="text-xl font-bold mb-6 border-b pb-3">Manajemen <span className="text-amber-600">Stok ID</span> (HRD)</h4>
            <form onSubmit={handleStockSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Jenis Aksi</label>
                  <select value={stockAction} onChange={(e) => { setStockAction(e.target.value); setStockRows([""]); }} className="w-full border rounded-lg px-4 py-2.5 bg-gray-50 text-sm">
                    <option value="ADD_FROM_HRD">Request ID Baru ke HRD (Tambah Stok Tersedia)</option>
                    <option value="RETURN_TO_HRD">Pengembalian ID ke HRD (Kurangi Stok Non-Aktif)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Nama PIC Lapangan</label>
                  <input type="text" value={stockPic} onChange={(e) => setStockPic(e.target.value)} placeholder="Nama Lengkap Anda" className="w-full border rounded-lg px-4 py-2.5 text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-amber-600 mb-2">Lampirkan Foto Tanda Terima (Bukti HRD)</label>
                  <input type="file" id="stockFile" accept="image/*" className="w-full border-2 border-dashed border-amber-300 rounded-lg p-2 text-sm" />
                </div>
              </div>
              <button type="button" onClick={() => setStockRows(prev => [...prev, ""])} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Tambah Baris ID</button>
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100"><tr><th className="px-4 py-3 text-left text-xs font-bold uppercase">Nomor ID Swipe</th><th className="px-4 py-3 text-center text-xs font-bold uppercase w-20">Hapus</th></tr></thead>
                  <tbody>
                    {stockRows.map((v, i) => {
                      const usedElsewhere = stockAction === "RETURN_TO_HRD" ? stockRows.filter((x, j) => j !== i && x.trim() !== "" && x === v) : [];
                      const pool = stockAction === "RETURN_TO_HRD"
                        ? ids.nonAktif.filter(id => !stockRows.some((x, j) => j !== i && x === id))
                        : null;
                      return (
                        <tr key={i} className="border-t">
                          <td className="p-2">
                            {stockAction === "RETURN_TO_HRD" ? (
                              <select value={v} onChange={(e) => setStockRows(prev => prev.map((x, j) => j === i ? e.target.value : x))} className="w-full border rounded px-3 py-1.5 text-sm">
                                <option value="">-- Pilih ID yang Dikembalikan --</option>
                                {pool.map(id => <option key={id} value={id}>{id}</option>)}
                                {v && !pool.includes(v) && <option value={v}>{v}</option>}
                              </select>
                            ) : (
                              <input type="text" value={v} onChange={(e) => setStockRows(prev => prev.map((x, j) => j === i ? e.target.value : x))} placeholder="Ketik ID Baru" className="w-full border rounded px-3 py-1.5 text-sm" />
                            )}
                            {usedElsewhere.length > 0 && <p className="text-[11px] text-red-500 mt-1">ID sudah dipilih di baris lain</p>}
                          </td>
                          <td className="p-2 text-center">
                            <button type="button" disabled={stockRows.length <= 1} onClick={() => setStockRows(prev => prev.filter((_, j) => j !== i))} className="bg-red-500 text-white rounded px-2.5 py-1 font-bold disabled:opacity-40">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="submit" disabled={stockLoading} className="w-full bg-gray-800 text-white font-bold py-4 rounded-xl disabled:opacity-60">{stockLoading ? "Memproses..." : "PROSES UPDATE STOK"}</button>
            </form>
            {stockMsg.text && <div className={`mt-4 text-center font-bold text-sm p-3 rounded-xl ${stockMsg.ok ? "bg-green-100 text-green-700" : stockMsg.ok === false ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-600"}`}>{stockMsg.text}</div>}
          </div>
        )}

        {section === "user" && (
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-6">
            <h4 className="text-xl font-bold border-b pb-3">Form Request <span className="text-amber-600">User Swipe</span></h4>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex flex-wrap gap-4">
                {[["Activation", "Activation"], ["Edit", "Edit User"], ["Non-Aktif", "Non-Active"]].map(([v, l]) => (
                  <label key={v} className="inline-flex items-center cursor-pointer">
                    <input type="radio" name="requestType" checked={requestType === v} onChange={() => setRequestType(v)} className="h-5 w-5 accent-amber-600" />
                    <span className="ml-2 font-semibold">{l}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-col justify-center gap-2">
                <label className="inline-flex items-center"><input type="checkbox" checked={newUser} onChange={(e) => setNewUser(e.target.checked)} className="h-5 w-5 accent-amber-600" /><span className="ml-2">New User</span></label>
                <label className="inline-flex items-center"><input type="checkbox" checked={activationIdCard} onChange={(e) => setActivationIdCard(e.target.checked)} className="h-5 w-5 accent-amber-600" /><span className="ml-2">Activation ID CARD</span></label>
              </div>
            </div>

            <button type="button" onClick={() => setUserRows(prev => [...prev, { id: "", name: "", type: "", pos: "", c: true, m: false, s: false, a: false }])} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg text-sm">+ Tambah Baris User</button>
            <div className="border rounded-lg overflow-x-auto hidden md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100"><tr>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase">Employee ID</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase">Name</th>
                  <th className="px-3 py-3 text-left text-xs font-bold uppercase">Type & Position</th>
                  <th className="px-3 py-3 text-center text-xs font-bold uppercase">Authority</th>
                  <th className="px-3 py-3 text-center text-xs font-bold uppercase">✕</th>
                </tr></thead>
                <tbody>
                  {userRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <select value={r.id} onChange={(e) => onIdChange(i, e.target.value)} className="w-full border rounded p-1.5 text-sm">
                          <option value="">Pilih ID</option>
                          {idPool.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="p-2"><input type="text" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Ketik Nama" className="w-full border rounded p-1.5 text-sm" /></td>
                      <td className="p-2 space-y-1">
                        <input type="text" value={r.type} onChange={(e) => setRow(i, { type: e.target.value })} placeholder="Type (Staff/Mitra)" className="w-full border rounded p-1.5 text-sm" />
                        <input type="text" value={r.pos} onChange={(e) => setRow(i, { pos: e.target.value })} placeholder="Position" list="posList" className="w-full border rounded p-1.5 text-sm" />
                      </td>
                      <td className="p-2">
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          {[["c", "Cashier"], ["m", "Manager"], ["s", "Supervisor"], ["a", "Admin"]].map(([k, l]) => (
                            <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" checked={r[k]} onChange={(e) => setRow(i, { [k]: e.target.checked })} className="accent-amber-600" />{l}</label>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <button type="button" disabled={userRows.length <= 1} onClick={() => setUserRows(prev => prev.filter((_, j) => j !== i))} className="bg-red-500 text-white rounded px-2 py-1 font-bold disabled:opacity-40">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {userRows.map((r, i) => (
                <div key={i} className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs uppercase text-gray-500">User #{i + 1}</span>
                    <button type="button" disabled={userRows.length <= 1} onClick={() => setUserRows(prev => prev.filter((_, j) => j !== i))} className="bg-red-500 text-white rounded-lg w-10 h-10 font-bold disabled:opacity-40">✕</button>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Employee ID</label>
                    <select value={r.id} onChange={(e) => onIdChange(i, e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white">
                      <option value="">Pilih ID</option>
                      {idPool.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Name</label>
                    <input type="text" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Ketik Nama" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Type</label>
                    <input type="text" value={r.type} onChange={(e) => setRow(i, { type: e.target.value })} placeholder="Type (Staff/Mitra)" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Position</label>
                    <input type="text" value={r.pos} onChange={(e) => setRow(i, { pos: e.target.value })} placeholder="Position" list="posList" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Authority</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[["c", "Cashier"], ["m", "Manager"], ["s", "Supervisor"], ["a", "Admin"]].map(([k, l]) => (
                        <label key={k} className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 text-sm cursor-pointer ${r[k] ? "border-amber-500 bg-amber-50 font-bold text-amber-700" : "border-gray-300 bg-white text-gray-600"}`}>
                          <input type="checkbox" checked={r[k]} onChange={(e) => setRow(i, { [k]: e.target.checked })} className="h-5 w-5 accent-amber-600" />{l}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <datalist id="posList"><option value="Cashier" /><option value="Customer Service" /></datalist>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-xl p-4">
                <h6 className="font-extrabold text-center text-xs uppercase text-gray-500 mb-3">Requested By</h6>
                <select value={reqSelect} onChange={(e) => { setReqSelect(e.target.value); setReqEditFlag(false); reqPadRef.current?.clear(); }} className="w-full border-2 border-amber-500 rounded-lg px-3 py-2 text-sm mb-3">
                  <option value="">-- Pilih Requester --</option>
                  <option value="NEW">+++ TAMBAH REQUESTER BARU +++</option>
                  {sigs.requesters.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                {reqSelect === "NEW" && (
                  <div className="space-y-2 mb-3">
                    <input type="text" value={reqNameNew} onChange={(e) => setReqNameNew(e.target.value)} placeholder="Nama Lengkap Pemohon" className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <input type="text" value={reqPosNew} onChange={(e) => setReqPosNew(e.target.value)} placeholder="Jabatan Pemohon" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
                {(reqSelect === "NEW" || (reqSelect && reqEditFlag)) ? (
                  <div>
                    <canvas ref={reqCanvasRef} className="w-full h-[150px] border-2 border-dashed border-gray-400 rounded-lg bg-white touch-none" />
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => reqPadRef.current?.clear()} className="flex-1 border border-red-500 text-red-500 rounded-lg py-1.5 text-sm">Hapus TTD</button>
                      {reqSelect && reqEditFlag && <button type="button" onClick={() => { setReqEditFlag(false); reqPadRef.current?.clear(); }} className="flex-1 bg-gray-500 text-white rounded-lg py-1.5 text-sm">Batal Edit</button>}
                    </div>
                  </div>
                ) : reqSelect ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <p className="text-green-700 font-bold mb-2">✓ Data & TTD Siap</p>
                    <button type="button" onClick={() => setReqEditFlag(true)} className="border border-green-600 text-green-700 rounded-lg px-4 py-1.5 text-sm">Edit Tanda Tangan</button>
                  </div>
                ) : null}
              </div>
              <div className="border rounded-xl p-4">
                <h6 className="font-extrabold text-center text-xs uppercase text-gray-500 mb-3">Acknowledge By (Superior)</h6>
                <select value={supSelect} onChange={(e) => { setSupSelect(e.target.value); setSupEditFlag(false); supPadRef.current?.clear(); }} className="w-full border-2 border-amber-500 rounded-lg px-3 py-2 text-sm mb-3">
                  <option value="">-- Pilih Superior --</option>
                  <option value="NEW">+++ TAMBAH SUPERIOR BARU +++</option>
                  {sigs.superiors.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                {supSelect === "NEW" && (
                  <div className="space-y-2 mb-3">
                    <input type="text" value={supNameNew} onChange={(e) => setSupNameNew(e.target.value)} placeholder="Nama Lengkap Superior" className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <input type="text" value={supPosNew} onChange={(e) => setSupPosNew(e.target.value)} placeholder="Jabatan Superior" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
                {(supSelect === "NEW" || (supSelect && supEditFlag)) ? (
                  <div>
                    <canvas ref={supCanvasRef} className="w-full h-[150px] border-2 border-dashed border-gray-400 rounded-lg bg-white touch-none" />
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => supPadRef.current?.clear()} className="flex-1 border border-red-500 text-red-500 rounded-lg py-1.5 text-sm">Hapus TTD</button>
                      {supSelect && supEditFlag && <button type="button" onClick={() => { setSupEditFlag(false); supPadRef.current?.clear(); }} className="flex-1 bg-gray-500 text-white rounded-lg py-1.5 text-sm">Batal Edit</button>}
                    </div>
                  </div>
                ) : supSelect ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <p className="text-green-700 font-bold mb-2">✓ Data & TTD Siap</p>
                    <button type="button" onClick={() => setSupEditFlag(true)} className="border border-green-600 text-green-700 rounded-lg px-4 py-1.5 text-sm">Edit Tanda Tangan</button>
                  </div>
                ) : null}
              </div>
            </div>

            <button onClick={handleFormSubmit} disabled={formLoading} className="w-full bg-amber-500 text-white font-bold py-4 rounded-xl disabled:opacity-60">{formLoading ? "Memproses..." : "PROSES REQUEST & DOWNLOAD PDF"}</button>
            {formMsg.text && (
              <div className={`text-center font-bold text-sm p-3 rounded-xl ${formMsg.ok ? "bg-green-100 text-green-700" : formMsg.ok === false ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-600"}`}>
                {formMsg.text}
                {formMsg.pdf && <a href={formMsg.pdf} target="_blank" rel="noopener noreferrer" className="block mt-3 bg-amber-500 text-white font-bold py-2 px-6 rounded-lg">UNDUH PDF SEKARANG</a>}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
