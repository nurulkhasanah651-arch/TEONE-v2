// Sistem PIC KHASANAH (khasanah-only). Tidak berdampak ke teone/travelingeropa
// karena semua fungsi di-gate `currentBrandCode() === 'khasanah'`.
//
// - getPicScope: tentukan apakah user adalah PIC khasanah (role 'pic') → discope.
// - filterTripsForPic: saring daftar trip ke milik PIC (by pic_email / pic name).
// - getPicFonnteTokenForTrip: ambil token Fonnte milik PIC trip (utk kirim WA).

import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';

export async function getPicScope(supabase, user) {
  try {
    if (currentBrandCode() !== 'khasanah' || !user) return { scoped: false };
    const { data: u } = await supabase.from('users').select('role, name').eq('id', user.id).maybeSingle();
    if (!u || u.role !== 'pic') return { scoped: false };
    return { scoped: true, email: (user.email || '').toLowerCase(), name: (u.name || '').toLowerCase() };
  } catch {
    return { scoped: false };
  }
}

export function filterTripsForPic(trips, scope) {
  if (!scope || !scope.scoped) return trips || [];
  return (trips || []).filter((t) =>
    (t.pic_email && String(t.pic_email).toLowerCase() === scope.email) ||
    (t.pic && scope.name && String(t.pic).toLowerCase() === scope.name)
  );
}

export async function getPicFonnteTokenForTrip(trip) {
  try {
    if (currentBrandCode() !== 'khasanah' || !trip) return null;
    const email = String(trip.pic_email || '').toLowerCase();
    if (!email) return null;
    const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
    if (!url || !key) return null;
    const db = createSvc(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: emp } = await db.from('employees').select('fonnte_token').ilike('email', email).maybeSingle();
    return (emp && emp.fonnte_token && String(emp.fonnte_token).trim()) ? String(emp.fonnte_token).trim() : null;
  } catch {
    return null;
  }
}

export async function getPicFonnteTokenById(db, tripId) {
  try {
    if (currentBrandCode() !== 'khasanah' || !tripId || !db) return null;
    const { data: t } = await db.from('trips').select('pic_email').eq('id', tripId).maybeSingle();
    return await getPicFonnteTokenForTrip(t);
  } catch { return null; }
}
