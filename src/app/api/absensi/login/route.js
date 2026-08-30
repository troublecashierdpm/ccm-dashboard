// src/app/api/absensi/login/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NIK_HEAD_DEPT, hitungJamKerja, isoToDdMmYyyy } from '@/lib/absensiHelpers';

export async function POST(req) {
  try {
    const { nik, password } = await req.json();
    if (!nik || !password) {
      return NextResponse.json({ success: false, message: "NIK dan Password wajib diisi!" });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const inNik = String(nik).trim().replace(/\s/g, "");
    const inPass = String(password).trim().replace(/\s/g, "");

    const { data: rows, error } = await supabase.from('absensi_nik').select('*').eq('nik', inNik);
    if (error) throw new Error(error.message);

    const isHeadDept = NIK_HEAD_DEPT.indexOf(inNik) !== -1;
    const found = (rows || []).find(r => {
      const empStatus = (r.status || "").trim().toUpperCase();
      if (empStatus !== "PPKK" && !isHeadDept) return false;
      return String(r.password || "").trim().replace(/\s/g, "") === inPass;
    });

    if (!found) {
      return NextResponse.json({ success: false, message: "NIK atau Password salah!" });
    }

    const photoUrl = found.file_id
      ? `https://drive.google.com/thumbnail?id=${found.file_id}&sz=w500`
      : "";

    // Cek jadwal shift hari ini
    const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
    const { data: jadwalRows } = await supabase
      .from('absensi_master_schedule')
      .select('shift_code')
      .eq('nik', inNik)
      .eq('tanggal', todayIso)
      .limit(1);

    const shiftCode = (jadwalRows && jadwalRows[0]) ? jadwalRows[0].shift_code : "XX";
    const shiftInfo = hitungJamKerja(shiftCode);

    // Cek apakah sudah clock in/out hari ini
    const { data: logRows } = await supabase
      .from('absensi_log')
      .select('clock_in, clock_out')
      .eq('nik', inNik)
      .eq('tanggal', todayIso)
      .limit(1);

    const actualIn = (logRows && logRows[0] && logRows[0].clock_in) ? logRows[0].clock_in : "-";
    const actualOut = (logRows && logRows[0] && logRows[0].clock_out) ? logRows[0].clock_out : "-";

    return NextResponse.json({
      success: true,
      data: {
        nama: found.nama,
        nik: found.nik,
        photoUrl,
        email: found.email || "",
        isHeadDept,
        shiftCode,
        shiftJam: shiftInfo.jam,
        isOff: shiftInfo.isOff,
        actualIn,
        actualOut,
        tanggalHariIni: isoToDdMmYyyy(todayIso)
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: "Error Server: " + err.message });
  }
}
