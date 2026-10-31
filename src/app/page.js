// src/app/page.js
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Web dibuka -> langsung arahkan ke halaman login terpusat.
// Jika sudah ada sesi tersimpan, /login akan otomatis lanjut
// ke dashboard sesuai role masing-masing.
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#fffcfd] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-[#e20074] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Mengalihkan ke halaman login...</p>
      </div>
    </div>
  );
}
