// /cs/export.csv?month=YYYY-MM

import { createClient } from '@/lib/supabase/server';
import { buildCsv, csvResponse, buildFilename } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const supabase = createClient();

  const { data: cs } = await supabase
    .from('cs_daily_updates')
    .select('*, trips(kode_trip, name)')
    .order('tanggal', { ascending: false });

  let filtered = cs || [];
  if (month !== 'all') filtered = filtered.filter((c) => (c.tanggal || '').startsWith(month));

  const headers = [
    { key: 'tanggal', label: 'Tanggal' },
    { key: 'trip_kode', label: 'Kode Trip', format: (_, r) => r.trips?.kode_trip || r.trip_id },
    { key: 'trip_name', label: 'Nama Trip', format: (_, r) => r.trips?.name || '' },
    { key: 'total_terjual_hari_ini', label: 'Total Closing' },
    { key: 'from_instagram', label: 'IG' },
    { key: 'from_whatsapp', label: 'WA' },
    { key: 'from_offline', label: 'Offline' },
    { key: 'closing_alumni', label: 'Alumni' },
    { key: 'closing_mitra', label: 'Mitra' },
    { key: 'from_ads_meta', label: 'Closing Meta Ads' },
    { key: 'from_ads_google', label: 'Closing Google Ads' },
    { key: 'from_ads_tiktok', label: 'Closing TikTok Ads' },
    { key: 'leads_ads_meta', label: 'Leads Meta' },
    { key: 'leads_ads_google', label: 'Leads Google' },
    { key: 'leads_ads_tiktok', label: 'Leads TikTok' },
    { key: 'jumlah_leads', label: 'Leads Organik' },
    { key: 'sisa_seat', label: 'Sisa Seat' },
    { key: 'updated_by', label: 'CS' },
    { key: 'notes', label: 'Catatan' },
  ];

  const csv = buildCsv(filtered, headers);
  return csvResponse(csv, buildFilename('cs_daily', month));
}
