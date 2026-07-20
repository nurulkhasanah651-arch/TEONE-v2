// Sistem PIC — berlaku SEMUA brand (TEONE & Khasanah).
// PIC (role 'pic') discope ke trip yang di-assign ke dia (pic_email / pic name).
//
// - getPicScope: tentukan apakah user adalah PIC khasanah (role 'pic') → discope.
// - filterTripsForPic: saring daftar trip ke milik PIC (by pic_email / pic name).
// - getPicFonnteTokenForTrip: ambil token Fonnte milik PIC trip (utk kirim WA).

import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';

export async function getPicScope(supabase, user) {
  try {
    if (!user) return { scoped: false };

    // R234: role OTORITATIF dari master employees. Tabel `users` bisa basi/out-of-sync
    // (mis. employees=pic tapi users=manager) -> PIC bocor lihat semua trip.
    // Bersifat MENAMBAH: kalau salah satu sumber bilang 'pic', tetap discope.
    let isPic = false;
    try { isPic = (await resolveAuthoritativeRole(user, null)) === 'pic'; } catch {}

    let uname = '';
    try {
      const { data: u } = await supabase.from('users').select('role, name').eq('id', user.id).maybeSingle();
      if (u?.role === 'pic') isPic = true;
      uname = (u?.name || '').toLowerCase();
    } catch {}

    if (!isPic) return { scoped: false };

    // Nama utk cocokkan trips.pic — utamakan master employees, fallback ke users.name
    let name = uname;
    try {
      const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
      if (url && key) {
        const db = createSvc(url, key, { auth: { persistSession: false } });
        const { data: emp } = await db.from('employees')
          .select('full_name, nickname').ilike('email', (user.email || '').toLowerCase()).maybeSingle();
        const n = (emp?.nickname || emp?.full_name || '').trim().toLowerCase();
        if (n) name = n;
      }
    } catch {}

    return { scoped: true, email: (user.email || '').toLowerCase(), name };
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
    // R235: baca `employees` HARUS lewat service-role.
    // RLS punya policy RESTRICTIVE `pic_block_all` USING (NOT is_pic()) -> user ber-role
    // 'pic' melihat 0 baris di employees. Kalau lookup ini memakai client sesi user, maka
    // saat PIC sendiri yang klik Kirim Invoice/Approve, baris-nya tak terbaca -> chk(null)
    // -> return true -> diam-diam masuk mode manual (tanpa Fonnte, tanpa wa_log).
    // Owner/finance yang klik trip yang sama tetap auto-send, sehingga gejalanya tampak
    // seperti "tiba-tiba WA PIC tidak terkirim".
    let emp = db;
    try {
      const _u = brandSupabaseUrl(); const _k = brandServiceRoleKey();
      if (_u && _k) emp = createSvc(_u, _k, { auth: { autoRefreshToken: false, persistSession: false } });
    } catch {}
    if (email) {
      const { data: e } = await emp.from('employees').select('wa_manual, fonnte_token').ilike('email', email).maybeSingle();
      if (e) return chk(e);
    }
    if (name) {
      const { data: byFull } = await emp.from('employees').select('wa_manual, fonnte_token').ilike('full_name', name).maybeSingle();
      if (byFull) return chk(byFull);
      const { data: byNick } = await emp.from('employees').select('wa_manual, fonnte_token').ilike('nickname', name).maybeSingle();
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
    // Utamakan pic_email (identitas PIC yg OTORITATIF & ikut ter-update tiap ganti PIC)
    // -> nama karyawan terkini. Field `pic` (teks) bisa basi (nama PIC lama), jadi cuma fallback.
    if (t.pic_email) {
      const { data: emp } = await db.from('employees').select('full_name, nickname').ilike('email', String(t.pic_email).toLowerCase()).maybeSingle();
      if (emp) {
        const nm = (emp.nickname && emp.nickname.trim()) ? emp.nickname.trim() : String(emp.full_name || '').trim();
        if (nm) return nm;
      }
    }
    if (t.pic && String(t.pic).trim()) return String(t.pic).trim();
    return null;
  } catch { return null; }
}
