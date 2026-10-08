// src/app/api/supervisor/ai-agent/route.js
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

const GEMINI_MODEL_DEFAULT = 'gemini-2.0-flash';
const OPENROUTER_MODEL_DEFAULT = 'meta-llama/llama-3.1-8b-instruct';
const TIMEOUT_MS = 45000;

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(apiKey, model, systemPrompt, query, history = []) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const histContents = (history || []).slice(-6).filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.text).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.text).slice(0, 500) }]
  }));
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [...histContents, { parts: [{ text: query }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
    })
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Gemini balas non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`); }
  if (!res.ok || json.error) throw new Error(json.error?.message || `Gemini HTTP ${res.status}`);
  const reply = (json.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!reply) throw new Error('Gemini tidak mengembalikan teks.');
  return reply;
}

async function callOpenRouter(apiKey, model, systemPrompt, query, history = []) {
  const histMsgs = (history || []).slice(-6).filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.text).map(m => ({
    role: m.role, content: String(m.text).slice(0, 500)
  }));
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ccm-dashboard-nine.vercel.app',
      'X-Title': 'CCM Dashboard AI Assistant'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...histMsgs,
        { role: 'user', content: query }
      ]
    })
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || json.message || `OpenRouter HTTP ${res.status}`);
  return json.choices?.[0]?.message?.content || "Maaf, AI tidak dapat merespon saat ini.";
}

export async function POST(req) {
  try {
    const { query, context, history } = await req.json();
    const cleanHistory = Array.isArray(history)
      ? history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.text).slice(-6)
          .map(m => ({ role: m.role, text: String(m.text).slice(0, 500) }))
      : [];

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
    const candidatesStr = ev.namaCandidates ? JSON.stringify(ev.namaCandidates) : null;
    const sysRules = `Anda adalah AI Assistant cerdas untuk Dashboard Supervisor Kasir AEON.
Tugas: Membantu supervisor menganalisis data karyawan kasir secara akurat.
Jawab dalam Bahasa Indonesia, singkat, jelas, langsung pada intinya. Gunakan angka dan data yang diberikan.

ATURAN EVIDENCE (wajib dipatuhi):
- Data di bawah ini adalah POTONGAN dari sumber yang sama dengan yang tampil di dashboard (tabel Supabase: member_per_day, ecobag_per_day, sales_member, sales_hourly, shortage_per_day, sp_ba_per_day, sakit_per_day, pwp_kasir).
- Jawab HANYA berdasarkan data yang diberikan. Jangan mengarang angka, nama, atau periode yang tidak ada di data.
- Jika data yang ditanya tidak ada di potongan ini, katakan terus terang: "Data tersebut tidak ada di potongan yang saya terima" lalu jawab dari KPI/ranking yang tersedia.
- Tiap bagian evidence mencantumkan jumlah baris yang ditampilkan vs total; sadari bahwa di luar potongan masih ada data lain.
- Selalu sertakan nama + angka spesifik + periode/bulan. Format angka Indonesia.

ATURAN ANTI-AMBIGU (wajib dipatuhi):
- FORMAT JAWABAN: baris 1 = jawaban langsung (nama + angka + periode). Baris berikut = rincian pendukung. Terakhir = "Sumber: <nama bagian data>".
- Satu pertanyaan = satu jawaban tegas. Dilarang menjawab "bisa A bisa B" tanpa memilih berdasarkan data.
- RUJUKAN ("dia/nya/tersebut/bulan lalu"): WAJIB diresolusi dari riwayat percakapan yang diberikan. Jika riwayat tidak cukup, tanyakan 1 klarifikasi spesifik, jangan menebak.
- NAMA GANDA: jika ada daftar kandidat nama, JANGAN menebak — tanyakan 1 klarifikasi ("Maksud Anda X atau Y?") lalu berhenti.
- FILTER: jika konteks menyebut periode/nama yang difilter user, jawab scoped ke situ dan sebutkan scopenya.
- RANKING: "tertinggi" = angka terbesar (buruk untuk shortage/SP/sakit); "terendah/terbaik" = nol/tidak ada kasus; pakai bagian ranking yang tersedia, bukan menebak dari slice mentah.
- PRIORITAS PANEL (kritis): kata "penjualan/jual/terjual X" berarti panel X. "Penjualan ecobag" = bagian 8/17 SAJA — DILARANG mengambil angka dari bagian Sales (9/15) atau panel lain. "Penjualan member" = bagian 7/14. "Sales/ratio/%" tanpa kata panel = bagian 9/15. Jika evidence panel yang diminta null/tidak diminta, katakan data tidak tersedia, JANGAN substitusi dari panel lain.
- PERIODE: jika konteks menyebut periodeDiminta, jawab scoped ke periode itu. Jika periodeKosong = true, jawab tegas "Tidak ada data <panel> pada periode <periode>" tanpa angka, lalu tawarkan periode terdekat yang ada di tren.
- SUMBER: baris terakhir jawaban WAJIB format "Sumber: <nomor>. <nama bagian>" (contoh "Sumber: 17. Ranking Ecobag").
- Dilarang mengulang seluruh tabel mentah. Maksimal 5 baris data per jawaban.`;
    const systemPrompt = `${sysRules}

KONTEKS TAMPILAN USER:
- Panel aktif: ${context.activePanel}
- Filter aktif: cari nama=${context.filterAktif?.searchNama || "-"}, periode=${context.filterAktif?.filterBulan || "-"}, tipe=${context.filterAktif?.filterTipe || "-"}, under=${context.filterAktif?.dirUnder || "-"}, status=${context.filterAktif?.dirStatus || "-"}
- Karyawan terpilih: ${context.selectedKaryawan ? context.selectedKaryawan.nama + " (tab " + context.empMenu + ", stats: " + JSON.stringify(context.selectedKaryawan.stats) + ")" : "-"}
- Periode yang diminta user: ${ev.periodeDiminta || "-"}${ev.periodeKosong ? " (KOSONG — tidak ada data panel pada periode ini)" : ""}
- Panel tunggal terdeteksi: ${intent.panelTunggal || "-"} (jika ada, evidence panel lain sengaja disembunyikan)
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

12. Detail SP per karyawan per bulan + jenis pelanggaran: ${fmtEv(ev.spDetail)}

13. Detail Sakit per karyawan per bulan: ${fmtEv(ev.sakitDetail)}

14. Ranking Member (top5/bottom5 total): ${ev.rankingMember ? JSON.stringify(ev.rankingMember) : "(tidak diminta)"}

15. Ranking Sales Ratio (top5/bottom5): ${ev.rankingSales ? JSON.stringify(ev.rankingSales) : "(tidak diminta)"}

16. Ranking PWP (top5/bottom5 total): ${ev.rankingPwp ? JSON.stringify(ev.rankingPwp) : "(tidak diminta)"}

17. Ranking Ecobag (top5/bottom5 total): ${ev.rankingEcobag ? JSON.stringify(ev.rankingEcobag) : "(tidak diminta)"}

${candidatesStr ? `KANDIDAT NAMA (nama yang diketik cocok dengan >1 karyawan — JANGAN menebak, tanyakan klarifikasi): ${candidatesStr}\n\n` : ""}Panduan menjawab:
- "Tertinggi" = karyawan dengan angka paling tinggi (buruk untuk shortage/SP/sakit).
- "Terendah" = karyawan TERBAIK: zero shortage, zero SP, zero sakit.
- Jika user tanya "siapa yang terbaik", gabungkan data terendah dari SP, Sakit, dan Shortage.
- Jika user tanya "siapa yang perlu diperhatikan", tampilkan yang tertinggi.
- Jika user menyebut nama, prioritaskan bagian 6 (detail karyawan tersebut).
- Jika user tanya tren/grafik/naik-turun, pakai bagian 4 (tren global) + bagian 9 untuk per karyawan.
- Jika user tanya POS/transaksi, pakai bagian 5.
- Jika user tanya PWP, pakai bagian 10.
- Selalu sertakan nama dan angka spesifik.`;

    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
    const orKey = process.env.OPENROUTER_API_KEY;
    const orModel = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL_DEFAULT;

    if (!geminiKey && !orKey) {
      return NextResponse.json({ success: true, reply: `[Mode Simulasi AI] Pertanyaan Anda "${query}" diterima. Masukkan GEMINI_API_KEY di environment variables untuk respon AI sesungguhnya.` });
    }

    const errs = [];

    if (geminiKey) {
      try {
        const reply = await callGemini(geminiKey, geminiModel, systemPrompt, query, cleanHistory);
        return NextResponse.json({ success: true, reply });
      } catch (e) {
        console.error("Gemini API Error:", e.message);
        errs.push(`Gemini: ${e.message}`);
      }
    }

    if (orKey) {
      try {
        const reply = await callOpenRouter(orKey, orModel, systemPrompt, query, cleanHistory);
        return NextResponse.json({ success: true, reply });
      } catch (e) {
        console.error("OpenRouter API Error:", e.message);
        errs.push(`OpenRouter: ${e.message}`);
      }
    }

    return NextResponse.json({ success: false, message: errs.join(" | ") || "Semua provider AI gagal." }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
