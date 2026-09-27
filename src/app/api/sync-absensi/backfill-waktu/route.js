// src/app/api/sync-absensi/backfill-waktu/route.js
// Sekali pakai: normalisasi waktu_submit + tanggal_action di absensi_request
// dari format campur (dd/mm/yyyy ...) menjadi "yyyy-mm-dd hh:mm:ss".
// Aman dijalankan ulang (idempoten via formatWaktuDb).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatWaktuDb } from '@/lib/absensiHelpers';

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    let rows = [];
    let from = 0;
    const pageSize = 500;
    while (true) {
      const { data, error } = await supabase
        .from('absensi_request')
        .select('req_id, waktu_submit, tanggal_action')
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    let fixed = 0;
    for (const r of rows) {
      const ws = formatWaktuDb(r.waktu_submit);
      const ta = formatWaktuDb(r.tanggal_action);
      if (ws !== r.waktu_submit || ta !== r.tanggal_action) {
        const { error } = await supabase
          .from('absensi_request')
          .update({ waktu_submit: ws, tanggal_action: ta })
          .eq('req_id', r.req_id);
        if (error) throw new Error(`Gagal update ${r.req_id}: ` + error.message);
        fixed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfill selesai! ${fixed} dari ${rows.length} baris dinormalisasi.`
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
