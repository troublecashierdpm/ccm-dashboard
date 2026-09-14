// src/app/api/supervisor/ai-agent/route.js
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { query, context } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ success: true, reply: `[Mode Simulasi AI] Pertanyaan Anda "${query}" diterima. Masukkan OPENROUTER_API_KEY di environment variables untuk respon AI sesungguhnya.` });
    }

    const kpi = context.kpi || {};
    const systemPrompt = `Anda adalah AI Assistant cerdas untuk Dashboard Supervisor Kasir AEON.
Tugas: Membantu supervisor menganalisis data karyawan kasir secara akurat.
Jawab dalam Bahasa Indonesia, singkat, jelas, langsung pada intinya. Gunakan angka dan data yang diberikan.

Data yang tersedia:

1. Total Karyawan: ${context.totalKaryawan}

2. KPI RANKING:
   a. Shortage TERTINGGI (paling banyak minus/kekurangan kas): ${JSON.stringify(kpi.shortage?.tertinggi || [])}
   b. Shortage TERENDAH (paling sedikit/tidak ada shortage sama sekali): ${JSON.stringify(kpi.shortage?.terendah || [])}
   c. Surat Pernyataan (SP/BA) TERTINGGI (paling banyak pelanggaran): ${JSON.stringify(kpi.sp?.tertinggi || [])}
   d. Surat Pernyataan (SP/BA) TERENDAH (TIDAK punya SP/BA sama sekali = karyawan paling disiplin): ${JSON.stringify(kpi.sp?.terendah || [])}
   e. Absensi Sakit TERTINGGI (paling sering sakit): ${JSON.stringify(kpi.sakit?.tertinggi || [])}
   f. Absensi Sakit TERENDAH (TIDAK pernah sakit sama sekali): ${JSON.stringify(kpi.sakit?.terendah || [])}

3. Global Sales Ratio: Total Member Sales = ${context.globalSales?.totalMember}, Total Hourly Sales = ${context.globalSales?.totalHourly}, Ratio = ${context.globalSales?.ratio}%

4. Data Member per karyawan per bulan: ${JSON.stringify((context.memberSummary || []).slice(0, 50))}

5. Data Ecobag per karyawan per bulan: ${JSON.stringify((context.ecobagSummary || []).slice(0, 50))}

6. Data Sales per karyawan per periode: ${JSON.stringify((context.salesSummary || []).slice(0, 50))}

Panel aktif user: ${context.activePanel}

Panduan menjawab:
- "Tertinggi" = karyawan dengan angka paling tinggi (buruk untuk shortage/SP/sakit).
- "Terendah" = karyawan TERBAIK: zero shortage, zero SP, zero sakit.
- Jika user tanya "siapa yang terbaik", gabungkan data terendah dari SP, Sakit, dan Shortage.
- Jika user tanya "siapa yang perlu diperhatikan", tampilkan yang tertinggi.
- Selalu sertakan nama dan angka spesifik.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ccm-dashboard-nine.vercel.app',
        'X-Title': 'CCM Dashboard AI Assistant'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ]
      })
    });

    const json = await response.json();

    if (!response.ok || json.error) {
      console.error("OpenRouter API Error:", JSON.stringify(json));
      return NextResponse.json({ success: false, message: json.error?.message || json.message || `HTTP ${response.status}` }, { status: 500 });
    }

    const reply = json.choices?.[0]?.message?.content || "Maaf, AI tidak dapat merespon saat ini.";
    return NextResponse.json({ success: true, reply });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
