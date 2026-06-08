// /trips/export.csv?month=YYYY-MM (or 'all')

import { createClient } from '@/lib/supabase/server';
import { buildCsv, csvResponse, buildFilename } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const supabase = createClient();

  const { data: trips } = await supabase.from('trips').select('*').order('departure', { ascending: false, nullsFirst: false });

  let filtered = trips || [];
  if (month !== 'all') {
    filtered = filtered.filter((t) => (t.departure || '').startsWith(month));
  }

  const headers = [
    { key: 'id', label: 'Trip ID' },
    { key: 'kode_trip', label: 'Kode' },
    { key: 'name', label: 'Nama Trip' },
    { key: 'destination', label: 'Tujuan' },
    { key: 'status', label: 'Status' },
    { key: 'ticket', label: 'Tipe Tiket' },
    { key: 'departure', label: 'Berangkat' },
    { key: 'arrival', label: 'Pulang' },
    { key: 'deadline_close', label: 'Deadline Booking' },
    { key: 'quota', label: 'Quota' },
    { key: 'sold', label: 'Terjual' },
    { key: 'seat_left', label: 'Sisa' },
    { key: 'price', label: 'Harga/Pax' },
    { key: 'pic', label: 'PIC' },
    { key: 'tl_name', label: 'Tour Leader' },
    { key: 'publish_date', label: 'Tgl Publish' },
    { key: 'closed_at', label: 'Tgl Closed' },
    { key: 'notes', label: 'Catatan' },
  ];

  const csv = buildCsv(filtered, headers);
  return csvResponse(csv, buildFilename('master_trip', month));
}
