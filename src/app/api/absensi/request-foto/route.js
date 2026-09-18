import { NextResponse } from 'next/server';

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxnwV7dp9LKZyrPK6V1N9GwlnfcaYLmCUiE7lQyIV9DQSKqfrAPjXTrvA35cJIh4fuU/exec';

export async function POST(req) {
  try {
    const { base64Data, nik, nama } = await req.json();
    
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveRequestFoto', base64Data, nik, nama })
    });
    
    const result = await response.json();
    return NextResponse.json(result);
  } catch (e) {
    console.error("Upload error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}