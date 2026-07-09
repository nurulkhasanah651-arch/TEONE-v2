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
    const name = String(trip.pic || '').trim();
    if (!email && !name) return null;
    const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
    if (!url || !key) return null;
    const db = createSvc(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const tok = (emp) => (emp && emp.fonnte_token && String(emp.fonnte_token).trim()) ? String(emp.fonnte_token).trim() : null;
    // 1) cocokkan via email PIC
    if (email) {
      const { data: emp } = await db.from('employees').select('fonnte_token').ilike('email', email).maybeSingle();
      const t = tok(emp); if (t) return t;
    }
    // 2) fallback: cocokkan via NAMA PIC (full_name / nickname) kalau email tak ada/tak ketemu tokennya
    if (name) {
      const { data: byFull } = await db.from('employees').select('fonnte_token').ilike('full_name', name).maybeSingle();
      const t1 = tok(byFull); if (t1) return t1;
      const { data: byNick } = await db.from('employees').select('fonnte_token').ilike('nickname', name).maybeSingle();
      const t2 = tok(byNick); if (t2) return t2;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getPicFonnteTokenById(db, tripId) {
  try {
    if (!tripId || !db) return null;
    const { data: t } = await db.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    return await getPicFonnteTokenForTrip(t);
  } catch { return null; }
}

// PIC yang perangkat WA-nya belum tersambung (employees.wa_manual = true).
// Untuk mereka: JANGAN kirim WA otomatis — tampilkan template biar dikirim manual.
export async function isPicWaManualForTrip(db, tripId) {
  try {
    if (!tripId || !db) return false;
    // KUNCI BRAND: fitur "PIC kirim WA manual" HANYA berlaku di Khasanah.
    // TravelingEropa (teone) tidak pernah terpengaruh, apa pun isi kolom wa_manual.
    try { if (currentBrandCode() !== 'khasanah') return false; } catch { return false; }
    const { data: t } = await db.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    if (!t) return true;
    const email = String(t.pic_email || '').toLowerCase();
    const name = String(t.pic || '').trim();
    // Khasanah tidak punya nomor departemen (finance/cs/visa) — hanya nomor PIC.
    // Jadi MANUAL kalau: PIC ditandai wa_manual, ATAU PIC belum punya nomor Fonnte,
    // ATAU trip belum punya PIC sama sekali. Tidak pernah ada nomor cadangan.
    const chk = (row) => {
      if (!row) return true;
      if (row.wa_manual === true) return true;
      return !(row.fonnte_token && String(row.fonnte_token).trim());
    };
    if (!email && !name) return true;
    if (email) {
      const { data: e } = await db.from('employees').select('wa_manual, fonnte_token').ilike('email', email).maybeSingle();
      if (e) return chk(e);
    }
    if (name) {
      const { data: byFull } = await db.from('employees').select('wa_manual, fonnte_token').ilike('full_name', name).maybeSingle();
      if (byFull) return chk(byFull);
      const { data: byNick } = await db.from('employees').select('wa_manual, fonnte_token').ilike('nickname', name).maybeSingle();
      if (byNick) return chk(byNick);
    }
    return true; // PIC tak ditemukan di master employees -> tak ada nomor -> manual
  } catch { return false; }
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
