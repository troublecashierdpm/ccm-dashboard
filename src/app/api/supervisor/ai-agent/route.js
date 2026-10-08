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
    const ev = context.evidence || {};
    const intent = context.intent || {};
    const fmtEv = (section) => {
      if (!section) return "(tidak diminta untuk pertanyaan ini)";
      const rows = JSON.stringify(section.data ?? section);
      const extra = section.total !== undefined ? `\n(menampilkan ${section.ditampilkan} dari ${section.total} baris)` : "";
      return rows + extra;
    };
    const namedStr = ev.namedDetails ? JSON.stringify(ev.namedDetails) : "(tidak ada nama karyawan yang disebut)";
    const salesTrendStr = ev.salesTrend ? JSON.stringify(ev.salesTrend) : "(tidak diminta)";
    const systemPrompt = `Anda adalah AI Assistant cerdas untuk Dashboard Supervisor Kasir AEON.
Tugas: Membantu supervisor menganalisis data karyawan kasir secara akurat.
Jawab dalam Bahasa Indonesia, singkat, jelas, langsung pada intinya. Gunakan angka dan data yang diberikan.

ATURAN EVIDENCE (wajib dipatuhi):
- Data di bawah ini adalah POTONGAN dari sumber yang sama dengan yang tampil di dashboard (tabel Supabase: member_per_day, ecobag_per_day, sales_member, sales_hourly, shortage_per_day, sp_ba_per_day, sakit_per_day, pwp_kasir).
- Jawab HANYA berdasarkan data yang diberikan. Jangan mengarang angka, nama, atau periode yang tidak ada di data.
- Jika data yang ditanya tidak ada di potongan ini, katakan terus terang: "Data tersebut tidak ada di potongan yang saya terima" lalu jawab dari KPI/ranking yang tersedia.
- Tiap bagian evidence mencantumkan jumlah baris yang ditampilkan vs total; sadari bahwa di luar potongan masih ada data lain.
- Selalu sertakan nama + angka spesifik + periode/bulan. Format angka Indonesia.

KONTEKS TAMPILAN USER:
- Panel aktif: ${context.activePanel}
- Filter aktif: cari nama=${context.filterAktif?.searchNama || "-"}, periode=${context.filterAktif?.filterBulan || "-"}, tipe=${context.filterAktif?.filterTipe || "-"}, under=${context.filterAktif?.dirUnder || "-"}, status=${context.filterAktif?.dirStatus || "-"}
- Karyawan terpilih: ${context.selectedKaryawan ? context.selectedKaryawan.nama + " (tab " + context.empMenu + ", stats: " + JSON.stringify(context.selectedKaryawan.stats) + ")" : "-"}
- Terdeteksi maksud pertanyaan: ${JSON.stringify(intent)}

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

4. Tren Sales Global per periode (Member vs Hourly + ratio, kronologis): ${salesTrendStr}

5. Agregat POS per karyawan (dari sales_hourly: POS mana dipakai + total transaksi + sales): ${fmtEv(ev.pos)}

6. Detail karyawan yang disebut dalam pertanyaan (semua periode & panel): ${namedStr}

7. Data Member per karyawan per bulan: ${fmtEv(ev.member)}

8. Data Ecobag per karyawan per bulan: ${fmtEv(ev.ecobag)}

9. Data Sales per karyawan per periode: ${fmtEv(ev.sales)}

10. Data PWP per karyawan per periode: ${fmtEv(ev.pwp)}

11. Detail Shortage per karyawan per periode: ${fmtEv(ev.shortageDetail)}

Panduan menjawab:
- "Tertinggi" = karyawan dengan angka paling tinggi (buruk untuk shortage/SP/sakit).
- "Terendah" = karyawan TERBAIK: zero shortage, zero SP, zero sakit.
- Jika user tanya "siapa yang terbaik", gabungkan data terendah dari SP, Sakit, dan Shortage.
- Jika user tanya "siapa yang perlu diperhatikan", tampilkan yang tertinggi.
- Jika user menyebut nama, prioritaskan bagian 6 (detail karyawan tersebut).
- Jika user tanya tren/grafik/naik-turun, pakai bagian 4 (tren global) + bagian 9 untuk per karyawan.
- Jika user tanya POS/transaksi, pakai bagian 5.
- Jika user tanya PWP, pakai bagian 10.
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
        model: 'meta-llama/llama-3.1-8b-instruct:free',
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
