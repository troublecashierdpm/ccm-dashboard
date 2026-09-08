// src/app/api/sync-absensi/reverse/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { isoToDdMmYyyy } from '@/lib/absensiHelpers';

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: privateKey,
      },
      // PERLU scope penuh (bukan readonly) karena ini MENULIS balik ke sheet
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID_ABSENSI;

    let ringkasan = [];

    // ========================================================
    // 1. MASTER_SCHEDULE (long format Supabase -> wide format sheet)
    // ========================================================
    const { data: scheduleRows, error: schedErr } = await supabase
      .from('absensi_master_schedule').select('nik, tanggal, shift_code');
    if (schedErr) throw new Error("Gagal baca schedule: " + schedErr.message);

    if (scheduleRows && scheduleRows.length > 0) {
      const allDates = [...new Set(scheduleRows.map(r => r.tanggal))].sort(); // ISO -> urut kronologis
      const allNiks = [...new Set(scheduleRows.map(r => r.nik))].sort();

      const scheduleMap = {};
      scheduleRows.forEach(r => {
        if (!scheduleMap[r.nik]) scheduleMap[r.nik] = {};
        scheduleMap[r.nik][r.tanggal] = r.shift_code;
      });

      const header = ['NIK', ...allDates.map(d => isoToDdMmYyyy(d))];
      const dataGrid = allNiks.map(nik => {
        const row = [nik];
        allDates.forEach(d => row.push((scheduleMap[nik] && scheduleMap[nik][d]) || ''));
        return row;
      });

      await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Master_Schedule' });
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: 'Master_Schedule!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [header, ...dataGrid] }
      });
      ringkasan.push(`Master_Schedule: ${allNiks.length} karyawan x ${allDates.length} tanggal`);
    }

    // ========================================================
    // 2. LOG_ABSENSI
    // ========================================================
    const { data: logRows, error: logErr } = await supabase
      .from('absensi_log').select('*').order('tanggal', { ascending: true });
    if (logErr) throw new Error("Gagal baca log: " + logErr.message);

    const logHeader = ["Date","NIK","Nama Lengkap","Shift","Remarks","Clock In","Clock Out","Late In","Early Out","Durasi Kerja","Foto In","Foto Out"];
    const logGrid = (logRows || []).map(r => [
      isoToDdMmYyyy(r.tanggal), r.nik, r.nama || '', r.shift || '', r.remarks || '',
      r.clock_in || '', r.clock_out || '', r.late_in || '', r.early_out || '', r.durasi_kerja || '',
      r.foto_in || '', r.foto_out || ''
    ]);

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Log_Absensi' });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: 'Log_Absensi!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [logHeader, ...logGrid] }
    });
    ringkasan.push(`Log_Absensi: ${logGrid.length} baris`);

    // ========================================================
    // 3. DATA_REQUEST
    // ========================================================
    const { data: reqRows, error: reqErr } = await supabase
      .from('absensi_request').select('*').order('waktu_submit', { ascending: true });
    if (reqErr) throw new Error("Gagal baca request: " + reqErr.message);

    const reqHeader = ["ID Request","Waktu Submit","NIK","Nama Lengkap","Tanggal Absen","Kode Shift Baru","Jam In Baru","Jam Out Baru","Alasan","Status","Tanggal Action","Foto Lampiran","Pesan/Catatan Admin"];
    const reqGrid = (reqRows || []).map(r => [
      r.req_id, r.waktu_submit, r.nik, r.nama || '', isoToDdMmYyyy(r.tanggal_absen),
      r.shift_baru || '-', r.jam_in_baru || '-', r.jam_out_baru || '-', r.alasan || '',
      r.status || 'Pending', r.tanggal_action || '-', r.foto_lampiran || '', r.catatan_admin || '-'
    ]);

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Data_Request' });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: 'Data_Request!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [reqHeader, ...reqGrid] }
    });
    ringkasan.push(`Data_Request: ${reqGrid.length} baris`);

    return NextResponse.json({
      success: true,
      message: `Reverse sync sukses! ${ringkasan.join(" | ")}`
    });
  } catch (error) {
    console.error("Error reverse sync absensi:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
