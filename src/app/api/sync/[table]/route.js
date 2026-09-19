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
    member_per_day: { range: 'MEMBER_PER_DAY!A2:F', supabase: 'member_per_day', mapper: row => ({ tanggal: row[0], nama: row[1], status: row[2], no_member: row[3], qty: parseInt(row[4]) || 0, bulan: row[5] }) },
    sp_ba_per_day: { range: "'SURAT PERNYATAAN & BERITA ACARA'!A2:I", supabase: 'sp_ba_per_day', mapper: row => ({ tanggal: row[0], nik: row[1], nama: row[2], status: row[3], remarks: row[4], jenis_pelanggaran: row[5], bulan: row[6], surat_pernyataan: row[7], pic_under: row[8] }) },
    pwp_kasir: { range: 'PWP KASIR!A2:G', supabase: 'pwp_kasir', mapper: row => ({ tanggal: row[0], nama: row[1], status: row[2], sku_produk: row[3], nama_barang: row[4], qty: parseInt(cleanNum(row[5])) || 0, periode: row[6] }) },
  };

  if (!tables[table]) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    let privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: privateKey }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });

    await supabase.from(tables[table].supabase).delete().neq('id', 0);
    console.log(`Syncing table: ${table} to Supabase: ${tables[table].supabase}`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID, range: tables[table].range });
    console.log(`Accessing spreadsheetId: ${process.env.GOOGLE_SPREADSHEET_ID}, range: ${tables[table].range}`);
    const rows = res.data.values;
    if (rows) {
      console.log(`Found ${rows.length} rows`);
      const data = rows.filter(r => r[0]).map(tables[table].mapper);
      for (let i = 0; i < data.length; i += 2000) {
        const chunk = data.slice(i, i + 2000);
        const { error: insertError } = await supabase.from(tables[table].supabase).insert(chunk);
        if (insertError) {
          console.error(`Error inserting chunk ${i/2000}:`, insertError);
          throw insertError;
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(`Sync error for table ${table}:`, e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
