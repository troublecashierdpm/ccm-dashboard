// src/app/page.js
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const menu = [
  {
    href: "/kasir",
    icon: "🛒",
    title: "Dashboard Kasir",
    desc: "Raport performa, request schedule & alteration untuk kasir",
    color: "from-[#e20074] to-[#ff1a8c]"
  },
  {
    href: "/supervisor",
    icon: "📊",
    title: "Panel Supervisor",
    desc: "Monitoring seluruh staff, approval, dan sinkronisasi data",
    color: "from-indigo-500 to-purple-500"
  },
  {
    href: "/absensi",
    icon: "🕐",
    title: "Absensi PPKK",
    desc: "Clock in/out, request attendance, dan jadwal shift",
    color: "from-teal-500 to-emerald-500"
  }
];

export default function HomePage() {
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data, error } = await supabase
          .from("log_login")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(10);
        if (!error && data) {
          setLogs(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingLogs(false);
      }
    }
    fetchLogs();
  }, []);

  return (
    <div className="min-h-screen bg-[#fffcfd] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="bg-[#e20074] w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-lg shadow-pink-200">
            <span className="text-white font-black text-xl tracking-tighter">AEON</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-1">CCM DPM Portal</h1>
          <p className="text-gray-400 text-sm">Pilih dashboard yang ingin dibuka</p>
        </div>

        <div className="space-y-4 mb-8">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-4 bg-white border border-gray-100 rounded-[1.75rem] p-5 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className={`w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center text-2xl shadow-md`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-gray-900 text-base group-hover:text-[#e20074] transition-colors">
                  {item.title}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
              </div>
              <span className="text-gray-300 group-hover:text-[#e20074] group-hover:translate-x-1 transition-all text-lg">
                →
              </span>
            </Link>
          ))}
        </div>

        {/* Live Log Login Notice */}
        <div className="bg-white border border-gray-100 rounded-[1.75rem] p-5 shadow-sm">
          <h3 className="font-extrabold text-xs text-gray-700 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>📋 Live Login Activity</span>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
            {loadingLogs ? (
              <p className="text-gray-400 text-center py-4">Memuat log...</p>
            ) : logs.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Belum ada aktivitas.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-bold text-gray-800">{log.nama} <span className="text-gray-400 font-normal">({log.nik})</span></p>
                    <p className="text-[10px] text-gray-500">{log.status}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {new Date(log.timestamp || log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-8 font-semibold uppercase tracking-wider">
          AEON DPM Semarang
        </p>
      </div>
    </div>
  );
}
