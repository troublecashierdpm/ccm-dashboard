// KUNCI UTAMA: Mematikan sistem Cache Vercel agar selalu menarik data terbaru secara Real-Time
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

// FUNGSI BARU: "Mesin Cuci" angka untuk membersihkan Rp dan titik dari Google Sheets
function cleanNum(val) {
  if (!val) return "0";
  let str = String(val).replace(/[^0-9-]/g, '');
  return str || "0";
}

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

    // 1. SAPU BERSIH SEMUA DATA LAMA DI SUPABASE
    const { error: rpcError } = await supabase.rpc('hapus_semua_data');
    if (rpcError) throw new Error("Gagal menyapu data: " + rpcError.message);

    // 2. SINKRONISASI MEMBER
    const responseMember = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'MEMBER_PER_DAY!A2:F' });
    const rowsMember = responseMember.data.values;
    if (rowsMember && rowsMember.length > 0) {
      const formattedMembers = rowsMember.filter(row => row[0] && row[0].toLowerCase() !== 'tanggal').map(row => ({
        tanggal: row[0] || null, nama: row[1] || null, status: row[2] || null, no_member: row[3] || null, qty: parseInt(row[4]) || 0, bulan: row[5] || null
      }));
      for (let i = 0; i < formattedMembers.length; i += 2000) {
        const { error } = await supabase.from('member_per_day').insert(formattedMembers.slice(i, i + 2000));
        if (error) throw new Error(`Error Member Baris ${i}: ` + error.message);
      }
    }

    // 3. SINKRONISASI SHORTAGE (Target dikembalikan ke SHORTAGE_PER_DAY & Angka dicuci bersih)
    const responseShortage = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'SHORTAGE_PER_DAY!A2:J' });
    const rowsShortage = responseShortage.data.values;
    if (rowsShortage && rowsShortage.length > 0) {
      const formattedShortage = rowsShortage.filter(row => row[1] && String(row[1]).toUpperCase() !== 'POS' && String(row[0]).toUpperCase() !== 'TANGGAL').map(row => ({
        tanggal: row[0] || null, 
        pos: parseInt(row[1]) || null, 
        short_over_shift_pagi: cleanNum(row[2]), 
        nik: row[3] || null, 
        nama: row[4] || null, 
        short_over_shift_siang: cleanNum(row[5]), 
        nik_1: row[6] || null, 
        nama_1: row[7] || null, 
        total_short_over: cleanNum(row[8]), 
        periode: row[9] || null
      }));
      for (let i = 0; i < formattedShortage.length; i += 2000) {
        const { error } = await supabase.from('shortage_per_day').insert(formattedShortage.slice(i, i + 2000));
        if (error) throw new Error(`Error Shortage Baris ${i}: ` + error.message);
      }
    }

    // 4. SINKRONISASI ECOBAG
    const responseEcobag = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'ECOBAG!A2:H' });
    const rowsEcobag = responseEcobag.data.values;
    if (rowsEcobag && rowsEcobag.length > 0) {
      const formattedEcobag = rowsEcobag.filter(row => row[0] && String(row[0]).toUpperCase() !== 'YEAR').map(row => ({
        year: row[0] || null, month: row[1] || null, staff_name: row[2] || null, bag_la: parseInt(row[3]) || 0, bag_me: parseInt(row[4]) || 0, bag_sm: parseInt(row[5]) || 0, total: parseInt(row[6]) || 0, year_month: row[7] || null
      }));
      for (let i = 0; i < formattedEcobag.length; i += 2000) {
        const { error } = await supabase.from('ecobag_per_day').insert(formattedEcobag.slice(i, i + 2000));
        if (error) throw new Error(`Error Ecobag Baris ${i}: ` + error.message);
      }
    }

    // 5. SINKRONISASI DATA SAKIT
    const responseSakit = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'DATA EMPLOYEE SAKIT!A2:I' });
    const rowsSakit = responseSakit.data.values;
    if (rowsSakit && rowsSakit.length > 0) {
      const formattedSakit = rowsSakit.filter(row => row[0] && String(row[0]).toUpperCase() !== 'NIK').map(row => ({
        nik: row[0] || null, nama: row[1] || null, status: row[2] || null, tgl_tidak_masuk: row[3] || null, tgl_mulai_masuk: row[4] || null, bulan: row[5] || null, keterangan: row[6] || null, reason_diagnosa: row[7] || null, alamat_klinik: row[8] || null
      }));
      for (let i = 0; i < formattedSakit.length; i += 2000) {
        const { error } = await supabase.from('sakit_per_day').insert(formattedSakit.slice(i, i + 2000));
        if (error) throw new Error(`Error Sakit Baris ${i}: ` + error.message);
      }
    }

    // 6. SINKRONISASI SP/BA
    const responseSpBa = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'SURAT PERNYATAAN & BERITA ACARA'!A2:I" });
    const rowsSpBa = responseSpBa.data.values;
    if (rowsSpBa && rowsSpBa.length > 0) {
      const formattedSpBa = rowsSpBa.filter(row => row[0] && String(row[0]).toUpperCase() !== 'TANGGAL').map(row => ({
        tanggal: row[0] || null, nik: row[1] || null, nama: row[2] || null, status: row[3] || null, remarks: row[4] || null, jenis_pelanggaran: row[5] || null, bulan: row[6] || null, surat_pernyataan: row[7] || null, pic_under: row[8] || null
      }));
      for (let i = 0; i < formattedSpBa.length; i += 2000) {
        const { error } = await supabase.from('sp_ba_per_day').insert(formattedSpBa.slice(i, i + 2000));
        if (error) throw new Error(`Error SP/BA Baris ${i}: ` + error.message);
      }
    }
    // 7. SINKRONISASI SALES MEMBER
    const responseSalesMember = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sales Member!A2:E' });
    const rowsSalesMember = responseSalesMember.data.values;
    if (rowsSalesMember && rowsSalesMember.length > 0) {
      const formattedSalesMember = rowsSalesMember.filter(row => row[0] && String(row[0]).toLowerCase() !== 'tanggal').map(row => ({
        tanggal: row[0] || null, nama: row[1] || null, id_swipe: row[2] || null,
        total_sales: parseFloat(cleanNum(row[3])) || 0, periode: row[4] || null
      }));
      for (let i = 0; i < formattedSalesMember.length; i += 2000) {
        const { error } = await supabase.from('sales_member').insert(formattedSalesMember.slice(i, i + 2000));
        if (error) throw new Error(`Error Sales Member Baris ${i}: ` + error.message);
      }
    }

    // 8. SINKRONISASI SALES HOURLY
    const responseSalesHourly = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Sales Hourly!A2:F' });
    const rowsSalesHourly = responseSalesHourly.data.values;
    if (rowsSalesHourly && rowsSalesHourly.length > 0) {
      const formattedSalesHourly = rowsSalesHourly.filter(row => row[0] && String(row[0]).toLowerCase() !== 'tanggal').map(row => ({
        tanggal: row[0] || null, nama: row[1] || null, id_swipe: row[2] || null,
        count_transaksi: parseInt(cleanNum(row[3])) || 0, total_sales: parseFloat(cleanNum(row[4])) || 0, periode: row[5] || null
      }));
      for (let i = 0; i < formattedSalesHourly.length; i += 2000) {
        const { error } = await supabase.from('sales_hourly').insert(formattedSalesHourly.slice(i, i + 2000));
        if (error) throw new Error(`Error Sales Hourly Baris ${i}: ` + error.message);
      }
    }
    
    return NextResponse.json({ success: true, message: "Sinkronisasi 13.000+ Baris Data Sukses! 🔥" });
  } catch (error) {
    console.error("Error sinkronisasi:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
