import { NextResponse } from 'next/server';

const SS_REQUEST_ID = '113-Lmv1tUjAmk7xLIredqh_bNpxFGo300d5hMd5Rns4';
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyR6R5Y26-Y40-7K6j0S5K4_V46_v6z9V-0W_K_0W_K/exec'; 

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const under = searchParams.get('under');
  const nik = searchParams.get('nik');

  try {
    // Memanggil Web App GAS yang bertindak sebagai jembatan ke SS_REQUEST_ID
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
