// src/app/api/absensi/request-data/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hitungJamKerja } from '@/lib/absensiHelpers';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const nik = searchParams.get('nik');
    const tanggal = searchParams.get('tanggal'); // format ISO yyyy-MM-dd

    if (!nik || !tanggal) return NextResponse.json({ success: false, message: "NIK dan tanggal wajib diisi." });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: logRows } = await supabase
      .from('absensi_log').select('clock_in, clock_out')
      .eq('nik', nik).eq('tanggal', tanggal).limit(1);
    const actualIn = (logRows && logRows[0] && logRows[0].clock_in) || "-";
    const actualOut = (logRows && logRows[0] && logRows[0].clock_out) || "-";

    const { data: jadwalRows } = await supabase
      .from('absensi_master_schedule').select('shift_code')
      .eq('nik', nik).eq('tanggal', tanggal).limit(1);
    const shiftCode = (jadwalRows && jadwalRows[0] && jadwalRows[0].shift_code) || "XX";

    const shiftInfo = hitungJamKerja(shiftCode);
    let expIn = "", expOut = "";
    if (shiftInfo.jam && shiftInfo.jam.indexOf("-") !== -1) {
      const [a, b] = shiftInfo.jam.split("-");
      expIn = a.trim(); expOut = b.trim();
    }

    return NextResponse.json({ success: true, actualIn, actualOut, shiftCode, expIn, expOut });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
