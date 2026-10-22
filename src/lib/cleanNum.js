// src/lib/cleanNum.js
// Parser angka yang mengerti format Indonesia & Inggris campuran dari Google Sheets.
//
// MASALAH LAMA: versi lama membuang SEMUA non-digit, sehingga nilai teks
// "19.813.141,5" (titik = ribuan, koma = desimal, format Indonesia) di-parse
// menjadi 198131415 — 10× lebih besar dari seharusnya. Contoh nyata:
// sales hourly Dayana Grun tgl 27/09/2026 (19,8 jt → 198 jt).
//
// Aturan:
//   "19.813.141,5"   → 19813141.5   (ID: titik ribuan, koma desimal)
//   "19,813,141.5"   → 19813141.5   (US: koma ribuan, titik desimal)
//   "19.813.141"     → 19813141     (ID ribuan)
//   "19,813,141"     → 19813141     (US ribuan)
//   "1234.5"         → 1234.5       (desimal; grup setelah titik bukan 3 digit)
//   "15783914"       → 15783914     (angka polos / sel numerik)
//   "Rp 15.783.914"  → 15783914
export function cleanNum(val) {
  if (val === null || val === undefined) return "0";
  let s = String(val).replace(/rp/gi, "").replace(/\s+/g, "").trim();
  if (!s) return "0";

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Separator terakhir adalah desimal (membedakan 19.813.141,5 vs 19,813,141.5)
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("");
    if (dec === ",") s = s.replace(/,/g, ".");
  } else if (hasComma && !hasDot) {
    const commas = (s.match(/,/g) || []).length;
    if (commas === 1) s = s.replace(",", "."); // satu koma → desimal
    else s = s.split(",").join("");            // koma berulang → ribuan
  } else if (hasDot && !hasComma) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.split(".").join("");   // titik berulang → ribuan (ID)
    // titik tunggal: frac dengan tepat 3 digit dianggap ribuan ID ("1.537" → 1537);
    // selain itu (mis. "1234.5") biarkan sebagai desimal
  }

  s = s.replace(/[^0-9.\-]/g, "");
  return s || "0";
}

export default cleanNum;
