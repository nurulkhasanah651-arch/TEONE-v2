// /tl-master/export.csv — semua TL (no month filter — master data)

import { createClient } from '@/lib/supabase/server';
import { assertStaff } from '@/lib/auth/require-staff';
import { NextResponse } from 'next/server';
import { buildCsv, csvResponse } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const _g = await assertStaff(user, '/tl-master');
  if (_g.error) return NextResponse.json({ error: _g.error }, { status: user ? 403 : 401 });
  const { data: tls } = await supabase.from('tour_leaders').select('*').order('name');

  const headers = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Nama' },
    { key: 'type', label: 'Tipe' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'No HP' },
    { key: 'active', label: 'Aktif' },
    { key: 'notes', label: 'Catatan' },
    { key: 'created_at', label: 'Tgl Daftar', format: (v) => (v || '').slice(0, 10) },
  ];

  const csv = buildCsv(tls || [], headers);
  const filename = `master_tl_${new Date().toISOString().slice(0, 10)}.csv`;
  return csvResponse(csv, filename);
}
