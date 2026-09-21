import { NextResponse } from 'next/server';

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxnwV7dp9LKZyrPK6V1N9GwlnfcaYLmCUiE7lQyIV9DQSKqfrAPjXTrvA35cJIh4fuU/exec'; 

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const under = searchParams.get('under');
  const nik = searchParams.get('nik');

  try {
    const response = await fetch(`${GAS_WEB_APP_URL}?action=getScheduleInfo&under=${under}&nik=${nik}`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ status: "CLOSED", message: "Gagal memuat data dari server." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body.pilihHari || !body.request || !body.nik) {
      return NextResponse.json({ success: false, message: "Data tidak lengkap: pilihHari, request, dan nik wajib diisi." }, { status: 400 });
    }

    const payload = {
      action: 'submitScheduleRequest',
      pilihHari: String(body.pilihHari),
      request: String(body.request),
      nik: String(body.nik),
      nama: String(body.nama || ''),
      under: String(body.under || ''),
    };

    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      console.error("GAS response bukan JSON:", text.slice(0, 500));
      return NextResponse.json({ success: false, message: "Gagal memproses respon dari server jadwal." }, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST request-schedule error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
