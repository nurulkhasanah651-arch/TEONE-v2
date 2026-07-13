// Backfill nama profil WA (push name) utk percakapan lama yang belum ada namanya.
// KHUSUS Khasanah. Panggil dari browser (login staf): /api/waba/backfill-names
// Diproses bertahap (batch) supaya tak kena timeout/rate limit. Ulangi sampai remaining=0.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveBrandCode } from '@/lib/brand-shared';
import { serviceClientFor } from '@/lib/supabase/service-env';
import { getApicoidCustomerName } from '@/lib/utils/waba-apicoid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const _norm = (x) => { let d = String(x || '').replace(/[^0-9]/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); return d; };

export async function GET(request) {
  const host = request.headers.get('host') || '';
  if (resolveBrandCode({ host }) !== 'khasanah') return NextResponse.json({ ok: false, error: 'Khusus Khasanah' }, { status: 403 });

  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Belum login' }, { status: 401 });
  const g = await assertStaff(user, '/inbox'); if (g.error) return NextResponse.json({ ok: false, error: g.error }, { status: 403 });

  const db = serviceClientFor('khasanah');
  if (!db) return NextResponse.json({ ok: false, error: 'no db' }, { status: 500 });

  const { data: convs } = await db.from('wa_conversations')
    .select('id, customer_phone, customer_name')
    .is('customer_name', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(300);

  const list = convs || [];
  let filled = 0, tried = 0;
  const start = Date.now();
  for (const c of list) {
    if (Date.now() - start > 8500) break;
    tried++;
    let name = null;
    // 1) CRM
    try {
      const d = _norm(c.customer_phone);
      const forms = d.startsWith('62') ? [d, '0' + d.slice(2)] : [d];
      let cr = await db.from('customers').select('name').in('phone', forms).limit(1).maybeSingle();
      if (!cr.data) cr = await db.from('customers').select('name').in('whatsapp', forms).limit(1).maybeSingle();
      name = cr.data?.name || null;
    } catch {}
    // 2) push name WA Api.co.id
    if (!name) { try { name = await getApicoidCustomerName(c.customer_phone); } catch {} }
    if (name) { try { await db.from('wa_conversations').update({ customer_name: name }).eq('id', c.id); filled++; } catch {} }
    await new Promise((r) => setTimeout(r, 80));
  }

  // sisa yang masih kosong
  const { count: remaining } = await db.from('wa_conversations')
    .select('id', { count: 'exact', head: true })
    .is('customer_name', null);

  return NextResponse.json({
    ok: true, tried, filled, remaining: remaining ?? null,
    message: (remaining && remaining > 0) ? `Terisi ${filled}. Masih ${remaining} lagi — muat ulang halaman ini untuk lanjut.` : `Selesai. Terisi ${filled}, semua sudah ada nama.`,
  });
}
