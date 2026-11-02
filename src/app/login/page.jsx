// src/app/login/page.jsx
"use client";
import { useEffect } from "react";

export default function LoginHubPage() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return (
    <div className="min-h-screen bg-[#fffcfd] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-[#e20074] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Mengalihkan...</p>
      </div>
    </div>
  );
}
