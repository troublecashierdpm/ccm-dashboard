// src/app/api/sync-absensi/reverse/lib.js
// Fungsi bersama untuk reverse sync (DB -> Sheet), dipakai Reverse All + single per tabel.
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { hitungJamKerja, formatWaktuDb } from '@/lib/absensiHelpers';

export function toYyyyMmDd(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSheets() {
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    // PERLU scope penuh (bukan readonly) karena ini MENULIS balik ke sheet
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return { sheets: google.sheets({ version: 'v4', auth }), spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID_ABSENSI };
}

export function spreadsheet() {
  const { sheets, spreadsheetId } = getSheets();
  return { sheets, spreadsheetId };
}

async function fetchAll(supabase, table, select, orderCol, orderAsc = true, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (orderCol) q = q.order(orderCol, { ascending: orderAsc });
    const { data, error } = await q;
    if (error) throw new Error(`Gagal baca ${table}: ` + error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// Tulis grid ke satu tab (clear dulu), batch per 5000 baris agar aman.
async function writeTab(sheets, spreadsheetId, tab, header, grid) {
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: tab });
  const chunkSize = 5000;
  for (let i = 0; i < grid.length; i += chunkSize) {
    const chunk = grid.slice(i, i + chunkSize);
    const values = i === 0 ? [header, ...chunk] : chunk;
    const startRow = i === 0 ? 1 : i + 2; // baris 1 = header
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tab}!A${startRow}`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
  }
  if (grid.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] }
    });
  }
}

export async function fetchNikMap(supabase) {
  const { data, error } = await supabase
    .from('absensi_nik').select('nik, nama, status').in('status', ['PPKK', 'RESIGN']);
  if (error) throw new Error("Gagal baca NIK: " + error.message);
  const norm = (data || []).map(r => ({
    nik: r.nik, nama: r.nama || '',
    status: String(r.status || 'PPKK').trim().toUpperCase()
  }));
  const ppkk = norm.filter(r => r.status === 'PPKK').sort((a, b) => a.nik.localeCompare(b.nik));
  const resign = norm.filter(r => r.status !== 'PPKK').sort((a, b) => a.nik.localeCompare(b.nik));
  return [...ppkk, ...resign];
}

export async function fetchScheduleMap(supabase) {
  const rows = await fetchAll(supabase, 'absensi_master_schedule', 'nik, tanggal, shift_code', null, true, 1000);
  const map = {};
  rows.forEach(r => {
    const d = toYyyyMmDd(r.tanggal);
    if (!map[r.nik]) map[r.nik] = {};
    map[r.nik][d] = r.shift_code;
  });
  return { rows, map };
}

// 1. MASTER_SCHEDULE (long format Supabase -> wide format sheet)
// PPKK dulu A-Z, lalu RESIGN A-Z di bawah dengan kolom A-B merah.
export async function reverseMasterSchedule(supabase, sheets, spreadsheetId) {
  const allNiks = await fetchNikMap(supabase);
  const { rows: scheduleRows, map: scheduleMap } = await fetchScheduleMap(supabase);
  if (allNiks.length === 0) return { summary: 'Master_Schedule: 0 karyawan', scheduleMap };

  const allDates = [...new Set(scheduleRows.map(r => toYyyyMmDd(r.tanggal)))].sort();
  const header = ['NIK', 'Nama', ...allDates];
  const dataGrid = allNiks.map(item => {
    const row = [item.nik, item.nama];
    allDates.forEach(d => row.push((scheduleMap[item.nik] && scheduleMap[item.nik][d]) || '-'));
    return row;
  });

  await writeTab(sheets, spreadsheetId, 'Master_Schedule', header, dataGrid);

  // Tandai baris RESIGN: kolom A-B merah (clear menghapus format, jadi tulis ulang tiap reverse)
  const resignIdx = [];
  allNiks.forEach((item, i) => { if (item.status !== 'PPKK') resignIdx.push(i); });
  if (resignIdx.length > 0) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
    const tab = (meta.data.sheets || []).find(s => s.properties && s.properties.title === 'Master_Schedule');
    if (tab && tab.properties && tab.properties.sheetId !== undefined) {
      const sheetId = tab.properties.sheetId;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: resignIdx.map(i => ({
            repeatCell: {
              range: { sheetId, startRowIndex: i + 1, endRowIndex: i + 2, startColumnIndex: 0, endColumnIndex: 2 },
              cell: { userEnteredFormat: { backgroundColor: { red: 0.957, green: 0.8, blue: 0.8 } } },
              fields: 'userEnteredFormat.backgroundColor'
            }
          }))
        }
      });
    }
  }
  const resignCount = resignIdx.length;
  return {
    summary: `Master_Schedule: ${allNiks.length} karyawan x ${allDates.length} tanggal${resignCount ? ` (${resignCount} RESIGN)` : ''}`,
    scheduleMap
  };
}

// 2. LOG_ABSENSI (dump + generate Alpha bulan berjalan)
export async function reverseLogAbsensi(supabase, sheets, spreadsheetId, scheduleMap = null) {
  const allNiks = await fetchNikMap(supabase);
  if (!scheduleMap) {
    const res = await fetchScheduleMap(supabase);
    scheduleMap = res.map;
  }
  const logRows = await fetchAll(supabase, 'absensi_log', '*', 'id', true, 500);

  const logHeader = ["Date","NIK","Nama Lengkap","Shift","Remarks","Clock In","Clock Out","Late In","Early Out","Durasi Kerja","Foto In","Foto Out"];
  const logGrid = (logRows || []).map(r => [
    toYyyyMmDd(r.tanggal), r.nik, r.nama || '', r.shift || '', r.remarks || '',
    r.clock_in || '', r.clock_out || '', r.late_in || '', r.early_out || '', r.durasi_kerja || '',
    r.foto_in || '', r.foto_out || ''
  ]);

  // Generate baris Alpha: NIK x tanggal kerja (non-OFF) bulan berjalan tanpa baris log
  const todayJakarta = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const monthPrefix = todayJakarta.slice(0, 7);
  const todayDay = parseInt(todayJakarta.slice(8, 10), 10);
  const pad2 = (n) => String(n).padStart(2, '0');
  const logKeySet = new Set((logRows || []).map(r => `${r.nik}|${toYyyyMmDd(r.tanggal)}`));
  let alphaCount = 0;
  for (const item of allNiks) {
    for (let d = 1; d <= todayDay; d++) {
      const dateIso = `${monthPrefix}-${pad2(d)}`;
      if (logKeySet.has(`${item.nik}|${dateIso}`)) continue;
      const shiftCode = (scheduleMap[item.nik] && scheduleMap[item.nik][dateIso]) || null;
      if (!shiftCode || hitungJamKerja(shiftCode).isOff) continue;
      logGrid.push([dateIso, item.nik, item.nama, shiftCode, 'Alpha', '', '', '', '', '', '', '']);
      alphaCount++;
    }
  }
  logGrid.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));

  await writeTab(sheets, spreadsheetId, 'Log_Absensi', logHeader, logGrid);
  return { summary: `Log_Absensi: ${logGrid.length} baris (${alphaCount} Alpha)` };
}

// 3. DATA_REQUEST (dengan pagination agar tidak kepotong limit 1000)
export async function reverseDataRequest(supabase, sheets, spreadsheetId) {
  const reqRows = await fetchAll(supabase, 'absensi_request', '*', 'waktu_submit', true, 500);

  const reqHeader = ["ID Request","Waktu Submit","NIK","Nama Lengkap","Tanggal Absen","Kode Shift Baru","Jam In Baru","Jam Out Baru","Alasan","Status","Tanggal Action","Foto Lampiran","Pesan/Catatan Admin"];
  const reqGrid = (reqRows || []).map(r => [
    r.req_id, formatWaktuDb(r.waktu_submit), r.nik, r.nama || '', toYyyyMmDd(r.tanggal_absen),
    r.shift_baru || '-', r.jam_in_baru || '-', r.jam_out_baru || '-', r.alasan || '',
    r.status || 'Pending', formatWaktuDb(r.tanggal_action), r.foto_lampiran || '', r.catatan_admin || '-'
  ]);

  await writeTab(sheets, spreadsheetId, 'Data_Request', reqHeader, reqGrid);
  return { summary: `Data_Request: ${reqGrid.length} baris` };
}
