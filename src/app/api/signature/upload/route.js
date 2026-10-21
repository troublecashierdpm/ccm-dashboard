import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadSignatureToStorage } from '@/lib/signatureStorage';

export async function POST(req) {
  try {
    const { sigData, role, name } = await req.json();

    if (!sigData || !sigData.startsWith('data:image')) {
      return NextResponse.json({ success: false, message: 'Invalid signature data' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const publicUrl = await uploadSignatureToStorage(supabase, sigData, role || 'signature', name || 'user');

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
