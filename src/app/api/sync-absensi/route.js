// src/app/api/sync-absensi/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { ddmmyyyyToIso } from '@/lib/absensiHelpers';

export async function GET() {
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
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    // Spreadsheet BEDA dari dashboard kasir - ID absensi PPKK
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID_ABSENSI;

    // 1. BERSIHKAN DATA CERMINAN LAMA (nik, schedule, log) - request TIDAK disentuh
    const { error: rpcError } = await supabase.rpc('hapus_semua_data_absensi');
    if (rpcError) throw new Error("Gagal menyapu data absensi: " + rpcError.message);

    // 2. SINKRONISASI NIK
    // Kolom: A=Nama, B=NIK, C=Password, D=Status, ... H=FileId(index7), ... L=Email(index11)
    const responseNik = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'NIK!A2:L' });
    const rowsNik = responseNik.data.values;
    if (rowsNik && rowsNik.length > 0) {
      const formattedNik = rowsNik
        .filter(row => row[1] && String(row[1]).trim() !== '')
        .map(row => ({
          nama: row[0] || null,
          nik: String(row[1]).trim(),
          password: row[2] || null,
          status: row[3] || null,
          file_id: row[7] || null,
          email: row.length > 11 ? (row[11] || null) : null
        }));
      for (let i = 0; i < formattedNik.length; i += 2000) {
        const { error } = await supabase.from('absensi_nik').insert(formattedNik.slice(i, i + 2000));
        if (error) throw new Error(`Error NIK Baris ${i}: ` + error.message);
      }
    }

    // 3. SINKRONISASI MASTER_SCHEDULE (wide format -> long format)
    // Baris 1 = header: kolom A = label "NIK", kolom B dst = tanggal (dd/MM/yyyy)
    // Baris berikutnya: kolom A = NIK, kolom lain = kode shift utk tanggal tsb
    const responseSchedule = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Master_Schedule!A1:ZZ' });
    const rowsSchedule = responseSchedule.data.values;
    if (rowsSchedule && rowsSchedule.length > 1) {
      const headerRow = rowsSchedule[0];
      const formattedSchedule = [];
      for (let r = 1; r < rowsSchedule.length; r++) {
        const row = rowsSchedule[r];
        const nik = row[0] ? String(row[0]).trim() : '';
        if (!nik) continue;
        for (let c = 1; c < headerRow.length; c++) {
          const tglIso = ddmmyyyyToIso(headerRow[c]);
          const shiftCode = row[c];
          if (!tglIso || !shiftCode || String(shiftCode).trim() === '') continue;
          formattedSchedule.push({ nik, tanggal: tglIso, shift_code: String(shiftCode).trim().toUpperCase() });
        }
      }
      for (let i = 0; i < formattedSchedule.length; i += 2000) {
        const { error } = await supabase.from('absensi_master_schedule').insert(formattedSchedule.slice(i, i + 2000));
        if (error) throw new Error(`Error Master_Schedule Baris ${i}: ` + error.message);
      }
    }

    // 4. SINKRONISASI LOG_ABSENSI
    // Kolom: Date, NIK, Nama, Shift, Remarks, ClockIn, ClockOut, LateIn, EarlyOut, Durasi, FotoIn, FotoOut
    const responseLog = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Log_Absensi!A2:L' });
    const rowsLog = responseLog.data.values;
    if (rowsLog && rowsLog.length > 0) {
      const formattedLog = rowsLog
        .filter(row => row[0] && row[1])
        .map(row => ({
          tanggal: ddmmyyyyToIso(row[0]),
          nik: String(row[1]).trim(),
          nama: row[2] || null,
          shift: row[3] || null,
          remarks: row[4] || null,
          clock_in: row[5] ? String(row[5]).replace(/'/g, '') : null,
          clock_out: row[6] ? String(row[6]).replace(/'/g, '') : null,
          late_in: row[7] ? String(row[7]).replace(/'/g, '') : null,
          early_out: row[8] ? String(row[8]).replace(/'/g, '') : null,
          durasi_kerja: row[9] ? String(row[9]).replace(/'/g, '') : null,
          foto_in: row[10] || null,
          foto_out: row[11] || null
        }))
        .filter(r => r.tanggal); // buang baris dengan tanggal tak terbaca
      for (let i = 0; i < formattedLog.length; i += 2000) {
        const { error } = await supabase.from('absensi_log').insert(formattedLog.slice(i, i + 2000));
        if (error) throw new Error(`Error Log_Absensi Baris ${i}: ` + error.message);
      }
    }

    // GANTI JADI (sisipkan step 5 SEBELUM baris "return NextResponse.json"):
 
    // 5. SINKRONISASI DATA_REQUEST (migrasi request lama dari sheet + request baru
    // yang mungkin masih disubmit lewat sheet). Dedupe by req_id supaya AMAN
    // dijalankan berkali-kali tanpa bikin duplikat. Request yang dibuat langsung
    // dari form /absensi (lewat /api/absensi/request) TIDAK akan ke-skip karena
    // req_id-nya beda format ("REQ-<timestamp>" dari kedua sisi, tetap unik).
    const responseRequest = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Data_Request!A1:M' });
    const rowsRequestAll = responseRequest.data.values;
    if (rowsRequestAll && rowsRequestAll.length > 1) {
      const headerRow = rowsRequestAll[0];
      // Deteksi format lama/baru, sama seperti logika isShiftBaruFormat di Code.gs
      const isShiftBaruFormat = headerRow.length > 5 && String(headerRow[5]).indexOf("Shift") !== -1;
      const dataRows = rowsRequestAll.slice(1);
 
      // Ambil req_id yang sudah ada supaya tidak dobel setiap kali sync ulang
      const { data: existingReq } = await supabase.from('absensi_request').select('req_id');
      const existingIds = new Set((existingReq || []).map(r => r.req_id));
 
      const cleanVal = (v) => (v !== undefined && v !== null ? String(v).replace(/^'/, '').trim() : '');
 
      const formattedRequest = dataRows
        .map(row => {
          const reqId = cleanVal(row[0]);
          if (!reqId || existingIds.has(reqId)) return null; // kosong atau sudah pernah di-sync
 
          if (isShiftBaruFormat) {
            return {
              req_id: reqId,
              waktu_submit: cleanVal(row[1]),
              nik: cleanVal(row[2]),
              nama: row[3] || null,
              tanggal_absen: ddmmyyyyToIso(row[4]),
              shift_baru: row[5] || '-',
              jam_in_baru: cleanVal(row[6]) || '-',
              jam_out_baru: cleanVal(row[7]) || '-',
              alasan: row[8] || '',
              status: row[9] || 'Pending',
              tanggal_action: cleanVal(row[10]) || '-',
              foto_lampiran: row[11] || null,
              catatan_admin: row[12] || '-'
            };
          }
          // Format lama: tidak ada kolom "Kode Shift Baru"
          return {
            req_id: reqId,
            waktu_submit: cleanVal(row[1]),
            nik: cleanVal(row[2]),
            nama: row[3] || null,
            tanggal_absen: ddmmyyyyToIso(row[4]),
            shift_baru: '-',
            jam_in_baru: cleanVal(row[5]) || '-',
            jam_out_baru: cleanVal(row[6]) || '-',
            alasan: row[7] || '',
            status: row[8] || 'Pending',
            tanggal_action: cleanVal(row[9]) || '-',
            foto_lampiran: row[10] || null,
            catatan_admin: row[11] || '-'
          };
        })
        .filter(r => r && r.req_id && r.nik && r.tanggal_absen);
 
      for (let i = 0; i < formattedRequest.length; i += 2000) {
        const { error } = await supabase.from('absensi_request').insert(formattedRequest.slice(i, i + 2000));
        if (error) throw new Error(`Error Data_Request Baris ${i}: ` + error.message);
      }
    }
 
    return NextResponse.json({ success: true, message: "Sinkronisasi data Absensi PPKK Sukses! 🔥" });
  } catch (error) {
    console.error("Error sinkronisasi absensi:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
