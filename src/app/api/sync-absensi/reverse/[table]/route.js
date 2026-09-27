// src/app/api/sync-absensi/reverse/[table]/route.js
// Single reverse sync (DB -> Sheet) per tabel.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getSupabase, spreadsheet,
  reverseMasterSchedule, reverseLogAbsensi, reverseDataRequest
} from '../lib';

export async function POST(request, { params }) {
  try {
    const { table } = params;
    const supabase = getSupabase();
    const { sheets, spreadsheetId } = spreadsheet();

    if (table === 'master-schedule') {
      const res = await reverseMasterSchedule(supabase, sheets, spreadsheetId);
      return NextResponse.json({ success: true, message: `Reverse sync sukses! ${res.summary}` });
    }

    if (table === 'log-absensi') {
      const res = await reverseLogAbsensi(supabase, sheets, spreadsheetId);
      return NextResponse.json({ success: true, message: `Reverse sync sukses! ${res.summary}` });
    }

    if (table === 'data-request') {
      const res = await reverseDataRequest(supabase, sheets, spreadsheetId);
      return NextResponse.json({ success: true, message: `Reverse sync sukses! ${res.summary}` });
    }

    return NextResponse.json({ success: false, message: "Tabel tidak dikenal." }, { status: 404 });
  } catch (error) {
    console.error("Error single reverse sync absensi:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
