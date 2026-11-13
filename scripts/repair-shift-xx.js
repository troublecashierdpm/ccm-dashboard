// scripts/repair-shift-xx.js
// Repair data sekali jalan: baris absensi_log dengan shift "XX" yang sebenarnya
// punya jadwal kerja di absensi_master_schedule pada tanggal yang sama
// di-update mengikuti jadwal tersebut (kasus: chrysilla 2026-11-01 log XX, jadwal DN).
//
// Aman dijalankan berulang (idempoten): baris yang sudah sesuai jadwal tidak disentuh.
// Juga menghitung ulang late_in/early_out/durasi_kerja/remarks sesuai shift baru.
//
// Pemakaian:
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node scripts/repair-shift-xx.js
//   (tanpa --dry-run akan langsung menulis; tambahkan --dry-run untuk lihat saja)

import { createClient } from '@supabase/supabase-js';

const dryRun = process.argv.includes('--dry-run');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Env NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

function hitungJamKerja(code) {
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

function toMinutes(t) {
  if (!t || t === "-") return null;
  const p = String(t).split(":");
  if (p.length < 2) return null;
  const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function hitungLateEarlyDurasi(clockIn, clockOut, shiftJam) {
  let lateIn = "00:00", earlyOut = "00:00", durasi = "-";
  if (!shiftJam || shiftJam.indexOf("-") === -1) return { late: lateIn, early: earlyOut, durasi };
  const [expInRaw, expOutRaw] = shiftJam.split("-");
  const inMin = toMinutes(clockIn), expInMin = toMinutes(expInRaw.trim());
  const outMin = toMinutes(clockOut), expOutMin = toMinutes(expOutRaw.trim());
  if (inMin !== null && expInMin !== null && inMin > expInMin) {
    const d = inMin - expInMin;
    lateIn = `${Math.floor(d / 60) < 10 ? "0" : ""}${Math.floor(d / 60)}:${d % 60 < 10 ? "0" : ""}${d % 60}`;
  }
  if (outMin !== null && expOutMin !== null && outMin < expOutMin) {
    const d = expOutMin - outMin;
    earlyOut = `${Math.floor(d / 60) < 10 ? "0" : ""}${Math.floor(d / 60)}:${d % 60 < 10 ? "0" : ""}${d % 60}`;
  }
  if (inMin !== null && outMin !== null) {
    let d = outMin - inMin;
    if (d < 0) d += 24 * 60;
    durasi = `${Math.floor(d / 60) < 10 ? "0" : ""}${Math.floor(d / 60)}:${d % 60 < 10 ? "0" : ""}${d % 60}`;
  }
  return { late: lateIn, early: earlyOut, durasi };
}

function getRemarks(clockIn, clockOut, isOff, lateIn, earlyOut) {
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

async function fetchAll(table, select) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`Gagal baca ${table}: ` + error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  console.log(dryRun ? "MODE: DRY RUN (tidak menulis)\n" : "MODE: TULIS\n");

  const logRows = await fetchAll('absensi_log', 'id, nik, tanggal, shift, clock_in, clock_out');
  const schedRows = await fetchAll('absensi_master_schedule', 'nik, tanggal, shift_code');

  const schedMap = {};
  schedRows.forEach(r => {
    const d = String(r.tanggal).slice(0, 10);
    if (!schedMap[r.nik]) schedMap[r.nik] = {};
    schedMap[r.nik][d] = r.shift_code;
  });

  let scanned = 0, fixed = 0, skipped = 0;
  for (const row of logRows) {
    scanned++;
    // Koreksi baris tanpa shift jelas: "XX", "-", atau kosong
    if (!['XX', '-', ''].includes(String(row.shift || ''))) continue;
    const d = String(row.tanggal).slice(0, 10);
    const sched = (schedMap[row.nik] && schedMap[row.nik][d]) || '';
    // Hanya koreksi kalau jadwal asli = kode shift kerja yang berbeda dari XX
    if (!sched || sched === 'XX' || sched === '-' || hitungJamKerja(sched).isOff) {
      skipped++;
      continue;
    }
    const jam = hitungJamKerja(sched).jam;
    const calc = hitungLateEarlyDurasi(row.clock_in, row.clock_out, jam);
    const remarks = getRemarks(row.clock_in, row.clock_out, false, calc.late, calc.early);
    const payload = {
      shift: sched, remarks,
      late_in: calc.late, early_out: calc.early, durasi_kerja: calc.durasi
    };
    console.log(`[FIX] nik=${row.nik} tanggal=${d}: XX -> ${sched} (in=${row.clock_in || '-'} out=${row.clock_out || '-'} remarks=${remarks})`);
    if (!dryRun) {
      const { error } = await supabase.from('absensi_log').update(payload).eq('id', row.id);
      if (error) {
        console.error(`  GAGAL update id=${row.id}: ` + error.message);
        continue;
      }
    }
    fixed++;
  }

  console.log(`\nSelesai. Dipindai: ${scanned} baris, dikoreksi: ${fixed}, dilewati (XX sah/tanpa jadwal): ${skipped}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
