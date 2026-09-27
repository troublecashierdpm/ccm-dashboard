// src/app/api/sync-absensi/reverse/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getSupabase, spreadsheet,
  reverseMasterSchedule, reverseLogAbsensi, reverseDataRequest
} from './lib';

export async function POST() {
  try {
    const supabase = getSupabase();
    const { sheets, spreadsheetId } = spreadsheet();

    let ringkasan = [];

    const master = await reverseMasterSchedule(supabase, sheets, spreadsheetId);
    ringkasan.push(master.summary);

    const log = await reverseLogAbsensi(supabase, sheets, spreadsheetId, master.scheduleMap);
    ringkasan.push(log.summary);

    const req = await reverseDataRequest(supabase, sheets, spreadsheetId);
    ringkasan.push(req.summary);

    return NextResponse.json({
      success: true,
      message: `Reverse sync sukses! ${ringkasan.join(" | ")}`
    });
  } catch (error) {
    console.error("Error reverse sync absensi:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
