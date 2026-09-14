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

    const systemPrompt = `Anda adalah AI Assistant cerdas untuk Dashboard Supervisor Kasir AEON.
Tugas: Membantu supervisor menganalisis data karyawan kasir secara akurat.
Jawab dalam Bahasa Indonesia, singkat, jelas, langsung pada intinya. Gunakan angka dan data yang diberikan.

Data yang tersedia (sudah dihitung/pre-aggregated):

1. Total Karyawan: ${context.totalKaryawan}

2. Global Sales Ratio: Total Member Sales = ${context.globalSales?.totalMember}, Total Hourly Sales = ${context.globalSales?.totalHourly}, Ratio = ${context.globalSales?.ratio}%

3. Top 10 Shortage (paling banyak minus): ${JSON.stringify(context.topShortage || [])}

4. Top Sakit (paling banyak absen sakit): ${JSON.stringify(context.topSakit || [])}

5. Top SP/BA (paling banyak pelanggaran): ${JSON.stringify(context.topSp || [])}

6. Data Member per karyawan per bulan: ${JSON.stringify((context.memberSummary || []).slice(0, 50))}

7. Data Ecobag per karyawan per bulan: ${JSON.stringify((context.ecobagSummary || []).slice(0, 50))}

8. Data Sales per karyawan per periode: ${JSON.stringify((context.salesSummary || []).slice(0, 50))}

Panel aktif user: ${context.activePanel}

Panduan menjawab:
- Gunakan data angka yang sudah dihitung di atas, JANGAN mengarang angka.
- Jika user tanya persentase, hitung dari data yang ada.
- Jika user tanya siapa terbaik/terburuk, lihat dari data top/ranking.
- Jika data tidak cukup untuk jawab, bilang jujur.`;

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
