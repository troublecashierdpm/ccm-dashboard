import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  const { nik, token, action } = await req.json();

  if (action === 'create') {
    await supabase.from('user_sessions').delete().eq('nik', nik);
    await supabase.from('user_sessions').insert([{ nik, token, login_at: new Date().toISOString(), last_active: new Date().toISOString() }]);
    return NextResponse.json({ success: true });
  }

  if (action === 'get') {
    const { data, error } = await supabase.from('user_sessions').select('token').eq('nik', nik).single();
    return NextResponse.json({ token: data?.token || null });
  }

  if (action === 'ping') {
    await supabase.from('user_sessions').update({ last_active: new Date().toISOString() }).eq('nik', nik);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false });
}
