// Storefront publik — baca trip yang di-publish (service role, brand-aware via header host)
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { ROOM_KEYS, roomTypeToKey } from '@/lib/utils/price-breakdown';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const LIST_COLS = 'id, name, slug, destination, departure, return_date, price, public_price, dp_amount, quota, sold, seat_left, cover_image_url, status, highlights, price_breakdown';

export async function getPublishedTrips(region = null) {
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true)
    .order('departure', { ascending: true, nullsFirst: false });
  let rows = data || [];
  if (region) {
    const { tripRegion } = await import('./regions');
    rows = rows.filter((t) => tripRegion(t) === region);
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
  return data || [];
}

export async function getPublishedTrip(idOrSlug) {
  const db = svc();
  if (!db || !idOrSlug) return null;
  let { data } = await db.from('trips').select('*').eq('slug', idOrSlug).eq('is_published', true).maybeSingle();
  if (!data) {
    const r = await db.from('trips').select('*').eq('id', idOrSlug).eq('is_published', true).maybeSingle();
    data = r.data;
  }
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
  return ROOM_KEYS
    .map((r) => ({ key: r.key, label: r.label, icon: r.icon, price: Number(bd[r.key]) || 0 }))
    .filter((r) => r.price > 0);
}

// Harga untuk tipe kamar tertentu (fallback ke termurah / public_price)
export function roomPriceFor(t, roomType) {
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  const key = roomTypeToKey(roomType);
  const byKey = key ? Number(bd[key]) || 0 : 0;
  if (byKey > 0) return byKey;
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
