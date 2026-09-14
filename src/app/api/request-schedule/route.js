import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    console.log("Request Schedule Received:", body);
    
    // Sesuai permintaan, tambahkan logika integrasi ke Google Apps Script/Sheets di sini.
    // Saat ini, endpoint menerima data dan mengembalikan status sukses.
    
    return NextResponse.json({ success: true, message: "Request diterima dan diproses" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
