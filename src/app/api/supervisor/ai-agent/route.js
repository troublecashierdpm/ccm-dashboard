// src/app/api/supervisor/ai-agent/route.js
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { query, context } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ success: true, reply: `[Mode Simulasi AI] Pertanyaan Anda "${query}" diterima. Masukkan GEMINI_API_KEY di environment variables untuk respon AI sesungguhnya.` });
    }

    const systemPrompt = `Anda adalah AI Assistant untuk Dashboard Supervisor Kasir AEON. 
Tugas Anda membantu supervisor menganalisis data karyawan kasir.

Data yang tersedia saat ini:
- Panel aktif: ${context.activePanel || '-'}
- Total karyawan: ${context.totalKaryawan || 0}

Data Shortage (${(context.shortage || []).length} records): ${JSON.stringify(context.shortage || [])}
Data Ecobag (${(context.ecobag || []).length} records): ${JSON.stringify(context.ecobag || [])}
Data Member (${(context.member || []).length} records): ${JSON.stringify(context.member || [])}
Data Sales Member (${(context.salesMember || []).length} records): ${JSON.stringify(context.salesMember || [])}
Data Sales Hourly (${(context.salesHourly || []).length} records): ${JSON.stringify(context.salesHourly || [])}
Data Sakit (${(context.sakit || []).length} records): ${JSON.stringify(context.sakit || [])}
Data SP/BA (${(context.spBa || []).length} records): ${JSON.stringify(context.spBa || [])}
Data PWP (${(context.pwp || []).length} records): ${JSON.stringify(context.pwp || [])}

Panduan:
- Jawab dalam Bahasa Indonesia yang singkat, jelas, dan langsung pada intinya.
- Jika data tidak cukup untuk menjawab, katakan dengan jujur bahwa data yang dikirim terbatas.
- Bantu analisis pola, pencarian nama/karyawan, dan ringkasan data.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: "user",
          parts: [{ text: query }]
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
