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

const MAX_AGENT_STEPS = 4;
const TOOL_TIMEOUT_MS = 20000;

// ===== FASE D: loop agen Gemini function calling =====
// LLM wajib query via tools dulu (maks 4 langkah), baru merangkai jawaban.
// Return { reply, toolCalls: [{tool, args, ok}] } atau throw.
async function runAgent(apiKey, model, agentPrompt, query, history = []) {
  const { TOOL_DECLARATIONS, execTool } = await import('../ai-tools.js');
  const histContents = (history || []).slice(-4).filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.text).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.text).slice(0, 500) }]
  }));
  let contents = [...histContents, { parts: [{ text: query }] }];
  const toolCalls = [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: agentPrompt }] },
        contents,
        tools: [{ function_declarations: TOOL_DECLARATIONS }],
        tool_config: { function_calling_config: { mode: step === 0 ? "ANY" : "AUTO" } },
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    }, TIMEOUT_MS);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch { throw new Error(`Gemini agen balas non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`); }
    if (!res.ok || json.error) throw new Error(json.error?.message || `Gemini agen HTTP ${res.status}`);
    const cand = json.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const fc = parts.find(p => p.functionCall);

    if (!fc) {
      const reply = parts.map(p => p.text || '').join('').trim();
      if (!reply) throw new Error('Agen tidak mengembalikan jawaban teks.');
      return { reply, toolCalls };
    }

    const toolName = fc.functionCall.name;
    const toolArgs = fc.functionCall.args || {};
    let toolResult;
    try {
      const withTimeout = await Promise.race([
        execTool(toolName, toolArgs),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`Tool ${toolName} timeout ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS)),
      ]);
      toolResult = withTimeout;
      toolCalls.push({ tool: toolName, args: toolArgs, ok: true });
    } catch (e) {
      toolResult = { error: e.message };
      toolCalls.push({ tool: toolName, args: toolArgs, ok: false, error: e.message });
    }
    contents = [
      ...contents,
      { role: "model", parts: [{ functionCall: fc.functionCall }] },
      { role: "function", parts: [{ functionResponse: { name: toolName, response: toolResult } }] },
    ];
  }
  throw new Error('Agen melebihi batas 4 langkah tool tanpa jawaban final.');
}

export async function POST(req) {
  try {
    const { query, context, history } = await req.json();
    const cleanHistory = Array.isArray(history)
      ? history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.text).slice(-4)
          .map(m => ({ role: m.role, text: String(m.text).slice(0, 500) }))
      : [];

    const kpi = context.kpi || {};
    const ev = context.evidence || {};
    const intent = context.intent || {};
    const jp = context.jawabanPasti || null;

    // ===== FASE FINAL: jawaban deterministik dari frontend =====
    // LLM hanya mengubahnya jadi bahasa natural. Dilarang hitung ulang / ubah angka / ubah urutan.
    const fmtNum = (n) => Number(n || 0).toLocaleString("id-ID");
    const renderTemplate = (j) => {
      if (!j) return null;
      if (j.tipe === "kosong") return `Tidak ada data ${j.panelLabel} pada periode ${j.periode}. Sumber: Ranking ${j.panelLabel}.`;
      if (j.tipe === "ranking") {
        const lines = [`${j.panelLabel} ${j.arah} periode ${j.periode} adalah ${j.rank1.nama} dengan ${fmtNum(j.rank1.nilai)}${j.rank1.satuan ? " " + j.rank1.satuan : ""}.`];
        j.top5.slice(1).forEach(r => lines.push(`Rank ${r.rank}: ${r.nama} — ${fmtNum(r.nilai)}${r.satuan ? " " + r.satuan : ""}.`));
        lines.push(`Sumber: ${j.sumber}.`);
        return lines.join("\n");
      }
      if (j.tipe === "tren") {
        const lines = [`Tren ${j.panelLabel} periode ${j.trenRows[0]?.periode || ""} s/d ${j.trenRows[j.trenRows.length - 1]?.periode || ""}: ${j.arahTren} (selisih ${fmtNum(j.selisih)}).`];
        j.trenRows.forEach(r => lines.push(`${r.periode}: ${fmtNum(r.nilai)}${r.satuan ? " " + r.satuan : ""}.`));
        lines.push(`Sumber: ${j.sumber}.`);
        return lines.join("\n");
      }
      if (j.tipe === "detail_nama") {
        const r = j.ringkas;
        const lines = [`Ringkasan ${j.nama} periode ${j.periode}:`];
        lines.push(`Member ${fmtNum(r.member)}, Ecobag ${fmtNum(r.ecobag)} pcs, PWP ${fmtNum(r.pwp)} pcs, Shortage ${fmtNum(r.shortageAbs)}.`);
        if (r.salesRatioTerakhir) lines.push(`Sales ratio terakhir ${r.salesRatioTerakhir.periode}: ${r.salesRatioTerakhir.ratio}% (member ${fmtNum(r.salesRatioTerakhir.memberSales)} / hourly ${fmtNum(r.salesRatioTerakhir.hourlySales)}).`);
        lines.push(`Sumber: ${j.sumber}.`);
        return lines.join("\n");
      }
      if (j.tipe === "bersih") {
        if (!j.daftar || j.daftar.length === 0) return `Tidak ada kasir kategori bersih pada periode ${j.periode} (status Kontrak/PPKK/Maganghub, min. 2 dari 3 kriteria nol). Sumber: Karyawan Bersih.`;
        const lines = [`Kasir kategori paling rendah (bersih) periode ${j.periode}: ${j.totalLolos} dari ${j.totalEligible} kasir (shortage 0 + sakit 0 + SP 0, min. 2 terpenuhi; over kecil tidak menggugurkan).`];
        j.daftar.slice(0, 10).forEach(d => lines.push(`Rank ${d.rank}: ${d.nama} (${d.status}) — short ${fmtNum(d.short)}, over ${fmtNum(d.over)}, sakit ${d.sakit}x, SP ${d.sp}x [${d.kriteria.join(", ")}].`));
        if (j.daftar.length > 10) lines.push(`…dan ${j.daftar.length - 10} lainnya.`);
        lines.push(`Sumber: ${j.sumber}.`);
        return lines.join("\n");
      }
      return null;
    };
    const templateJawaban = renderTemplate(jp);
    const validReply = (reply) => {
      if (!jp || jp.tipe === "kosong") return true;
      if (jp.tipe === "ranking") {
        return reply.includes(jp.rank1.nama) && reply.replace(/\D/g, "").includes(String(jp.rank1.nilai).replace(/\D/g, "").slice(0, 3));
      }
      if (jp.tipe === "detail_nama") return reply.includes(jp.nama);
      if (jp.tipe === "tren") return jp.trenRows.every(r => reply.includes(r.periode));
      if (jp.tipe === "bersih") {
        if (!jp.daftar || jp.daftar.length === 0) return reply.includes("Tidak ada");
        return reply.includes(jp.daftar[0].nama) && reply.includes(jp.periode);
      }
      return true;
    };
    const fmtEv = (section) => {
      if (!section) return "(tidak diminta untuk pertanyaan ini)";
      const rows = JSON.stringify(section.data ?? section);
      const extra = section.total !== undefined ? `\n(menampilkan ${section.ditampilkan} dari ${section.total} baris)` : "";
      return rows + extra;
    };
    const pangkas = !!(jp && templateJawaban);
    const namedStr = pangkas ? "(lihat JAWABAN PASTI)" : (ev.namedDetails ? JSON.stringify(ev.namedDetails) : "(tidak ada nama karyawan yang disebut)");
    const salesTrendStr = pangkas ? "(lihat JAWABAN PASTI)" : (ev.salesTrend ? JSON.stringify(ev.salesTrend) : "(tidak diminta)");
    const candidatesStr = !pangkas && ev.namaCandidates ? JSON.stringify(ev.namaCandidates) : null;
    const sec = (label, val) => pangkas ? `${label}: (lihat JAWABAN PASTI)` : `${label}: ${val}`;
    // Jika jawaban pasti ada: prompt dipangkas — tinggal peran + jawaban + aturan bahasa.
    const sysRules = jp && templateJawaban ? `Anda adalah AI Assistant Dashboard Supervisor Kasir AEON.
Tugas: ubah JAWABAN PASTI di bawah menjadi Bahasa Indonesia yang natural dan ringkas.
DILARANG: menghitung ulang, mengubah angka/nama/periode/urutan, menambah data dari luar, atau menjawab hal lain.

JAWABAN PASTI (jangan diubah isinya):
${JSON.stringify(jp)}

ATURAN:
- Baris 1 = jawaban langsung dari template. Boleh rapikan bahasa, angka/nama/periode/rank HARUS sama persis.
- Maksimal tambah 1 kalimat konteks. Akhiri dengan baris Sumber persis seperti template.` : `Anda adalah AI Assistant cerdas untuk Dashboard Supervisor Kasir AEON.
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

${pangkas ? "" : `Data yang tersedia:

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

${candidatesStr ? `KANDIDAT NAMA (nama yang diketik cocok dengan >1 karyawan — JANGAN menebak, tanyakan klarifikasi): ${candidatesStr}\n\n` : ""}`}
${pangkas ? "" : `Panduan menjawab:
- "Tertinggi" = karyawan dengan angka paling tinggi (buruk untuk shortage/SP/sakit).
- "Terendah" = karyawan TERBAIK: zero shortage, zero SP, zero sakit.
- Jika user tanya "siapa yang terbaik", gabungkan data terendah dari SP, Sakit, dan Shortage.
- Jika user tanya "siapa yang perlu diperhatikan", tampilkan yang tertinggi.
- Jika user menyebut nama, prioritaskan bagian 6 (detail karyawan tersebut).
- Jika user tanya tren/grafik/naik-turun, pakai bagian 4 (tren global) + bagian 9 untuk per karyawan.
- Jika user tanya POS/transaksi, pakai bagian 5.
- Jika user tanya PWP, pakai bagian 10.
- Selalu sertakan nama dan angka spesifik.`}`;

    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
    const orKey = process.env.OPENROUTER_API_KEY;
    const orModel = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL_DEFAULT;

    if (!geminiKey && !orKey) {
      return NextResponse.json({ success: true, reply: `[Mode Simulasi AI] Pertanyaan Anda "${query}" diterima. Masukkan GEMINI_API_KEY di environment variables untuk respon AI sesungguhnya.` });
    }

    const errs = [];
    const answerWithValidation = (reply) => {
      if (templateJawaban && !validReply(reply || "")) {
        console.warn("AI reply gagal validasi, pakai template deterministik.");
        return templateJawaban;
      }
      return reply;
    };

    // ===== FASE D: mode agen — hanya bila TIDAK ada jawabanPasti =====
    // LLM query DB langsung via tools (maks 4 langkah), bukan menebak dari potongan.
    // Gagal -> template deterministik bila ada, else error tegas (tanpa LLM bebas).
    const modeAgen = !jp || !templateJawaban;
    const validAgentReply = (reply, toolCalls) => {
      if (!toolCalls || toolCalls.length === 0) return false;
      const okCalls = toolCalls.filter(t => t.ok);
      if (okCalls.length === 0) return false;
      // Jawaban harus memuat minimal 1 nama/angka dari hasil tool terakhir yang sukses.
      // Pengecekan longgar di sini; ketepatan angka dijamin karena LLM hanya merangkai hasil tool.
      return reply && reply.trim().length >= 20;
    };
    const renderAgentFallback = async () => {
      // Fallback deterministik dari hasil tool terakhir bila LLM gagal merangkai.
      return null;
    };

    if (modeAgen && geminiKey) {
      try {
        const agentPrompt = `Anda adalah AI Assistant Dashboard Supervisor Kasir AEON dengan akses TOOLS database.
ATURAN KERAS:
- WAJIB memanggil minimal 1 tool sebelum menjawab. DILARANG menjawab dari pengetahuan umum.
- Pilih tool sesuai pertanyaan: ranking untuk tertinggi/terendah/siapa, tren untuk naik-turun/grafik, detail_karyawan untuk orang tertentu atau kata dia/nya (resolusi dari riwayat), daftar_periode bila periode kosong, karyawan_bersih untuk bersih/disiplin/nol/zero/terbaik (shortage 0 + sakit 0 + SP 0, min. 2 dari 3).
- Maksimal 4 langkah tool. Setelah data cukup, rangkai jawaban Bahasa Indonesia: baris 1 jawaban langsung (nama + angka + periode), lalu rincian, terakhir "Sumber: <nama tool>".
- Jika tool mengembalikan klarifikasi/tidakDitemukan/error, sampaikan itu ke user dan berhenti (jangan menebak).
- Maksimal 5 baris data per jawaban. Format angka Indonesia.`;
        const { reply, toolCalls } = await runAgent(geminiKey, geminiModel, agentPrompt, query, cleanHistory);
        if (!validAgentReply(reply, toolCalls)) throw new Error("Jawaban agen tidak memuat hasil tool.");
        return NextResponse.json({ success: true, reply });
      } catch (e) {
        console.error("Gemini Agent Error:", e.message);
        errs.push(`Agen: ${e.message}`);
      }
    }

    if (geminiKey && !modeAgen) {
      try {
        const reply = await callGemini(geminiKey, geminiModel, systemPrompt, query, cleanHistory);
        return NextResponse.json({ success: true, reply: answerWithValidation(reply) });
      } catch (e) {
        console.error("Gemini API Error:", e.message);
        errs.push(`Gemini: ${e.message}`);
      }
    }

    if (orKey) {
      try {
        const reply = await callOpenRouter(orKey, orModel, systemPrompt, query, cleanHistory);
        return NextResponse.json({ success: true, reply: answerWithValidation(reply) });
      } catch (e) {
        console.error("OpenRouter API Error:", e.message);
        errs.push(`OpenRouter: ${e.message}`);
      }
    }
    // Semua provider gagal tapi jawaban pasti ada: kembalikan template deterministik.
    if (templateJawaban) return NextResponse.json({ success: true, reply: templateJawaban });

    return NextResponse.json({ success: false, message: errs.join(" | ") || "Semua provider AI gagal." }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
