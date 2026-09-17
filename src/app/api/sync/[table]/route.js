export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

function cleanNum(val) {
  if (!val) return "0";
  let str = String(val).replace(/[^0-9-]/g, '');
  return str || "0";
}

export async function GET(request, { params }) {
  const { table } = params;
  const tables = {
    pwp_kasir: { range: 'PWP KASIR!A2:G', supabase: 'pwp_kasir', mapper: row => ({ tanggal: row[0], nama: row[1], status: row[2], sku_produk: row[3], nama_barang: row[4], qty: parseInt(cleanNum(row[5])) || 0, periode: row[6] }) },
    sales_member: { range: 'Sales Member!A2:E', supabase: 'sales_member', mapper: row => ({ tanggal: row[0], nama: row[1], id_swipe: row[2], total_sales: parseFloat(cleanNum(row[3])) || 0, periode: row[4] }) },
    sales_hourly: { range: 'Sales Hourly!A2:F', supabase: 'sales_hourly', mapper: row => ({ tanggal: row[0], nama: row[1], id_swipe: row[2], count_transaksi: parseInt(cleanNum(row[3])) || 0, total_sales: parseFloat(cleanNum(row[4])) || 0, periode: row[5] }) },
    shortage_per_day: { range: 'SHORTAGE_PER_DAY!A2:J', supabase: 'shortage_per_day', mapper: row => ({ tanggal: row[0], pos: parseInt(row[1]) || null, short_over_shift_pagi: cleanNum(row[2]), nik: row[3], nama: row[4], short_over_shift_siang: cleanNum(row[5]), nik_1: row[6], nama_1: row[7], total_short_over: cleanNum(row[8]), periode: row[9] }) },
    ecobag_per_day: { range: 'ECOBAG!A2:H', supabase: 'ecobag_per_day', mapper: row => ({ year: row[0], month: row[1], staff_name: row[2], bag_la: parseInt(row[3]) || 0, bag_me: parseInt(row[4]) || 0, bag_sm: parseInt(row[5]) || 0, total: parseInt(row[6]) || 0, year_month: row[7] }) },
    surat_pernyataan_berita_acara: { range: "'SURAT PERNYATAAN & BERITA ACARA'!A2:I", supabase: 'sp_ba_per_day', mapper: row => ({ tanggal: row[0], nik: row[1], nama: row[2], status: row[3], remarks: row[4], jenis_pelanggaran: row[5], bulan: row[6], surat_pernyataan: row[7], pic_under: row[8] }) },
    sakit_per_day: { range: 'DATA EMPLOYEE SAKIT!A2:I', supabase: 'sakit_per_day', mapper: row => ({ nik: row[0], nama: row[1], status: row[2], tgl_tidak_masuk: row[3], tgl_mulai_masuk: row[4], bulan: row[5], keterangan: row[6], reason_diagnosa: row[7], alamat_klinik: row[8] }) }
  };

  if (!tables[table]) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    let privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: privateKey }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });

    await supabase.from(tables[table].supabase).delete().neq('id', 0);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID, range: tables[table].range });
    const rows = res.data.values;
    if (rows) {
      const data = rows.filter(r => r[0]).map(tables[table].mapper);
      for (let i = 0; i < data.length; i += 2000) await supabase.from(tables[table].supabase).insert(data.slice(i, i + 2000));
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
