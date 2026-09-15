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
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'submitScheduleRequest', ...body })
    });
    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
