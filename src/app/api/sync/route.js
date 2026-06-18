import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Memaksa format private key agar bersih dari tanda kutip ganda bawaan Vercel
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');

    // Menggunakan GoogleAuth yang jauh lebih stabil daripada JWT biasa
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!spreadsheetId) {
      throw new Error("ID Spreadsheet kosong. Cek Vercel Environment Variables Anda.");
    }

    // ==========================================
    // SINKRONISASI 1: MEMBER_PER_DAY
    // ==========================================
    const responseMember = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'MEMBER_PER_DAY!A2:F', 
    });

    const rowsMember = responseMember.data.values;
    if (rowsMember && rowsMember.length > 0) {
      const formattedMembers = rowsMember.map(row => ({
        tanggal: row[0] || null,
        nama: row[1] || null,
        status: row[2] || null,
        no_member: row[3] || null,
        qty: parseInt(row[4]) || 0,
        bulan: row[5] || null
      }));

      await supabase.from('member_per_day').delete().neq('nama', 'RESET_ALL_DATA_TRIGGER');
      
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
        nik_1: row[6] || null,
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
