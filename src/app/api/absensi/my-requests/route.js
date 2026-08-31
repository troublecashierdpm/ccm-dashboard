// src/app/api/absensi/my-requests/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const nik = searchParams.get('nik');
    if (!nik) return NextResponse.json({ success: false, message: "NIK wajib diisi." });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from("absensi_request")
      .select("*")
      .eq("nik", nik)
      .order("waktu_submit", { ascending: false });
    if (error) throw new Error(error.message);

    const list = (data || []).map(r => ({
      reqId: r.req_id,
      submitTgl: r.waktu_submit,
      tglAbsen: r.tanggal_absen,
      shiftBaru: r.shift_baru,
      jamIn: r.jam_in_baru,
      jamOut: r.jam_out_baru,
      alasan: r.alasan,
      statusReq: r.status,
      catatanAdmin: r.catatan_admin,
      lampiranUrl: r.foto_lampiran
    }));

    return NextResponse.json({ success: true, data: list });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
