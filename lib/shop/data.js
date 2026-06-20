// Storefront publik — baca trip yang di-publish (service role, brand-aware via header host)
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { ROOM_KEYS, roomTypeToKey, MAIN_ADDONS } from '@/lib/utils/price-breakdown';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Konten Etalase (header slider + region) yang di-set admin. Service role; fallback ke null.
export async function getStorefrontSettingsPublic() {
  const db = svc();
  if (!db) return null;
  const { data } = await db.from('storefront_settings').select('hero_images, regions, private_images, terms_default, logo_url, about_image').eq('id', 1).maybeSingle();
  if (!data) return null;
  return {
    hero_images: Array.isArray(data.hero_images) ? data.hero_images.filter(Boolean) : [],
    regions: Array.isArray(data.regions) ? data.regions : [],
    private_images: Array.isArray(data.private_images) ? data.private_images.filter(Boolean) : [],
    terms_default: typeof data.terms_default === 'string' ? data.terms_default : '',
    logo_url: typeof data.logo_url === 'string' ? data.logo_url : '',
    about_image: typeof data.about_image === 'string' ? data.about_image : '',
  };
}

const LIST_COLS = 'id, name, public_title, slug, destination, departure, return_date, price, public_price, dp_amount, quota, sold, seat_left, cover_image_url, status, highlights, price_breakdown, is_flash_sale, is_best_seller';

// Hitung seat live = jumlah peserta aktif (kecuali transferred/refunded) — SAMA dengan Master Trip.
async function attachLiveSeats(db, rows) {
  if (!rows || !rows.length) return rows;
  let pax = [];
  try { const { data } = await db.from('trip_passengers').select('trip_id, transfer_status, refund_status'); pax = data || []; } catch {}
  const cnt = {};
  for (const p of pax) {
    if (p.transfer_status === 'transferred') continue;
    if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
    cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1;
  }
  for (const t of rows) { const c = cnt[t.id] || 0; t.sold = c; t.seat_left = Math.max((t.quota || 0) - c, 0); }
  return rows;
}

export async function getPublishedTrips(region = null) {
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true)
    .order('departure', { ascending: true, nullsFirst: false });
  let rows = await attachLiveSeats(db, data || []);
  if (region) {
    const { effectiveRegions, tripRegionIn } = await import('./regions');
    const settings = await getStorefrontSettingsPublic();
    const regs = effectiveRegions(settings?.regions);
    rows = rows.filter((t) => tripRegionIn(t, regs) === region);
  }
  return rows;
}

export async function getLatestTrips(limit = 6) {
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true)
    .order('departure', { ascending: true, nullsFirst: false })
    .limit(limit);
  return await attachLiveSeats(db, data || []);
}

export async function getFlashSaleTrips(limit = 8) {
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true).eq('is_flash_sale', true)
    .order('departure', { ascending: true, nullsFirst: false })
    .limit(limit);
  return await attachLiveSeats(db, data || []);
}

export async function getBestSellerTrips(limit = 6) {
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true).eq('is_best_seller', true)
    .order('departure', { ascending: true, nullsFirst: false })
    .limit(limit);
  // Hanya tampilkan trip yang DICENTANG Best Seller (tanpa fallback ke jadwal terdekat).
  return await attachLiveSeats(db, data || []);
}

export async function getPublishedTrip(idOrSlug) {
  const db = svc();
  if (!db || !idOrSlug) return null;
  let { data } = await db.from('trips').select('*').eq('slug', idOrSlug).eq('is_published', true).maybeSingle();
  if (!data) {
    const r = await db.from('trips').select('*').eq('id', idOrSlug).eq('is_published', true).maybeSingle();
    data = r.data;
  }
  if (data) await attachLiveSeats(db, [data]);
  return data || null;
}

export function tripSeatLeft(t) {
  if (t == null) return 0;
  if (t.seat_left != null) return Math.max(t.seat_left, 0);
  return Math.max((t.quota || 0) - (t.sold || 0), 0);
}
// Daftar harga per tipe kamar dari price_breakdown master trip (yg > 0)
export function tripRoomPrices(t) {
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  const add = mainAddonTotal(bd);
  const addons = MAIN_ADDONS.map((a) => ({ label: a.label, value: Number(bd[a.key]) || 0 })).filter((a) => a.value > 0);
  return ROOM_KEYS
    .map((r) => { const base = Number(bd[r.key]) || 0; const px = base > 0 ? (r.key === 'infant' ? base : base + add) : 0; return { key: r.key, label: r.label, icon: r.icon, base, addons: r.key === 'infant' ? [] : addons, price: px }; })
    .filter((r) => r.price > 0);
}


// Biaya admin DP awal via web (sekali, walau banyak pax). Sumber: payment-fee.
export { ADMIN_FEE_DP_WEB as ADMIN_FEE, ADMIN_FEE_ONLINE } from './payment-fee';

