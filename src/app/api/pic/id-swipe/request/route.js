// src/app/api/pic/id-swipe/request/route.js
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GAS_URL = process.env.PIC_GAS_URL || 'https://script.google.com/macros/s/AKfycbxpgybCyZxg5KzZ8NNAFj-P0_Nvqp5lMso-hubLN7-VcPKyDGBvybbaXY9zdpyxKtKK/exec';

export async function POST(req) {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Payload terlalu besar atau bukan JSON. Kurangi jumlah baris lalu coba lagi." }, { status: 413 });
  }
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'processForm', payload }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      console.error('GAS form balas non-JSON:', text.slice(0, 300));
      throw new Error('GAS membalas non-JSON (kemungkinan error server). 300 karakter awal: ' + text.slice(0, 300));
    }
    const result = data.result || data.message || JSON.stringify(data);

    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      const items = payload.itemsJson ? JSON.parse(payload.itemsJson) : [];
      const reqName = payload.reqSelect === 'NEW' ? payload.reqNameNew : payload.reqSelect;
      const supName = payload.supSelect === 'NEW' ? payload.supNameNew : payload.supSelect;
      await supabase.from('idswipe_requests').insert([{
        waktu: new Date().toISOString(),
        tipe: payload.requestType || '',
        requester: reqName || '',
        superior: supName || '',
        items,
        pdf_url: String(result).startsWith('http') ? String(result) : '',
        hasil: String(result).slice(0, 500),
      }]);
      const sigs = [];
      if (payload.reqSelect === 'NEW' && payload.reqNameNew) sigs.push({ nama: payload.reqNameNew, role: 'Requester', jabatan: payload.reqPosNew || '', base64: payload.reqSignatureData || '' });
      if (payload.supSelect === 'NEW' && payload.supNameNew) sigs.push({ nama: payload.supNameNew, role: 'Superior', jabatan: payload.supPosNew || '', base64: payload.supSignatureData || '' });
      if (sigs.length > 0) await supabase.from('idswipe_signatures').upsert(sigs, { onConflict: 'nama,role' });
    } catch {}

    if (String(result).startsWith('ERROR:')) throw new Error(String(result));
    return NextResponse.json({ success: true, message: String(result), pdfUrl: String(result).startsWith('http') ? String(result) : '' });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
