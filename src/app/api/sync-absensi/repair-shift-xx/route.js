// src/app/api/sync-absensi/repair-shift-xx/route.js
// Repair data SEKALI PAKAI: baris absensi_log dengan shift "XX" yang sebenarnya
// punya jadwal kerja di absensi_master_schedule pada tanggal yang sama di-update
// mengikuti jadwal (kasus: log XX tapi jadwal DN). Idempoten — aman dijalankan ulang.
//
// Pemakaian:
//   GET /api/sync-absensi/repair-shift-xx            -> DRY RUN (pratinjau, tanpa menulis)
//   GET /api/sync-absensi/repair-shift-xx?confirm=REPAIR_SHIFT_XX -> eksekusi update
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hitungJamKerja, hitungLateEarlyDurasi, getRemarks } from '@/lib/absensiHelpers';

const CONFIRM_CODE = 'REPAIR_SHIFT_XX';

async function fetchAll(supabase, table, select) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`Gagal baca ${table}: ` + error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const confirmed = searchParams.get('confirm') === CONFIRM_CODE;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const logRows = await fetchAll(supabase, 'absensi_log', 'id, nik, nama, tanggal, shift, clock_in, clock_out');
    const schedRows = await fetchAll(supabase, 'absensi_master_schedule', 'nik, tanggal, shift_code');

    const schedMap = {};
    schedRows.forEach(r => {
      const d = String(r.tanggal).slice(0, 10);
      if (!schedMap[r.nik]) schedMap[r.nik] = {};
      schedMap[r.nik][d] = r.shift_code;
    });

    const fixes = [];
    let skipped = 0;
    for (const row of logRows) {
      // Koreksi baris tanpa shift jelas: "XX", "-", atau kosong
      if (!['XX', '-', ''].includes(String(row.shift || ''))) continue;
      const d = String(row.tanggal).slice(0, 10);
      const sched = (schedMap[row.nik] && schedMap[row.nik][d]) || '';
      // Hanya koreksi kalau jadwal asli = kode shift kerja yang berbeda dari XX
      // (XX sah untuk kerja di hari OFF / tanpa jadwal tidak disentuh)
      if (!sched || sched === 'XX' || sched === '-' || hitungJamKerja(sched).isOff) {
        skipped++;
        continue;
      }
      const jam = hitungJamKerja(sched).jam;
      const calc = hitungLateEarlyDurasi(row.clock_in, row.clock_out, jam);
      const remarks = getRemarks(row.clock_in, row.clock_out, false, calc.late, calc.early);
      fixes.push({
        id: row.id, nik: row.nik, nama: row.nama || '', tanggal: d,
        shiftLama: row.shift, shiftBaru: sched, remarks,
        clock_in: row.clock_in || '-', clock_out: row.clock_out || '-',
        payload: { shift: sched, remarks, late_in: calc.late, early_out: calc.early, durasi_kerja: calc.durasi }
      });
    }

    if (!confirmed) {
      return NextResponse.json({
        success: true, mode: 'dry-run',
        totalLog: logRows.length, akanDikoreksi: fixes.length, dilewati: skipped,
        preview: fixes.slice(0, 50),
        hint: `Tambahkan ?confirm=${CONFIRM_CODE} untuk eksekusi update`
      });
    }

    let fixed = 0;
    const errors = [];
    for (const f of fixes) {
      const { error } = await supabase.from('absensi_log').update(f.payload).eq('id', f.id);
      if (error) {
        errors.push(`id=${f.id} nik=${f.nik} tgl=${f.tanggal}: ` + error.message);
        continue;
      }
      fixed++;
    }

    return NextResponse.json({
      success: errors.length === 0,
      mode: 'executed',
      totalLog: logRows.length,
      dikoreksi: fixed,
      dilewati: skipped,
      errors
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
