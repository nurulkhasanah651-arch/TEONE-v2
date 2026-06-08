// /finance/export.csv?month=YYYY-MM&type=items|payments
// type: 'items' = trip_finance_items (HPP+Income), 'payments' = participant_payments

import { createClient } from '@/lib/supabase/server';
import { buildCsv, csvResponse, buildFilename } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const type = url.searchParams.get('type') || 'items';
  const supabase = createClient();

  if (type === 'payments') {
    const { data: pays } = await supabase
      .from('participant_payments')
      .select('*, trip_passengers(trip_id, customers(name))')
      .order('paid_at', { ascending: false, nullsFirst: false });
    let filtered = pays || [];
    if (month !== 'all') filtered = filtered.filter((p) => (p.paid_at || '').startsWith(month));

    const headers = [
      { key: 'paid_at', label: 'Tanggal Bayar' },
      { key: 'trip_id', label: 'Trip', format: (_, r) => r.trip_passengers?.trip_id || '' },
      { key: 'pax_name', label: 'Peserta', format: (_, r) => r.trip_passengers?.customers?.name || '' },
      { key: 'type', label: 'Jenis Bayar' },
      { key: 'amount', label: 'Nominal (IDR)' },
      { key: 'due_at', label: 'Jatuh Tempo' },
      { key: 'notes', label: 'Notes' },
      { key: 'created_by', label: 'Dicatat oleh' },
    ];
    const csv = buildCsv(filtered, headers);
    return csvResponse(csv, buildFilename('finance_payments', month));
  }

  // Default: trip_finance_items
  const { data: items } = await supabase
    .from('trip_finance_items')
    .select('*, trips(kode_trip, name)')
    .order('created_at', { ascending: false });
  let filtered = items || [];
  if (month !== 'all') filtered = filtered.filter((i) => (i.created_at || '').startsWith(month));

  const headers = [
    { key: 'created_at', label: 'Tgl Dibuat', format: (v) => (v || '').slice(0, 10) },
    { key: 'trip_id', label: 'Trip', format: (_, r) => r.trips?.kode_trip || r.trip_id },
    { key: 'item_type', label: 'Type (income/hpp)' },
    { key: 'category', label: 'Kategori' },
    { key: 'component', label: 'Komponen' },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'basic_fare', label: 'Harga Satuan' },
    { key: 'qty', label: 'Qty' },
    { key: 'total_amount', label: 'Total' },
    { key: 'payment_status', label: 'Status Bayar' },
    { key: 'transfer_date', label: 'Tgl Transfer' },
    { key: 'payment_request_status', label: 'Request Status' },
    { key: 'notes', label: 'Notes' },
  ];

  const csv = buildCsv(filtered, headers);
  return csvResponse(csv, buildFilename(`finance_${type}`, month));
}