// Total addon WAJIB (pokok) per pax: tips, flight domestik, bagasi domestik, city tax, base.
// Visa & optional TIDAK termasuk (sama seperti rumus invoice).
export function mainAddonTotal(bd) {
  if (!bd || typeof bd !== 'object') return 0;
  return MAIN_ADDONS.reduce((sum, a) => sum + (Number(bd[a.key]) || 0), 0);
}
// Harga pokok per orang utk sebuah tipe (kamar/kategori) = harga tipe + main addons.
export function pokokPriceForKey(bd, key) {
  const base = Number(bd?.[key]) || 0;
  if (base <= 0) return 0;
  if (key === 'infant') return base; // infant: harga dasar saja, tanpa biaya wajib
  return base + mainAddonTotal(bd);
}

// Item harga dipisah: "rooms" (kamar, isi 1-4 orang) vs "specials" (kategori khusus per orang)
const ROOM_GROUP = ['single', 'double', 'triple', 'quad', 'family'];
const SPECIAL_GROUP = ['child_no_bed', 'infant', 'land_tour_only'];
export function tripPriceItems(t) {
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  const add = mainAddonTotal(bd);
  const addons = MAIN_ADDONS.map((a) => ({ label: a.label, value: Number(bd[a.key]) || 0 })).filter((a) => a.value > 0);
  const byKey = {};
  ROOM_KEYS.forEach((r) => { const base = Number(bd[r.key]) || 0; const px = base > 0 ? (r.key === 'infant' ? base : base + add) : 0; byKey[r.key] = { key: r.key, label: r.label, icon: r.icon, base, addons: r.key === 'infant' ? [] : addons, price: px }; });
  const rooms = ROOM_GROUP.map((k) => byKey[k]).filter((x) => x && x.price > 0);
  const specials = SPECIAL_GROUP.map((k) => byKey[k]).filter((x) => x && x.price > 0);
  return { rooms, specials };
}

// Harga untuk tipe kamar tertentu (fallback ke termurah / public_price)
export function roomPriceFor(t, roomType) {
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  const key = roomTypeToKey(roomType);
  const p = key ? pokokPriceForKey(bd, key) : 0;
  if (p > 0) return p;
  return tripPrice(t);
}

// Harga tampil "mulai dari": public_price (override) → kamar termurah → price legacy
export function tripPrice(t) {
  if (Number(t?.public_price) > 0) return Number(t.public_price);
  const rooms = tripRoomPrices(t);
  if (rooms.length) return Math.min(...rooms.map((r) => r.price));
  return Number(t?.price || 0);
}

export async function getBooking(id) {
  const db = svc();
  if (!db || !id) return null;
  const { data: b } = await db.from('bookings').select('*').eq('id', id).maybeSingle();
  if (!b) return null;
  const { data: trip } = await db.from('trips').select('id, name, slug, destination, departure, return_date, cover_image_url, public_price, price, dp_amount').eq('id', b.trip_id).maybeSingle();
  return { ...b, trip: trip || null };
}

// ===== Portal peserta =====
// Ambil profil customer + bookings (dengan trip) milik user login.
export async function getPesertaData(user) {
  const db = svc();
  if (!db || !user) return { customer: null, bookings: [] };
  const email = (user.email || '').toLowerCase();

  // cari customer by user_id → fallback email
  let customer = null;
  {
    const { data } = await db.from('customers').select('*').eq('user_id', user.id).limit(1).maybeSingle();
    customer = data || null;
  }
  if (!customer && email) {
    const { data } = await db.from('customers').select('*').ilike('email', email).limit(1).maybeSingle();
    customer = data || null;
    if (customer && !customer.user_id) { try { await db.from('customers').update({ user_id: user.id }).eq('id', customer.id); } catch {} }
  }

  // bookings: by customer_id → union by lead_email
  const ids = new Set();
  let rows = [];
  if (customer?.id) {
    const { data } = await db.from('bookings').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false });
    (data || []).forEach((b) => { if (!ids.has(b.id)) { ids.add(b.id); rows.push(b); } });
  }
  if (email) {
    const { data } = await db.from('bookings').select('*').ilike('lead_email', email).order('created_at', { ascending: false });
    (data || []).forEach((b) => { if (!ids.has(b.id)) { ids.add(b.id); rows.push(b); } });
  }

  // attach trip
  const tripIds = [...new Set(rows.map((b) => b.trip_id).filter(Boolean))];
  let trips = {};
  if (tripIds.length) {
    const { data } = await db.from('trips').select('id, name, slug, destination, departure, return_date, cover_image_url').in('id', tripIds);
    (data || []).forEach((t) => { trips[t.id] = t; });
  }
  const bookings = rows.map((b) => ({ ...b, trip: trips[b.trip_id] || null }))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return { customer, bookings };
}
