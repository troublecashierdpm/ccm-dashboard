// src/app/api/supervisor/ai-agent/route.js
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { query, context } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("GEMINI_API_KEY exists:", !!apiKey, "length:", apiKey?.length);

    if (!apiKey) {
      return NextResponse.json({ success: true, reply: `[Mode Simulasi AI] Total staff: ${context?.totalKaryawan || 0}. Pertanyaan Anda "${query}" diterima. Masukkan GEMINI_API_KEY di .env.local untuk respon AI sesungguhnya.` });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: `Anda adalah AI Assistant Supervisor untuk Dashboard Kasir AEON. Data ringkas: ${JSON.stringify(context)}. Pertanyaan user: ${query}`
          }]
        }]
      })
    });

    const json = await response.json();

    if (!response.ok || json.error) {
      console.error("Gemini API Error:", JSON.stringify(json));
      return NextResponse.json({ success: false, message: json.error?.message || `HTTP ${response.status}` }, { status: 500 });
    }

    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, AI tidak dapat merespon saat ini.";
    return NextResponse.json({ success: true, reply });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
