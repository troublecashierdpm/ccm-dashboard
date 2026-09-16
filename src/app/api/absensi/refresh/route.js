// src/app/api/absensi/refresh/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { NIK_HEAD_DEPT, hitungJamKerja, isoToDdMmYyyy } from '@/lib/absensiHelpers';

// Endpoint ini TIDAK cek password — dipakai untuk memulihkan sesi Absensi
// saat user datang dari halaman lain (Kasir/Supervisor) yang sudah login
// dan sesinya di-share lewat localStorage (ccm_user/ccm_sup). Kredensial
// aslinya sudah divalidasi di titik login pertama; endpoint ini cuma
// mengambil ULANG data absensi yang bentuknya benar (isHeadDept, shiftCode,
// shift hari ini, status clock in/out) berdasarkan NIK yang sudah terpercaya.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const nik = searchParams.get('nik');
    if (!nik) return NextResponse.json({ success: false, message: "NIK wajib diisi." });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const inNik = String(nik).trim().replace(/\s/g, "");
    const { data: rows, error } = await supabase.from('absensi_nik').select('*').eq('nik', inNik);
    if (error) throw new Error(error.message);

    const isHeadDept = NIK_HEAD_DEPT.indexOf(inNik) !== -1;
    const found = (rows || []).find(r => {
      const empStatus = (r.status || "").trim().toUpperCase();
      return empStatus === "PPKK" || isHeadDept;
    });

    if (!found) {
      return NextResponse.json({ success: false, message: "NIK ini tidak terdaftar sebagai PPKK/Head Dept di Absensi." });
    }

    const photoUrl = found.file_id ? `https://drive.google.com/thumbnail?id=${found.file_id}&sz=w500` : "";
    const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    const { data: jadwalRows } = await supabase
      .from('absensi_master_schedule').select('shift_code').eq('nik', inNik).eq('tanggal', todayIso).limit(1);
    const shiftCode = (jadwalRows && jadwalRows[0]) ? jadwalRows[0].shift_code : "XX";
    const shiftInfo = hitungJamKerja(shiftCode);

    const { data: logRows } = await supabase
      .from('absensi_log').select('clock_in, clock_out').eq('nik', inNik).eq('tanggal', todayIso).limit(1);
    const actualIn = (logRows && logRows[0] && logRows[0].clock_in) ? logRows[0].clock_in : "-";
    const actualOut = (logRows && logRows[0] && logRows[0].clock_out) ? logRows[0].clock_out : "-";

    return NextResponse.json({
      success: true,
      data: {
        nama: found.nama, nik: found.nik, photoUrl, email: found.email || "",
        isHeadDept, shiftCode, shiftJam: shiftInfo.jam, isOff: shiftInfo.isOff,
        actualIn, actualOut, tanggalHariIni: isoToDdMmYyyy(todayIso)
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
