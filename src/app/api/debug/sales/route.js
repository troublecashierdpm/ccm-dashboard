import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name') || 'SITI SULPAH';
  const periode = searchParams.get('periode') || '2026-08';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // 1. Cari semua baris Sales Hourly yang namanya mengandung kata kunci
  const { data: hourlyRows } = await supabase
    .from('sales_hourly')
    .select('*')
    .ilike('nama', `%${name}%`)
    .eq('periode', periode);

  // 2. Cari juga semua yang periode-nya sama tapi namanya mirip (potensi duplikasi)
  const { data: allPeriodeRows } = await supabase
    .from('sales_hourly')
    .select('nama')
    .eq('periode', periode);

  const uniqueNames = [...new Set((allPeriodeRows || []).map(r => r.nama))].sort();
  const similarNames = uniqueNames.filter(n => n && n.toUpperCase().includes(name.toUpperCase().split(' ').pop()));

  return NextResponse.json({
    targetName: name,
    periode,
    matchCount: (hourlyRows || []).length,
    totalRows: (allPeriodeRows || []).length,
    totalUniqueNames: uniqueNames.length,
    similarNamesFound: similarNames,
    matchedRows: hourlyRows || []
  });
}
