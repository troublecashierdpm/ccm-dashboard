import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { ddmmyyyyToIso } from '@/lib/absensiHelpers';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { table } = params;
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
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID_ABSENSI;

    if (table === 'nik') {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'NIK!A2:L' });
      const rows = response.data.values;
      await supabase.from('absensi_nik').delete().neq('id', 0);
      if (rows && rows.length > 0) {
        const data = rows.filter(r => r[1]).map(row => ({
          nama: row[0], nik: String(row[1]).trim(), password: row[2], status: row[3], file_id: row[7], email: row[11]
        }));
        await supabase.from('absensi_nik').insert(data);
      }
      return NextResponse.json({ success: true, message: "Sync NIK Sukses!" });
    }

    if (table === 'master-schedule') {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Master_Schedule!A1:ZZ' });
        const rows = response.data.values;
        await supabase.from('absensi_master_schedule').delete().neq('id', 0);
        if (rows && rows.length > 1) {
            const headerRow = rows[0];
            const data = [];
            for (let r = 1; r < rows.length; r++) {
                const nik = rows[r][0] ? String(rows[r][0]).trim() : '';
                if (!nik) continue;
                for (let c = 1; c < headerRow.length; c++) {
                    const tglIso = ddmmyyyyToIso(headerRow[c]);
                    if (tglIso && rows[r][c]) data.push({ nik, tanggal: tglIso, shift_code: String(rows[r][c]).trim() });
                }
            }
            await supabase.from('absensi_master_schedule').insert(data);
        }
        return NextResponse.json({ success: true, message: "Sync Schedule Sukses!" });
    }

    if (table === 'log-absensi') {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Log_Absensi!A2:L' });
        const rows = response.data.values;
        await supabase.from('absensi_log').delete().neq('id', 0);
        if (rows && rows.length > 0) {
            const data = rows.map(r => ({
                tanggal: ddmmyyyyToIso(r[0]), nik: String(r[1]).trim(), nama: r[2], shift: r[3], clock_in: r[5], clock_out: r[6]
            })).filter(r => r.tanggal);
            await supabase.from('absensi_log').insert(data);
        }
        return NextResponse.json({ success: true, message: "Sync Log Sukses!" });
    }

    return NextResponse.json({ success: false, error: "Tabel tidak ditemukan" }, { status: 404 });

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
