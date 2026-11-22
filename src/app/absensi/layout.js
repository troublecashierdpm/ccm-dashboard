export default function AbsensiLayout({ children }) {
  return (
    <div className="pb-16">
      {children}
      <a href="/" className="fixed bottom-4 left-4 z-50 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#e20074] shadow-lg border border-pink-100 hover:bg-pink-50">
        ← Kembali ke Portal
      </a>
    </div>
  );
}
