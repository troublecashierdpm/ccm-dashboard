// src/app/api/sync-absensi/reverse/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
function toYyyyMmDd(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

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
    // Ambil NIK & Nama dari absensi_nik (hanya PPKK)
    const { data: allNiksData, error: nikErr } = await supabase
      .from('absensi_nik').select('nik, nama').eq('status', 'PPKK');
    if (nikErr) throw new Error("Gagal baca NIK: " + nikErr.message);
    const allNiks = allNiksData.map(r => ({ nik: r.nik, nama: r.nama || '' })).sort((a, b) => a.nik.localeCompare(b.nik));

    // Ambil data schedule per batch
    let scheduleRows = [];
    let rangeStart = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('absensi_master_schedule')
        .select('nik, tanggal, shift_code')
        .range(rangeStart, rangeStart + pageSize - 1);
      if (error) throw new Error("Gagal baca schedule: " + error.message);
      if (!data || data.length === 0) break;
      scheduleRows.push(...data);
      if (data.length < pageSize) break;
      rangeStart += pageSize;
    }

    if (allNiks.length > 0) {
      const allDates = [...new Set(scheduleRows.map(r => r.tanggal))].sort();
      const scheduleMap = {};
      scheduleRows.forEach(r => {
        if (!scheduleMap[r.nik]) scheduleMap[r.nik] = {};
        scheduleMap[r.nik][r.tanggal] = r.shift_code;
      });

      const header = ['NIK', 'Nama', ...allDates.map(d => isoToDdMmYyyy(d))];
      const dataGrid = allNiks.map(item => {
        const row = [item.nik, item.nama];
        allDates.forEach(d => row.push((scheduleMap[item.nik] && scheduleMap[item.nik][d]) || '-'));
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
    // Ambil data log per batch agar tidak terkena limit default Supabase (1000 baris)
    let logRows = [];
    let logRangeStart = 0;
    const logPageSize = 500;
    while (true) {
      const { data, error } = await supabase
        .from('absensi_log')
        .select('*')
        .order('id', { ascending: true })
        .range(logRangeStart, logRangeStart + logPageSize - 1);
      if (error) throw new Error("Gagal baca log: " + error.message);
      if (!data || data.length === 0) break;
      logRows.push(...data);
      if (data.length < logPageSize) break;
      logRangeStart += logPageSize;
    }

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
