import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

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
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // 1. SINKRONISASI MEMBER
    const responseMember = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'MEMBER_PER_DAY!A2:F' });
    const rowsMember = responseMember.data.values;
    if (rowsMember && rowsMember.length > 0) {
      const formattedMembers = rowsMember.map(row => ({
        tanggal: row[0] || null, nama: row[1] || null, status: row[2] || null, no_member: row[3] || null, qty: parseInt(row[4]) || 0, bulan: row[5] || null
      }));
      await supabase.from('member_per_day').delete().neq('nama', 'RESET_ALL_DATA_TRIGGER');
      for (let i = 0; i < formattedMembers.length; i += 2000) {
        await supabase.from('member_per_day').insert(formattedMembers.slice(i, i + 2000));
      }
    }

    // 2. SINKRONISASI SHORTAGE
    const responseShortage = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'SHORTAGE_PER_DAY!A2:J' });
    const rowsShortage = responseShortage.data.values;
    if (rowsShortage && rowsShortage.length > 0) {
      const formattedShortage = rowsShortage.map(row => ({
        tanggal: row[0] || null, pos: row[1] || null, short_over_shift_pagi: row[2] || null, nik: row[3] || null, nama: row[4] || null, short_over_shift_siang: row[5] || null, nik_1: row[6] || null, nama_1: row[7] || null, total_short_over: row[8] || null, periode: row[9] || null
      }));
      await supabase.from('shortage_per_day').delete().neq('pos', 'RESET_ALL_DATA_TRIGGER');
      for (let i = 0; i < formattedShortage.length; i += 2000) {
        await supabase.from('shortage_per_day').insert(formattedShortage.slice(i, i + 2000));
      }
    }

    // 3. SINKRONISASI ECOBAG (BARU)
    // Asumsi nama tab di Google Sheets adalah "ECOBAG". Jika berbeda, ubah teks "ECOBAG!A2:H" di bawah ini.
    const responseEcobag = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'ECOBAG!A2:H' });
    const rowsEcobag = responseEcobag.data.values;
    if (rowsEcobag && rowsEcobag.length > 0) {
      const formattedEcobag = rowsEcobag.map(row => ({
        year: row[0] || null,
        month: row[1] || null,
        staff_name: row[2] || null,
        bag_la: parseInt(row[3]) || 0,
        bag_me: parseInt(row[4]) || 0,
        bag_sm: parseInt(row[5]) || 0,
        total: parseInt(row[6]) || 0,
        year_month: row[7] || null
      }));
      await supabase.from('ecobag_per_day').delete().neq('staff_name', 'RESET_ALL_DATA_TRIGGER');
      for (let i = 0; i < formattedEcobag.length; i += 2000) {
        await supabase.from('ecobag_per_day').insert(formattedEcobag.slice(i, i + 2000));
      }
    }

    return NextResponse.json({ success: true, message: "Sinkronisasi Member, Shortage & Ecobag Sukses! 🔥" });
  } catch (error) {
    console.error("Error sinkronisasi:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
