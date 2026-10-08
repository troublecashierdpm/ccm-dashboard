// src/app/api/pic/id-swipe/stock/route.js
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GAS_URL = process.env.PIC_GAS_URL || 'https://script.google.com/macros/s/AKfycbxpgybCyZxg5KzZ8NNAFj-P0_Nvqp5lMso-hubLN7-VcPKyDGBvybbaXY9zdpyxKtKK/exec';

export async function POST(req) {
  try {
    const payload = await req.json();
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'processStockManagement', payload }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('GAS belum mendukung doPost. Tambahkan doPost lalu redeploy.'); }
    const result = data.result || data.message || JSON.stringify(data);

    try {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      await supabase.from('idswipe_stock_events').insert([{
        waktu: new Date().toISOString(),
        aksi: payload.stockAction || '',
        pic: payload.pic || '',
        ids: payload.stockIdsJson ? JSON.parse(payload.stockIdsJson) : [],
        proof_url: '',
        hasil: String(result).slice(0, 500),
      }]);
    } catch {}

    if (String(result).startsWith('ERROR:')) throw new Error(String(result));
    return NextResponse.json({ success: true, message: String(result) });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
