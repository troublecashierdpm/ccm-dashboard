// src/app/api/pic/signature/upload/route.js
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const body = await req.json();
    
    if (!body.sigData || !body.sigData.startsWith('data:image')) {
      return NextResponse.json({ success: false, message: 'Invalid signature data' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Parse base64 data
    const base64 = body.sigData.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    
    // Generate unique filename
    const type = body.type || 'req'; // 'req' for requester, 'sup' for superior
    const fileName = `${body.type}_${body.tanggal}_${body.waktu}_${Date.now()}.png`.replace(/[:\/]/g, '-');

    const { error } = await supabase.storage
      .from('signatures')
      .upload(fileName, buffer, { 
        contentType: 'image/png',
        upsert: true 
      });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from('signatures').getPublicUrl(fileName);

    return NextResponse.json({ 
      success: true, 
      url: pub.publicUrl 
    });

  } catch (e) {
    console.error('Signature upload error:', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}