// /ads/export.csv?month=YYYY-MM

import { createClient } from '@/lib/supabase/server';
import { buildCsv, csvResponse, buildFilename } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const supabase = createClient();

  const { data: ads } = await supabase
    .from('ads_entries')
    .select('*, trips(kode_trip, name)')
    .order('date', { ascending: false });

  let filtered = ads || [];
  if (month !== 'all') filtered = filtered.filter((a) => (a.date || '').startsWith(month));

  const headers = [
    { key: 'date', label: 'Tanggal' },
    { key: 'platform', label: 'Platform' },
    { key: 'campaign_name', label: 'Campaign' },
    { key: 'trip_kode', label: 'Trip', format: (_, r) => r.trips?.kode_trip || r.trip_id || '' },
    { key: 'spend', label: 'Spend (IDR)' },
    { key: 'impressions', label: 'Impressions' },
    { key: 'clicks', label: 'Clicks' },
    { key: 'leads', label: 'Leads' },
    { key: 'notes', label: 'Notes' },
    { key: 'created_by', label: 'Input oleh' },
  ];

  return csvResponse(buildCsv(filtered, headers), buildFilename('ads_spend', month));
}
