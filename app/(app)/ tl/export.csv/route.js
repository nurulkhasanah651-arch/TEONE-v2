// /tl/export.csv?month=YYYY-MM&type=trips|expenses

import { createClient } from '@/lib/supabase/server';
import { buildCsv, csvResponse, buildFilename } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const type = url.searchParams.get('type') || 'trips';
  const supabase = createClient();

  if (type === 'expenses') {
    const { data: exp } = await supabase
      .from('tl_expenses')
      .select('*, trips(kode_trip, name)')
      .order('date', { ascending: false });
    let filtered = exp || [];
    if (month !== 'all') filtered = filtered.filter((e) => (e.date || '').startsWith(month));

    const headers = [
      { key: 'date', label: 'Tanggal' },
      { key: 'trip_kode', label: 'Trip', format: (_, r) => r.trips?.kode_trip || r.trip_id || '' },
      { key: 'trip_name', label: 'Nama Trip', format: (_, r) => r.trips?.name || '' },
      { key: 'category', label: 'Kategori' },
      { key: 'description', label: 'Deskripsi' },
      { key: 'amount', label: 'Nominal (IDR)' },
      { key: 'photo_url', label: 'Bukti URL' },
      { key: 'created_by', label: 'TL' },
    ];
    return csvResponse(buildCsv(filtered, headers), buildFilename('tl_expenses', month));
  }

  // Default: trips dengan TL assigned
  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .not('tl_name', 'is', null)
    .order('departure', { ascending: false });
  let filtered = trips || [];
  if (month !== 'all') filtered = filtered.filter((t) => (t.departure || '').startsWith(month));

  const headers = [
    { key: 'kode_trip', label: 'Kode' },
    { key: 'name', label: 'Nama Trip' },
    { key: 'departure', label: 'Berangkat' },
    { key: 'arrival', label: 'Pulang' },
    { key: 'tl_name', label: 'Tour Leader' },
    { key: 'status', label: 'Status' },
    { key: 'quota', label: 'Quota' },
    { key: 'sold', label: 'Terjual' },
    { key: 'tl_petty_cash', label: 'Petty Cash' },
  ];

  return csvResponse(buildCsv(filtered, headers), buildFilename('tl_trips', month));
}
