// src/app/page.js
import Link from "next/link";

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

        <div className="space-y-4">
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

        <p className="text-center text-[10px] text-gray-300 mt-10 font-semibold uppercase tracking-wider">
          AEON DPM Semarang
        </p>
      </div>
    </div>
  );
}
