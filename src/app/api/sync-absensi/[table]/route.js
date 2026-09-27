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
        console.log(`Sync Master Schedule: Ambil ${rows?.length || 0} baris dari Sheets`);

        await supabase.from('absensi_master_schedule').delete().neq('id', 0);
        if (rows && rows.length > 1) {
            const headerRow = rows[0];
            const data = [];
            for (let r = 1; r < rows.length; r++) {
                const nik = rows[r][0] ? String(rows[r][0]).trim() : '';
                if (!nik) continue;
                for (let c = 1; c < headerRow.length; c++) {
                    const tglIso = ddmmyyyyToIso(headerRow[c]);
                    if (tglIso && rows[r][c]) {
                        data.push({ 
                            nik, 
                            tanggal: tglIso, 
                            shift_code: String(rows[r][c]).trim() 
                        });
                    }
                }
            }
            console.log(`Sync Master Schedule: Siap insert ${data.length} records`);
            if (data.length > 0) {
                const { error: insErr } = await supabase.from('absensi_master_schedule').insert(data);
                if (insErr) throw insErr;
            }
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

    if (table === 'data-request') {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Data_Request!A1:M' });
        const rowsAll = response.data.values;
        if (rowsAll && rowsAll.length > 1) {
            const headerRow = rowsAll[0];
            const isShiftBaruFormat = headerRow.length > 5 && String(headerRow[5]).indexOf("Shift") !== -1;
            const { data: existingReq } = await supabase.from('absensi_request').select('req_id');
            const existingIds = new Set((existingReq || []).map(r => r.req_id));
            const cleanVal = (v) => (v !== undefined && v !== null ? String(v).replace(/^'/, '').trim() : '');
            const data = [];
            for (const row of rowsAll.slice(1)) {
                const reqId = cleanVal(row[0]);
                if (!reqId || existingIds.has(reqId)) continue;
                if (isShiftBaruFormat) {
                    data.push({
                        req_id: reqId, waktu_submit: cleanVal(row[1]), nik: cleanVal(row[2]), nama: row[3] || null,
                        tanggal_absen: ddmmyyyyToIso(row[4]), shift_baru: row[5] || '-',
                        jam_in_baru: cleanVal(row[6]) || '-', jam_out_baru: cleanVal(row[7]) || '-',
                        alasan: row[8] || '', status: row[9] || 'Pending', tanggal_action: cleanVal(row[10]) || '-',
                        foto_lampiran: row[11] || null, catatan_admin: row[12] || '-'
                    });
                } else {
                    data.push({
                        req_id: reqId, waktu_submit: cleanVal(row[1]), nik: cleanVal(row[2]), nama: row[3] || null,
                        tanggal_absen: ddmmyyyyToIso(row[4]), shift_baru: '-',
                        jam_in_baru: cleanVal(row[5]) || '-', jam_out_baru: cleanVal(row[6]) || '-',
                        alasan: row[7] || '', status: row[8] || 'Pending', tanggal_action: cleanVal(row[9]) || '-',
                        foto_lampiran: row[10] || null, catatan_admin: row[11] || '-'
                    });
                }
            }
            const valid = data.filter(r => r.req_id && r.nik && r.tanggal_absen);
            if (valid.length > 0) {
                const { error: insErr } = await supabase.from('absensi_request').insert(valid);
                if (insErr) throw insErr;
            }
            return NextResponse.json({ success: true, message: `Sync Data Request Sukses! ${valid.length} baru.` });
        }
        return NextResponse.json({ success: true, message: "Sync Data Request Sukses! 0 baru." });
    }

    return NextResponse.json({ success: false, error: "Tabel tidak ditemukan" }, { status: 404 });

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
