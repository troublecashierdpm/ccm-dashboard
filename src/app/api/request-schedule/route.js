import { NextResponse } from 'next/server';

// Mock status dari sistem GAS
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const under = searchParams.get('under');
  const nik = searchParams.get('nik');

  // Integrasi pengecekan status (seperti getScheduleControl di GAS)
  return NextResponse.json({
    status: "OPEN",
    message: "",
    availableDays: ["SENIN (0/3)", "SELASA (0/4)", "RABU (0/4)", "KAMIS (0/4)", "JUMAT (0/3)"],
    userHariLama: null,
    userExists: false
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    console.log("Request Schedule Received:", body);
    
    // Logika penyimpanan ke Google Sheets via Apps Script Web App
    return NextResponse.json({ success: true, message: "Request diterima dan diproses" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
