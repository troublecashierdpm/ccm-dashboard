// src/app/api/pic/id-swipe/initial/route.js
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

const GAS_URL = process.env.PIC_GAS_URL || 'https://script.google.com/macros/s/AKfycbxpgybCyZxg5KzZ8NNAFj-P0_Nvqp5lMso-hubLN7-VcPKyDGBvybbaXY9zdpyxKtKK/exec';

export async function GET() {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getInitialData' }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('GAS belum mendukung doPost. Tambahkan fungsi doPost lalu redeploy Web App.');
    }
    if (data.error) throw new Error(data.error);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
