// src/app/api/absensi/team-status/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hitungJamKerja, hitungLateEarlyDurasi, getRemarks } from '@/lib/absensiHelpers';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tanggal = searchParams.get('tanggal') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: users } = await supabase.from('absensi_nik').select('nik, nama, status, file_id').eq('status', 'PPKK');
    const { data: jadwalRows } = await supabase.from('absensi_master_schedule').select('nik, shift_code').eq('tanggal', tanggal);
    const jadwalMap = {};
    (jadwalRows || []).forEach(j => { jadwalMap[j.nik] = j.shift_code; });

    const { data: logRows } = await supabase.from('absensi_log').select('nik, clock_in, clock_out').eq('tanggal', tanggal);
    const logMap = {};
    (logRows || []).forEach(l => { logMap[l.nik] = l; });

    const results = (users || []).map(u => {
      const shiftCode = jadwalMap[u.nik] || "XX";
      const shiftInfo = hitungJamKerja(shiftCode);
      const log = logMap[u.nik] || { clock_in: "-", clock_out: "-" };
      const actIn = log.clock_in || "-";
      const actOut = log.clock_out || "-";

      let expIn = "", expOut = "";
      if (shiftInfo.jam && shiftInfo.jam.indexOf("-") !== -1) {
        const [a, b] = shiftInfo.jam.split("-");
        expIn = a.trim(); expOut = b.trim();
      }

      let status = "Normal";
      if (shiftInfo.isOff) {
        status = (actIn !== "-" || actOut !== "-") ? "Extra/Lembur" : "Day Off";
      } else {
        const calculated = hitungLateEarlyDurasi(actIn, actOut, shiftInfo.jam);
        const remarks = getRemarks(actIn, actOut, shiftInfo.isOff, calculated.late, calculated.early);
        if (remarks === "Alpha") status = "Absent";
        else if (remarks.indexOf("No Clock In") !== -1 || remarks.indexOf("No Clock Out") !== -1) status = "No Clock In";
        else if (remarks.indexOf("Late In") !== -1) status = "Late";
        else if (remarks.indexOf("Early Out") !== -1) status = "Early";
        else status = "Normal";
      }

      return {
        nik: u.nik, nama: u.nama,
        photoUrl: u.file_id ? `https://drive.google.com/thumbnail?id=${u.file_id}&sz=w500` : "",
        shift: shiftCode, jam: shiftInfo.jam, in: actIn, out: actOut, status
      };
    });

    return NextResponse.json({ success: true, data: results, date: tanggal });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
