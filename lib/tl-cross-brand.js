// Lintas-brand: kumpulkan trip yang di-assign ke seorang TL dari SEMUA brand (TE + Khasanah).
// Match TL by nomor WA ATAU email (union), sesuai keputusan produk.
// Dipakai portal TL agar 1 akun lihat trip dari brand mana pun.

import { BRAND_CODES } from '@/lib/brand-shared';
import { serviceClientFor } from '@/lib/supabase/service-env';

export function normPhone(p) {
  return String(p || '').replace(/\D/g, '').replace(/^0/, '62');
}

// Kumpulkan identitas TL: set email + set nomor WA (dari record tour_leaders di semua brand),
// dan tl_id per brand (buat match trip yang cuma simpan tl_id).
export async function resolveTlIdentity(user) {
  const authEmail = (user?.email || '').toLowerCase();
  const emails = new Set(authEmail ? [authEmail] : []);
  const phones = new Set();
  const tlIdByBrand = {};
  const clients = {};

  // Pass 1: cari record tour_leaders by email / user_id di tiap brand → seed email & phone.
  for (const code of BRAND_CODES) {
    const c = serviceClientFor(code);
    if (!c) continue;
    clients[code] = c;
    const ors = [];
    if (authEmail) ors.push(`email.ilike.${authEmail}`);
    if (user?.id && code === 'teone') ors.push(`user_id.eq.${user.id}`);
    if (!ors.length) continue;
    try {
      const { data } = await c.from('tour_leaders').select('id,name,email,phone,user_id').or(ors.join(','));
      for (const r of data || []) {
        tlIdByBrand[code] = r.id;
        if (r.email) emails.add(String(r.email).toLowerCase());
        if (r.phone) phones.add(normPhone(r.phone));
      }
    } catch {}
  }

  // Pass 2: brand yang belum ketemu tl_id → cocokkan pakai union email/phone (tabel TL kecil).
  for (const code of BRAND_CODES) {
    const c = clients[code];
    if (!c || tlIdByBrand[code]) continue;
    if (!emails.size && !phones.size) continue;
    try {
      const { data } = await c.from('tour_leaders').select('id,email,phone').limit(500);
      for (const r of data || []) {
        const em = r.email && emails.has(String(r.email).toLowerCase());
        const ph = r.phone && phones.has(normPhone(r.phone));
        if (em || ph) { tlIdByBrand[code] = r.id; break; }
      }
    } catch {}
  }

  return { emails, phones, tlIdByBrand, clients };
}

// Apakah trip (dari brand `code`) milik TL ini?
export function tlOwnsTrip(identity, trip, code) {
  const { emails, phones, tlIdByBrand } = identity;
  const brandTlId = tlIdByBrand[code];
  if (brandTlId != null && trip.tl_id != null && String(trip.tl_id) === String(brandTlId)) return true;
  if (trip.tl_email && emails.has(String(trip.tl_email).toLowerCase())) return true;
  if (trip.tl_phone && phones.has(normPhone(trip.tl_phone))) return true;
  return false;
}

// Ambil semua trip aktif milik TL ini dari semua brand, ditandai `_brand`.
export async function getTlTripsAllBrands(user) {
  const identity = await resolveTlIdentity(user);
  const out = [];
  for (const code of BRAND_CODES) {
    const c = identity.clients[code] || serviceClientFor(code);
    if (!c) continue;
    let trips = [];
    try {
      const { data } = await c.from('trips').select('*').order('departure', { ascending: true, nullsFirst: false });
      trips = (data || []).filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    } catch {}
    for (const t of trips) {
      // TL yang MENOLAK (reject) trip: jangan tampilkan lagi di portal/dashboard-nya.
      if (tlOwnsTrip(identity, t, code) && t.tl_assignment_status !== 'rejected') out.push({ ...t, _brand: code });
    }
  }
  // Urutkan gabungan by tanggal berangkat
  out.sort((a, b) => String(a.departure || '9999').localeCompare(String(b.departure || '9999')));
  return out;
}
