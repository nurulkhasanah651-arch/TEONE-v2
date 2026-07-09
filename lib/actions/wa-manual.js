'use server';

// Antrean pesan WA yang TIDAK dikirim otomatis (PIC Khasanah kirim manual).
// Diisi oleh alur otomatis: pembayaran online (DP/P1/P2/P3/invoice), ongkir, reminder.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

// Trip milik PIC ini (cocokkan pic_email lalu nama)
async function tripIdsForPic(db, email, name) {
  const ids = new Set();
  try {
    if (email) {
      const { data } = await db.from('trips').select('id').ilike('pic_email', email);
      for (const t of (data || [])) ids.add(t.id);
    }
    if (name) {
      const { data } = await db.from('trips').select('id').ilike('pic', name);
      for (const t of (data || [])) ids.add(t.id);
    }
  } catch {}
  return [...ids];
}

export async function getManualWaQueue(picFilter = '') {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/wa-manual'); if (g.error) return { error: g.error };

  const db = svc() || auth;
  const role = await resolveAuthoritativeRole(user);

  // PIC hanya melihat antrean trip-nya sendiri. Selain itu boleh lihat semua + filter.
  let restrictIds = null;
  if (role === 'pic') {
    let name = '';
    try {
      const { data: emp } = await db.from('employees').select('full_name').ilike('email', (user.email || '').toLowerCase()).maybeSingle();
      name = emp?.full_name || '';
    } catch {}
    restrictIds = await tripIdsForPic(db, (user.email || '').toLowerCase(), name);
    if (restrictIds.length === 0) return { ok: true, pending: [], done: [], pics: [], role, scoped: true };
  }

  let q = db.from('wa_outbox')
    .select('id, target_phone, message, kind, status, trip_id, created_at, sent_at')
    .like('kind', 'manual_pending%')
    .neq('kind', 'manual_pending_ongkir') // ongkir/perlengkapan dikirim manual lewat modal di panel Perlengkapan
    .order('created_at', { ascending: false })
    .limit(300);
  if (restrictIds) q = q.in('trip_id', restrictIds);

  const { data, error } = await q;
  if (error) return { error: error.message };
  const rows = data || [];

  // Lampirkan info trip + PIC
  const tripIds = [...new Set(rows.map((r) => r.trip_id).filter(Boolean))];
  const tripMap = {};
  if (tripIds.length) {
    try {
      const { data: trips } = await db.from('trips').select('id, kode_trip, name, pic').in('id', tripIds);
      for (const t of (trips || [])) tripMap[t.id] = t;
    } catch {}
  }
  let enriched = rows.map((r) => {
    const t = tripMap[r.trip_id] || null;
    return { ...r, trip_kode: t?.kode_trip || null, trip_name: t?.name || null, pic: t?.pic || null };
  });

  const pics = [...new Set(enriched.map((r) => r.pic).filter(Boolean))].sort();
  if (picFilter) enriched = enriched.filter((r) => (r.pic || '') === picFilter);

  return {
    ok: true,
    role,
    scoped: !!restrictIds,
    pics,
    pending: enriched.filter((r) => r.status === 'pending'),
    done: enriched.filter((r) => r.status !== 'pending').slice(0, 50),
    brand: (() => { try { return currentBrandCode(); } catch { return ''; } })(),
  };
}

export async function markManualWaSent(id) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/wa-manual'); if (g.error) return { error: g.error };

  const db = svc() || auth;
  const role = await resolveAuthoritativeRole(user);

  // PIC hanya boleh menandai antrean trip-nya sendiri.
  if (role === 'pic') {
    const { data: row } = await db.from('wa_outbox').select('trip_id').eq('id', id).maybeSingle();
    let name = '';
    try {
      const { data: emp } = await db.from('employees').select('full_name').ilike('email', (user.email || '').toLowerCase()).maybeSingle();
      name = emp?.full_name || '';
    } catch {}
    const mine = await tripIdsForPic(db, (user.email || '').toLowerCase(), name);
    if (!row?.trip_id || !mine.includes(row.trip_id)) return { error: 'Bukan antrean trip kamu' };
  }

  const { error } = await db.from('wa_outbox')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id).like('kind', 'manual_pending%');
  if (error) return { error: error.message };
  revalidatePath('/wa-manual');
  return { ok: true };
}
