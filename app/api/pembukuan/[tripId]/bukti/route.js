// ZIP bukti bayar peserta (file di Google Drive) untuk 1 trip. Owner/accounting saja.
// Path: app/api/pembukuan/[tripId]/bukti/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { getDriveClient } from '@/lib/utils/google-sheets';
import JSZip from 'jszip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (s, fb) => (String(s || fb || '').replace(/[^\w\- ]+/g, '').trim() || fb).slice(0, 60);
const extOf = (mime) => (mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg');

export async function GET(_req, { params }) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const g = await assertStaff(user, '/accounting'); if (g.error) return NextResponse.json({ error: g.error }, { status: 403 });

  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return NextResponse.json({ error: 'Service tidak tersedia' }, { status: 500 });
  const db = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const tripId = params.tripId;

  // Peserta + nama (dari customers).
  const { data: pax } = await db.from('trip_passengers').select('id, customer_id').eq('trip_id', tripId).range(0, 4999);
  const ids = (pax || []).map((p) => p.id);
  if (!ids.length) return NextResponse.json({ error: 'Tidak ada peserta' }, { status: 404 });
  const custIds = [...new Set((pax || []).map((p) => p.customer_id).filter(Boolean))];
  const custName = {};
  for (let i = 0; i < custIds.length; i += 300) {
    const { data } = await db.from('customers').select('id, name').in('id', custIds.slice(i, i + 300));
    for (const c of (data || [])) custName[c.id] = c.name || '';
  }
  const nameByPax = {}; for (const p of (pax || [])) nameByPax[p.id] = custName[p.customer_id] || `pax-${p.id}`;

  // Pembayaran yang punya file bukti di Drive.
  let pays = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from('participant_payments')
      .select('passenger_id, type, label, amount, drive_file_id').in('passenger_id', ids.slice(i, i + 300));
    pays = pays.concat(data || []);
  }
  pays = pays.filter((p) => p.drive_file_id);
  if (!pays.length) return NextResponse.json({ error: 'Belum ada bukti bayar (file) untuk trip ini' }, { status: 404 });

  let drive; try { drive = getDriveClient(); } catch (e) { return NextResponse.json({ error: 'Google Drive tidak terkonfigurasi' }, { status: 500 }); }
  const zip = new JSZip();
  let ok = 0;
  for (const p of pays) {
    try {
      let mime = 'image/jpeg';
      try { const meta = await drive.files.get({ fileId: p.drive_file_id, fields: 'mimeType', supportsAllDrives: true }); mime = meta?.data?.mimeType || mime; } catch {}
      const res = await drive.files.get({ fileId: p.drive_file_id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      const buf = Buffer.from(res.data);
      ok += 1;
      const label = clean(`${nameByPax[p.passenger_id]} - ${p.type || p.label || 'bayar'} - ${Math.round(Number(p.amount) || 0)}`, 'bukti');
      zip.file(`${String(ok).padStart(2, '0')} - ${label}.${extOf(mime)}`, buf);
    } catch { /* skip file yang gagal */ }
  }
  if (!ok) return NextResponse.json({ error: 'Gagal mengambil file bukti dari Drive' }, { status: 502 });

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  return new NextResponse(out, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="bukti-bayar-${clean(tripId, 'trip')}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
