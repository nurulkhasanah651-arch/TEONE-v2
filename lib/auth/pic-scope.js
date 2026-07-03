// Sistem PIC — berlaku SEMUA brand (TEONE & Khasanah).
// PIC (role 'pic') discope ke trip yang di-assign ke dia (pic_email / pic name).
//
// - getPicScope: tentukan apakah user adalah PIC khasanah (role 'pic') → discope.
// - filterTripsForPic: saring daftar trip ke milik PIC (by pic_email / pic name).
// - getPicFonnteTokenForTrip: ambil token Fonnte milik PIC trip (utk kirim WA).

import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';

export async function getPicScope(supabase, user) {
  try {
    if (!user) return { scoped: false };
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
    if (!trip) return null;
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
    if (!tripId || !db) return null;
    const { data: t } = await db.from('trips').select('pic_email').eq('id', tripId).maybeSingle();
    return await getPicFonnteTokenForTrip(t);
  } catch { return null; }
}

export async function getPicNameForTrip(db, tripId) {
  try {
    if (!tripId || !db) return null;
    const { data: t } = await db.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    if (!t) return null;
    if (t.pic && String(t.pic).trim()) return String(t.pic).trim();
    if (t.pic_email) {
      const { data: emp } = await db.from('employees').select('full_name, nickname').ilike('email', String(t.pic_email).toLowerCase()).maybeSingle();
      if (emp) return (emp.nickname && emp.nickname.trim()) ? emp.nickname.trim() : (emp.full_name || null);
    }
    return null;
  } catch { return null; }
}
