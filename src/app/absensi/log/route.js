// src/app/api/absensi/log/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hitungJamKerja, hitungLateEarlyDurasi, getRemarks } from '@/lib/absensiHelpers';

const MONTH_NAMES_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const nik = searchParams.get('nik');
    const monthStr = searchParams.get('month'); // format "YYYY-MM", opsional
    if (!nik) return NextResponse.json({ success: false, message: "NIK wajib diisi" });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const now = new Date();
    let targetYear, targetMonth; // targetMonth 0-indexed
    if (monthStr) {
      const [y, m] = monthStr.split('-');
      targetYear = parseInt(y, 10);
      targetMonth = parseInt(m, 10) - 1;
    } else {
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
    }

    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
    const monthStartIso = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;
    const monthEndIso = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const monthYearStr = `${MONTH_NAMES_ID[targetMonth]} ${targetYear}`;

    const { data: logRows } = await supabase
      .from('absensi_log').select('*')
      .eq('nik', nik).gte('tanggal', monthStartIso).lte('tanggal', monthEndIso);
    const logMap = {};
    (logRows || []).forEach(r => { logMap[r.tanggal] = r; });

    const { data: jadwalRows } = await supabase
      .from('absensi_master_schedule').select('tanggal, shift_code')
      .eq('nik', nik).gte('tanggal', monthStartIso).lte('tanggal', monthEndIso);
    const jadwalMap = {};
    (jadwalRows || []).forEach(r => { jadwalMap[r.tanggal] = r.shift_code; });

    const isPastMonth = (targetYear < now.getFullYear()) || (targetYear === now.getFullYear() && targetMonth < now.getMonth());
    const isCurrentMonth = (targetYear === now.getFullYear() && targetMonth === now.getMonth());
    const todayNow = now.getDate();

    let statLate = 0, statEarly = 0, statAbsent = 0, statNoIn = 0, statPresent = 0;
    const resultList = [];

    for (let d = 1; d <= lastDay; d++) {
      const dateIso = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const loopDate = new Date(targetYear, targetMonth, d);
      const displayDate = `${DAY_NAMES_ID[loopDate.getDay()]}, ${String(d).padStart(2, '0')} ${MONTH_NAMES_ID[targetMonth]}`;
      const fullDisplayDate = `${displayDate} ${targetYear}`;

      const shiftCode = jadwalMap[dateIso] || "XX";
      const shiftDetails = hitungJamKerja(shiftCode);

      const logRow = logMap[dateIso];
      const actualIn = (logRow && logRow.clock_in) || "-";
      const actualOut = (logRow && logRow.clock_out) || "-";
      const totalHrs = (logRow && logRow.durasi_kerja) || "-";
      const fInUrl = (logRow && logRow.foto_in) || "";
      const fOutUrl = (logRow && logRow.foto_out) || "";

      const calculated = hitungLateEarlyDurasi(actualIn, actualOut, shiftDetails.jam);
      let remarks = (logRow && logRow.remarks) || getRemarks(actualIn, actualOut, shiftDetails.isOff, calculated.late, calculated.early);
      if (shiftDetails.isOff) remarks = "OFF";

      const isLate = calculated.late !== "00:00" && calculated.late !== "-";
      const isEarly = calculated.early !== "00:00" && calculated.early !== "-";

      const countThisDay = isPastMonth || (isCurrentMonth && d <= todayNow);
      if (countThisDay) {
        if (isLate) statLate++;
        if (isEarly) statEarly++;
        if (remarks === "Alpha") statAbsent++;
        if (remarks.indexOf("No Clock In") !== -1 || remarks.indexOf("No Clock Out") !== -1) statNoIn++;
        if (remarks === "Present" || remarks === "Normal" || remarks === "Perubahan Schedule") statPresent++;
      }

      resultList.push({
        date: displayDate, fullDate: fullDisplayDate,
        shift: shiftDetails.isOff ? "Day off" : shiftCode,
        shiftJam: shiftDetails.jam, in: actualIn, out: actualOut, totalHours: totalHrs,
        isLate, isEarly, isOff: shiftDetails.isOff, fotoIn: fInUrl, fotoOut: fOutUrl, remarks,
        lateIn: calculated.late, earlyOut: calculated.early
      });
    }

    return NextResponse.json({
      success: true, month: monthYearStr,
      stats: { late: statLate, early: statEarly, absent: statAbsent, noIn: statNoIn, present: statPresent },
      logs: resultList
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
