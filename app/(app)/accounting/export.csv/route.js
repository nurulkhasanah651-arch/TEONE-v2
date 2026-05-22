// /accounting/export.csv?month=YYYY-MM&type=entries|accounts

import { createClient } from '@/lib/supabase/server';
import { buildCsv, csvResponse, buildFilename } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const type = url.searchParams.get('type') || 'entries';
  const supabase = createClient();

  if (type === 'accounts') {
    const { data: accs } = await supabase.from('accounts').select('*').order('name');
    const headers = [
      { key: 'name', label: 'Nama Akun' },
      { key: 'type', label: 'Tipe' },
      { key: 'starting_balance', label: 'Starting Balance' },
      { key: 'currency', label: 'Mata Uang' },
      { key: 'active', label: 'Aktif' },
      { key: 'notes', label: 'Notes' },
    ];
    return csvResponse(buildCsv(accs || [], headers), buildFilename('accounting_accounts', month));
  }

  // Default: entries
  const { data: entries } = await supabase
    .from('accounting_entries')
    .select('*, trips(kode_trip)')
    .order('date', { ascending: false });
  let filtered = entries || [];
  if (month !== 'all') filtered = filtered.filter((e) => (e.date || '').startsWith(month));

  const headers = [
    { key: 'date', label: 'Tanggal' },
    { key: 'type', label: 'In/Out' },
    { key: 'amount', label: 'Nominal' },
    { key: 'category', label: 'Kategori' },
    { key: 'description', label: 'Deskripsi' },
    { key: 'trip_kode', label: 'Trip', format: (_, r) => r.trips?.kode_trip || r.trip_id || '' },
    { key: 'account_id', label: 'Akun ID' },
    { key: 'created_by', label: 'Dibuat oleh' },
  ];

  return csvResponse(buildCsv(filtered, headers), buildFilename('accounting_entries', month));
}
