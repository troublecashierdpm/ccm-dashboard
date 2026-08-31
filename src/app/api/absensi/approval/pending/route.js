// src/app/api/absensi/approval/pending/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: requests, error } = await supabase
      .from('absensi_request')
      .select('*')
      .eq('status', 'Pending')
      .order('waktu_submit', { ascending: false });
    if (error) throw new Error(error.message);
    if (!requests || requests.length === 0) return NextResponse.json({ success: true, data: [] });

    const niks = [...new Set(requests.map(r => r.nik))];
    const tanggalList = [...new Set(requests.map(r => r.tanggal_absen))];

    const { data: nikRows } = await supabase.from('absensi_nik').select('nik, file_id').in('nik', niks);
    const photoMap = {};
    (nikRows || []).forEach(n => {
      photoMap[n.nik] = n.file_id ? `https://drive.google.com/thumbnail?id=${n.file_id}&sz=w500` : "";
    });

    const { data: logRows } = await supabase
      .from('absensi_log').select('nik, tanggal, clock_in, clock_out')
      .in('nik', niks).in('tanggal', tanggalList);
    const logMap = {};
    (logRows || []).forEach(l => { logMap[`${l.nik}_${l.tanggal}`] = l; });

    const { data: jadwalRows } = await supabase
      .from('absensi_master_schedule').select('nik, tanggal, shift_code')
      .in('nik', niks).in('tanggal', tanggalList);
    const jadwalMap = {};
    (jadwalRows || []).forEach(j => { jadwalMap[`${j.nik}_${j.tanggal}`] = j.shift_code; });

    const list = requests.map(r => {
      const key = `${r.nik}_${r.tanggal_absen}`;
      const log = logMap[key];
      return {
        reqId: r.req_id,
        submitTgl: r.waktu_submit,
        nik: r.nik,
        nama: r.nama,
        tglAbsen: r.tanggal_absen,
        shiftBaru: r.shift_baru,
        jamIn: r.jam_in_baru,
        jamOut: r.jam_out_baru,
        alasan: r.alasan,
        lampiranUrl: r.foto_lampiran,
        photoUrl: photoMap[r.nik] || "",
        shiftAwal: jadwalMap[key] || "XX",
        actualIn: (log && log.clock_in) || "-",
        actualOut: (log && log.clock_out) || "-"
      };
    });

    return NextResponse.json({ success: true, data: list });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
