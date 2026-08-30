// src/lib/absensiHelpers.js

export const NIK_HEAD_DEPT = ["1612004", "2510009", "2511139", "2303031", "2601006"];

export function cleanData(val) {
  if (val === undefined || val === null || val === "") return "";
  let str = String(val).trim();
  if (str.endsWith(".0")) str = str.slice(0, -2);
  return str;
}

// "dd/MM/yyyy" (format asli dari Code.gs) -> "yyyy-MM-dd" (untuk kolom date Postgres)
export function ddmmyyyyToIso(val) {
  if (!val) return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function isoToDdMmYyyy(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// Persis logika hitungJamKerja di Code.gs
export function hitungJamKerja(code) {
  if (code === "XX") return { jam: "09:00 - 18:00", isOff: false };
  if (!code || code.toUpperCase() === "X" || code === "DAYOFF" || code === "-") {
    return { jam: "Enjoy the rest of the day!", isOff: true };
  }
  const type = code.charAt(0);
  const letter = code.charAt(1);
  if (!letter) return { jam: "", isOff: false };
  const letterCode = letter.charCodeAt(0) - 64;
  if (letterCode < 1 || letterCode > 24) return { jam: "", isOff: false };
  const startHour = letterCode === 24 ? 0 : letterCode;
  let startMin = "00", duration = 8;
  if (type === "A") { startMin = "00"; duration = 9; }
  else if (type === "B") { startMin = "30"; duration = 9; }
  else if (type === "C") { startMin = "00"; duration = 8; }
  else if (type === "D") { startMin = "30"; duration = 8; }
  else if (type === "E") { startMin = "00"; duration = 6; }
  else if (type === "F") { startMin = "30"; duration = 6; }
  else return { jam: "", isOff: false };
  const endHour = (startHour + duration) % 24;
  const pad = (n) => (n < 10 ? "0" : "") + n;
  return { jam: `${pad(startHour)}:${startMin} - ${pad(endHour)}:${startMin}`, isOff: false };
}

// Cek shift yang melewati tengah malam (misal 22:00 - 06:00)
export function isOvernightShift(jamStr) {
  if (!jamStr || jamStr.indexOf("-") === -1) return false;
  const [s, e] = jamStr.split("-");
  const sp = s.trim().split(":");
  const ep = e.trim().split(":");
  const startMin = parseInt(sp[0], 10) * 60 + parseInt(sp[1], 10);
  const endMin = parseInt(ep[0], 10) * 60 + parseInt(ep[1], 10);
  return endMin <= startMin;
}

// Persis logika hitungLateEarlyDurasi di Code.gs
export function hitungLateEarlyDurasi(clockIn, clockOut, shiftJam) {
  let lateIn = "00:00", earlyOut = "00:00", durasi = "-";
  if (!shiftJam || shiftJam.indexOf("-") === -1) return { late: lateIn, early: earlyOut, durasi };
  const [expInRaw, expOutRaw] = shiftJam.split("-");
  const expIn = expInRaw.trim(), expOut = expOutRaw.trim();

  if (clockIn && clockIn !== "-" && expIn !== "") {
    const [ih, im] = clockIn.split(":").map(Number);
    const [eh, em] = expIn.split(":").map(Number);
    const tIn = new Date(2000, 0, 1, ih, im);
    const tExpIn = new Date(2000, 0, 1, eh, em);
    if (tIn > tExpIn) {
      const diff = tIn - tExpIn;
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
      lateIn = `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
    }
  }
  if (clockOut && clockOut !== "-" && expOut !== "") {
    const [oh, om] = clockOut.split(":").map(Number);
    const [eh, em] = expOut.split(":").map(Number);
    const tOut = new Date(2000, 0, 1, oh, om);
    const tExpOut = new Date(2000, 0, 1, eh, em);
    if (tOut < tExpOut) {
      const diff = tExpOut - tOut;
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
      earlyOut = `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
    }
  }
  if (clockIn && clockIn !== "-" && clockOut && clockOut !== "-") {
    const [ih, im] = clockIn.split(":").map(Number);
    const [oh, om] = clockOut.split(":").map(Number);
    const dIn = new Date(2000, 0, 1, ih, im);
    let dOut = new Date(2000, 0, 1, oh, om);
    if (dOut < dIn) dOut.setDate(dOut.getDate() + 1);
    const diff = dOut - dIn;
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
    durasi = `${h}:${m < 10 ? "0" : ""}${m}`;
  }
  return { late: lateIn, early: earlyOut, durasi };
}

// Persis logika getRemarks di Code.gs
export function getRemarks(clockIn, clockOut, isOff, lateIn, earlyOut) {
  const noIn = !clockIn || clockIn === "-";
  const noOut = !clockOut || clockOut === "-";
  if (isOff && !noIn && !noOut) return "Perubahan Schedule";
  if (isOff && noIn && noOut) return "OFF";
  if (noIn && noOut) return "Alpha";
  const msgs = [];
  const isLate = lateIn && lateIn !== "00:00" && lateIn !== "-";
  const isEarly = earlyOut && earlyOut !== "00:00" && earlyOut !== "-";
  if (noIn) msgs.push("No Clock In"); else if (isLate) msgs.push("Late In");
  if (noOut) msgs.push("No Clock Out"); else if (isEarly) msgs.push("Early Out");
  if (msgs.length > 0) return msgs.join(" & ");
  return "Present";
}
