import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // 1. Inisialisasi Supabase menggunakan Service Key / Anon Key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // 2. Otentikasi ke Google Sheets API
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // ==========================================
    // SINKRONISASI 1: MEMBER_PER_DAY
    // ==========================================
    // Mengambil data dari tab 'MEMBER_PER_DAY' kolom A sampai F
    const responseMember = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'MEMBER_PER_DAY!A2:F', 
    });

    const rowsMember = responseMember.data.values;
    if (rowsMember && rowsMember.length > 0) {
      // Mapping data dari baris Google Sheets ke format kolom database Supabase
      const formattedMembers = rowsMember.map(row => ({
        tanggal: row[0] || null,
        nama: row[1] || null,
        status: row[2] || null,
        no_member: row[3] || null,
        qty: parseInt(row[4]) || 0,
        bulan: row[5] || null
      }));

      // Hapus data lama di Supabase agar tidak duplikat, lalu masukkan data terbaru secara massal
      await supabase.from('member_per_day').delete().neq('nama', 'RESET_ALL_DATA_TRIGGER');
      
      // Masukkan dalam beberapa chunk (bagian) agar tidak melebihi batas batas query database
      const chunkSize = 2000;
      for (let i = 0; i < formattedMembers.length; i += chunkSize) {
        const chunk = formattedMembers.slice(i, i + chunkSize);
        await supabase.from('member_per_day').insert(chunk);
      }
    }

    // ==========================================
    // SINKRONISASI 2: SHORTAGE_PER_DAY
    // ==========================================
    const responseShortage = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SHORTAGE_PER_DAY!A2:J',
    });

    const rowsShortage = responseShortage.data.values;
    if (rowsShortage && rowsShortage.length > 0) {
      const formattedShortage = rowsShortage.map(row => ({
        tanggal: row[0] || null,
        pos: row[1] || null,
        short_over_shift_pagi: row[2] || null,
        nik: row[3] || null,
        nama: row[4] || null,
        short_over_shift_siang: row[5] || null,
        nik_1: row[6] || null, // Menyesuaikan nama kolom _1 hasil import tempo hari
        nama_1: row[7] || null,
        total_short_over: row[8] || null,
        periode: row[9] || null
      }));

      await supabase.from('shortage_per_day').delete().neq('pos', 'RESET_ALL_DATA_TRIGGER');
      
      const chunkSize = 2000;
      for (let i = 0; i < formattedShortage.length; i += chunkSize) {
        const chunk = formattedShortage.slice(i, i + chunkSize);
        await supabase.from('shortage_per_day').insert(chunk);
      }
    }

    return NextResponse.json({ success: true, message: "Sinkronisasi data Google Sheets ke Supabase Sukses! 🔥" });

  } catch (error) {
    console.error("Error saat sinkronisasi:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}