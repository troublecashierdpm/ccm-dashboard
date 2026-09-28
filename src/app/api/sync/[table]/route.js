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
    nik: { range: 'NIK!A2:L', supabase: 'nik', mapper: row => ({
      nama: row[0] || null, nik: row[1] || null, id_swipe: row[2] || null, status: row[3] || null,
      level: row[4] || null, join_date: row[5] || null, photo: row[6] || null, file_id: row[7] || null,
      under: row[8] || null, role: row[9] || null, trc_under: row[10] || null, email: row[11] || null
    }) },
    sales_member: { range: 'Sales Member!A2:F', supabase: 'sales_member', mapper: row => ({ tanggal: row[0], pos: row[1], nama: row[2], id_swipe: row[3], total_sales: parseFloat(cleanNum(row[4])) || 0, periode: row[5] }) },
    sales_hourly: { range: 'Sales Hourly!A2:G', supabase: 'sales_hourly', mapper: row => ({ tanggal: row[0], pos: row[1], nama: row[2], id_swipe: row[3], count_transaksi: parseInt(cleanNum(row[4])) || 0, total_sales: parseFloat(cleanNum(row[5])) || 0, periode: row[6] }) },
    member_per_day: { range: 'MEMBER_PER_DAY!A2:F', supabase: 'member_per_day', mapper: row => ({ tanggal: row[0], nama: row[1], status: row[2], no_member: row[3], qty: parseInt(row[4]) || 0, bulan: row[5] }) },
    sp_ba_per_day: { range: "'SURAT PERNYATAAN & BERITA ACARA'!A2:I", supabase: 'sp_ba_per_day', mapper: row => ({ tanggal: row[0], nik: row[1], nama: row[2], status: row[3], remarks: row[4], jenis_pelanggaran: row[5], bulan: row[6], surat_pernyataan: row[7], pic_under: row[8] }) },
    pwp_kasir: { range: 'PWP KASIR!A2:G', supabase: 'pwp_kasir', mapper: row => ({ tanggal: row[0], nama: row[1], status: row[2], sku_produk: row[3], nama_barang: row[4], qty: parseInt(cleanNum(row[5])) || 0, periode: row[6] }) },
    shortage_per_day: { range: 'SHORTAGE_PER_DAY!A2:J', supabase: 'shortage_per_day', mapper: row => ({
      tanggal: row[0] || null, pos: parseInt(row[1]) || null, short_over_shift_pagi: cleanNum(row[2]),
      nik: row[3] || null, nama: row[4] || null, short_over_shift_siang: cleanNum(row[5]),
      nik_1: row[6] || null, nama_1: row[7] || null, total_short_over: cleanNum(row[8]), periode: row[9] || null
    }) },
    ecobag_per_day: { range: 'ECOBAG!A2:H', supabase: 'ecobag_per_day', mapper: row => ({
      year: row[0] || null, month: row[1] || null, staff_name: row[2] || null, bag_la: parseInt(row[3]) || 0,
      bag_me: parseInt(row[4]) || 0, bag_sm: parseInt(row[5]) || 0, total: parseInt(row[6]) || 0, year_month: row[7] || null
    }) },
    sakit_per_day: { range: 'DATA EMPLOYEE SAKIT!A2:I', supabase: 'sakit_per_day', mapper: row => ({
      nik: row[0] || null, nama: row[1] || null, status: row[2] || null, tgl_tidak_masuk: row[3] || null,
      tgl_mulai_masuk: row[4] || null, bulan: row[5] || null, keterangan: row[6] || null,
      reason_diagnosa: row[7] || null, alamat_klinik: row[8] || null
    }) },
  };

  if (!tables[table]) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    const supabase = createClient(supabaseUrl, serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    let privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: privateKey }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth });

    const target = tables[table].supabase;

    // Hitung isi lama untuk laporan
    let deleted = 0;
    try {
      const { count } = await supabase.from(target).select('*', { count: 'exact', head: true });
      deleted = count || 0;
    } catch { deleted = 0; }

    // Hapus semua baris tanpa asumsi kolom `id` (member_per_day tidak punya id).
    // Baca 1 baris contoh untuk tahu kolom yang ada, lalu hapus non-null + null.
    const { data: sample, error: sampleErr } = await supabase.from(target).select('*').limit(1);
    if (sampleErr) {
      console.error(`Gagal baca struktur ${target}:`, sampleErr);
      throw new Error(`Gagal baca struktur ${target}: ${sampleErr.message}`);
    }
    if (sample && sample.length > 0) {
      const cols = Object.keys(sample[0]);
      const delCol = cols.includes('id') ? 'id' : (cols.find(c => c !== 'created_at' && c !== 'updated_at') || cols[0]);
      const { error: delErr1 } = await supabase.from(target).delete().not(delCol, 'is', null);
      if (delErr1) {
        console.error(`Delete gagal untuk ${target}:`, delErr1);
        throw new Error(`Gagal hapus data lama ${target}: ${delErr1.message}`);
      }
      const { error: delErr2 } = await supabase.from(target).delete().is(delCol, null);
      if (delErr2) {
        console.error(`Delete null gagal untuk ${target}:`, delErr2);
        throw new Error(`Gagal hapus data lama ${target}: ${delErr2.message}`);
      }
    }
    console.log(`Syncing table: ${table} to Supabase: ${target}`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID, range: tables[table].range });
    console.log(`Accessing spreadsheetId: ${process.env.GOOGLE_SPREADSHEET_ID}, range: ${tables[table].range}`);
    const rows = res.data.values;
    let inserted = 0;
    if (rows) {
      console.log(`Found ${rows.length} rows`);
      // Filter header disamakan dengan all sync (sync/route.js)
      const headerFilter = {
        nik: r => r[0] && String(r[0]).toUpperCase() !== 'NAMA',
        sales_member: r => r[0] && String(r[0]).toLowerCase() !== 'tanggal',
        sales_hourly: r => r[0] && String(r[0]).toLowerCase() !== 'tanggal',
        member_per_day: r => r[0] && String(r[0]).toLowerCase() !== 'tanggal',
        sp_ba_per_day: r => r[0] && String(r[0]).toUpperCase() !== 'TANGGAL',
        pwp_kasir: r => r[0] && String(r[0]).toUpperCase() !== 'TGL',
        shortage_per_day: r => r[1] && String(r[1]).toUpperCase() !== 'POS' && String(r[0] || '').toUpperCase() !== 'TANGGAL',
        ecobag_per_day: r => r[0] && String(r[0]).toUpperCase() !== 'YEAR',
        sakit_per_day: r => r[0] && String(r[0]).toUpperCase() !== 'NIK',
      };
      const keep = headerFilter[table] || (r => r[0]);
      const seen = new Set();
      const data = rows.filter(keep).map(tables[table].mapper).filter(r => {
        const k = JSON.stringify(r);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      for (let i = 0; i < data.length; i += 2000) {
        const chunk = data.slice(i, i + 2000);
        const { error: insertError } = await supabase.from(target).insert(chunk);
        if (insertError) {
          console.error(`Error inserting chunk ${i/2000}:`, insertError);
          throw insertError;
        }
        inserted += chunk.length;
      }
    }
    return NextResponse.json({ success: true, message: `Sync ${table} sukses! Hapus ${deleted}, isi ${inserted} baris.` });
  } catch (e) {
    console.error(`Sync error for table ${table}:`, e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
