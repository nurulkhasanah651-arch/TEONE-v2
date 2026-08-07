// Storefront publik — baca trip yang di-publish (service role, brand-aware via header host)
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { ROOM_KEYS, roomTypeToKey, MAIN_ADDONS, OPTIONAL_ADDONS, KHASANAH_MANDATORY_ADDONS, mainAddonTotalForKey, khMandatoryForKey, LAND_TOUR_KEYS } from '@/lib/utils/price-breakdown';

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
  const { data } = await db.from('storefront_settings').select('hero_images, regions, private_images, terms_default, logo_url, about_image, reasons_default, reasons_force').eq('id', 1).maybeSingle();
  if (!data) return null;
  return {
    hero_images: Array.isArray(data.hero_images) ? data.hero_images.filter(Boolean) : [],
    regions: Array.isArray(data.regions) ? data.regions : [],
    private_images: Array.isArray(data.private_images) ? data.private_images.filter(Boolean) : [],
    terms_default: typeof data.terms_default === 'string' ? data.terms_default : '',
    logo_url: typeof data.logo_url === 'string' ? data.logo_url : '',
    about_image: typeof data.about_image === 'string' ? data.about_image : '',
    reasons_default: typeof data.reasons_default === 'string' ? data.reasons_default : '',
    reasons_force: data.reasons_force === true,
  };
}

const LIST_COLS = 'id, name, public_title, slug, destination, departure, return_date, price, public_price, dp_amount, quota, sold, seat_left, cover_image_url, status, highlights, price_breakdown, is_flash_sale, is_best_seller, promo_badge';

// Hitung seat live = jumlah peserta aktif (kecuali transferred/refunded) — SAMA dengan Master Trip.
async function attachLiveSeats(db, rows) {
  if (!rows || !rows.length) return rows;
  const ids = rows.map((r) => r.id).filter(Boolean);
  const cnt = {};
  let ok = false;
  // Cepat: jumlah peserta per trip dari VIEW agregat (perhitungan dilakukan di DB).
  try {
    const { data, error } = await db.from('trip_live_sold').select('trip_id, sold').in('trip_id', ids);
    if (!error && Array.isArray(data)) {
      for (const r of data) cnt[r.trip_id] = Number(r.sold) || 0;
      ok = true;
    }
  } catch {}
  // Fallback: cara lama (kalau view belum ada/error) — hasil tetap akurat.
  // Paginasi via .range() supaya tidak kena cap 1000 baris PostgREST (cegah salah hitung
  // seat / potensi overbooking saat total peserta > 1000).
  if (!ok) {
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('trip_passengers')
          .select('trip_id, transfer_status, refund_status')
          .in('trip_id', ids)
          .range(from, from + 999);
        if (error) break;
        for (const p of (data || [])) {
          if (p.transfer_status === 'transferred') continue;
          if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
          cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1;
        }
        if (!data || data.length < 1000) break;
      }
    } catch {}
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
  return (await attachLiveSeats(db, data || [])).filter((t) => tripSeatLeft(t) > 0);
}

export async function getAvailableDepartureMonths() {
  // Bulan keberangkatan (YYYY-MM) dari trip published yang akan datang & masih ada seat.
  const db = svc();
  if (!db) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db.from('trips').select('departure, seat_left, sold, quota')
    .eq('is_published', true).gte('departure', today);
  const set = new Set();
  for (const t of (data || [])) {
    if (!t.departure) continue;
    const left = (t.seat_left != null) ? t.seat_left : ((t.quota || 0) - (t.sold || 0));
    if (left > 0) set.add(String(t.departure).slice(0, 7));
  }
  return [...set].sort();
}

export async function getYearEndSpecialTrips(limit = 30) {
  // Trip Spesial Liburan Akhir Tahun: keberangkatan 15 Des 2026 - 5 Jan 2027.
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true)
    .gte('departure', '2026-12-15').lte('departure', '2027-01-05')
    .order('departure', { ascending: true, nullsFirst: false })
    .limit(limit);
  return (await attachLiveSeats(db, data || [])).filter((t) => tripSeatLeft(t) > 0);
}

export async function getEarlyBooking2027Trips(limit = 30) {
  // Early Booking: semua trip keberangkatan sepanjang tahun 2027 (published, masih ada seat).
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true)
    .gte('departure', '2027-01-01').lte('departure', '2027-12-31')
    .order('departure', { ascending: true, nullsFirst: false })
    .limit(limit);
  return (await attachLiveSeats(db, data || [])).filter((t) => tripSeatLeft(t) > 0);
}

export async function getCategoryTrips(keywords = [], limit = 20) {
  // Kategori by kata kunci di nama/destinasi trip (published, masih ada seat).
  const db = svc();
  if (!db || !keywords.length) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true)
    .order('departure', { ascending: true, nullsFirst: false });
  const kws = keywords.map((k) => String(k).toLowerCase());
  const matched = (data || []).filter((t) => {
    const hay = `${t.name || ''} ${t.destination || ''}`.toLowerCase();
    return kws.some((k) => hay.includes(k));
  });
  const withSeats = await attachLiveSeats(db, matched);
  return withSeats.filter((t) => tripSeatLeft(t) > 0).slice(0, limit);
}

// Kategori etalase Open Trip (urutan tampil = urutan array). First-match-wins:
// tiap trip masuk ke kategori PERTAMA yang cocok, sisanya jatuh ke "Lainnya".
export const TRIP_CATEGORY_DEFS = [
  { key: 'west-europe', icon: '🏆', title: 'West Europe Best Seller!', subtitle: 'Semua pilihan West Europe paling laris', re: /(west europe|west to east|flash ?sale we |flashsale we |we autumn|\bwe batch)/i },
  { key: 'east-europe', icon: '❄️', title: 'East Europe Spesial Swiss + Dolomite', subtitle: 'Rute East Europe bonus Swiss & Dolomites Italy', re: /(east europe)/i },
  { key: 'spain-portugal', icon: '🇪🇸', title: 'Eropa Spain Portugal Anti Mainstream', subtitle: 'Spain, Portugal & Andalusia — rute anti-mainstream', re: /(spain|portugal|andalusia)/i },
  { key: 'balkan', icon: '🇧🇦', title: 'Keliling Negara Balkan', subtitle: 'Jelajah negara-negara Balkan', re: /(balkan)/i },
  { key: 'mediterania', icon: '🌊', title: 'Eropa Exotic — Mediterania', subtitle: 'Santorini, Malta, Amalfi & pesona Mediterania', re: /(santorini|mediterania|mediterranean|amalfi|malta|yunani|greece|\bmalt)/i },
  { key: 'aurora', icon: '🌌', title: 'Hunting Aurora', subtitle: 'Kejar cahaya utara — Russia, Scandinavia & Iceland', re: /(aurora|rusia|russia|scandinav|iceland|islandia|lofoten|baltic|norway|norwegia|finlandia|finland|tromso|lapland|swedia|sweden)/i },
  { key: 'turki', icon: '🇹🇷', title: 'Trip Hemat ke Turki — Include Makan 3x Sehari', subtitle: 'Hemat, include makan 3x sehari', re: /(turki|turkey|turkiye|türkiye)/i },
  { key: 'uk', icon: '🇬🇧', title: 'UK, Ireland & Scotland Super Lengkap', subtitle: 'England, Scotland & Ireland dalam satu perjalanan', re: /(england|scotland|\bscot\b|ireland|irlandia|united kingdom|\buk\b)/i },
  { key: 'asia-hemat', icon: '🏮', title: 'Trip Spesial Asia Hemat', subtitle: 'Hongkong, Macau, Vietnam & Korea harga hemat', re: /(hongkong|hong kong|macau|macao|makau|vietnam|sapa|korea|korean|seoul)/i },
  { key: 'japan', icon: '🌸', title: 'Trip Jepang Hemat — Bukan Backpacker, Rute Antimainstream!', subtitle: 'Bukan backpacker, tapi hemat & rute antimainstream', re: /(jepang|japan|hokkaido|osaka|tokyo|shirakawago)/i },
  { key: 'china', icon: '🐉', title: 'Trip China Mewah — Include Makan, Harga Hemat', subtitle: 'Mewah include makan, harga tetap hemat', re: /(china|tiongkok)/i },
  { key: 'new-zealand', icon: '🐑', title: 'New Zealand Spesial Lupin', subtitle: 'Slow trip New Zealand — musim bunga Lupin', re: /(new zealand|selandia baru)/i },
];

export async function getCategorizedTrips() {
  // Semua trip published dibagi ke kategori etalase; trip tanpa kategori masuk "Lainnya".
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true)
    .order('departure', { ascending: true, nullsFirst: false });
  const rows = await attachLiveSeats(db, data || []);
  const buckets = TRIP_CATEGORY_DEFS.map((c) => ({ ...c, trips: [] }));
  const other = [];
  for (const t of rows) {
    const hay = `${t.name || ''} ${t.destination || ''}`;
    const hit = buckets.find((c) => c.re.test(hay));
    (hit ? hit.trips : other).push(t);
  }
  // Available dulu, sold out di bawah (urutan tanggal tetap di tiap grup).
  const availFirst = (arr) => [...arr].sort((a, b) => ((tripSeatLeft(a) <= 0 ? 1 : 0) - (tripSeatLeft(b) <= 0 ? 1 : 0)));
  const out = buckets.filter((c) => c.trips.length > 0).map((c) => ({ ...c, trips: availFirst(c.trips) }));
  if (other.length) out.push({ key: 'next-level', icon: '🧭', title: 'Destinasi untuk The Next Level Travelers', subtitle: 'Buat kamu yang cari destinasi beda — Amerika, Canada, Bhutan & lainnya', trips: availFirst(other) });
  return out;
}

export async function getBestSellerTrips(limit = 6) {
  const db = svc();
  if (!db) return [];
  const { data } = await db.from('trips').select(LIST_COLS)
    .eq('is_published', true).eq('is_best_seller', true)
    .order('departure', { ascending: true, nullsFirst: false })
    .limit(limit);
  // Hanya tampilkan trip yang DICENTANG Best Seller & masih ada seat (sold out disembunyikan dari home).
  return (await attachLiveSeats(db, data || [])).filter((t) => tripSeatLeft(t) > 0);
}

// Template harga tour non-umroh (Khasanah) — untuk pecah pokok di invoice. Baca via service client.
export async function getTourAddonTemplatesPublic() {
  const db = svc();
  if (!db) return [];
  try {
    const { data } = await db.from('tour_addon_templates')
      .select('label, keywords, amount, active').eq('active', true).order('sort_order', { ascending: true });
    return Array.isArray(data) ? data : [];
  } catch { return []; }
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

export async function getTripForPdf(idOrSlug) {
  const db = svc();
  if (!db || !idOrSlug) return null;
  // PDF adalah dokumen promo yg sengaja bisa dibagikan sebelum trip di-publish di etalase.
  // Jadi TIDAK difilter is_published (beda dgn getPublishedTrip untuk halaman etalase).
  let { data } = await db.from('trips').select('*').eq('slug', idOrSlug).maybeSingle();
  if (!data) { const r = await db.from('trips').select('*').eq('id', idOrSlug).maybeSingle(); data = r.data; }
  if (data) await attachLiveSeats(db, [data]);
  return data || null;
}

export function tripSeatLeft(t) {
  if (t == null) return 0;
  if (t.seat_left != null) return Math.max(t.seat_left, 0);
  return Math.max((t.quota || 0) - (t.sold || 0), 0);
}
// Chip addon yg ditampilkan per tipe: infant tak ada; child_no_bed tanpa tips & city tax.
function addonsForKey(bd, key) {
  if (key === 'infant') return [];
  const excluded = key === 'child_no_bed' ? ['tips', 'city_tax'] : [];
  return MAIN_ADDONS.filter((a) => !excluded.includes(a.key)).map((a) => ({ label: a.label, value: Number(bd[a.key]) || 0 })).filter((a) => a.value > 0);
}
// KHASANAH: chip addon per tipe = main addon + biaya wajib gabungan (visa/asuransi/combo).
// Konsisten dgn khMandatoryForKey & invoice. Infant: main saja; child_no_bed: tanpa combo.
function khAddonsForKey(bd, key) {
  const out = addonsForKey(bd, key).slice();
  if (key === 'infant') return out;
  const push = (k, label) => { const v = Number(bd?.[k]) || 0; if (v > 0) out.push({ label, value: v }); };
  push('visa', 'Visa');
  push('asuransi', 'Asuransi');
  if (key !== 'child_no_bed') {
    push('asuransi_tips_local_guide', 'Asuransi & Tips Local Guide');
    push('handling_perlengkapan', 'Handling & Perlengkapan');
    push('visa_asuransi', 'Visa & Asuransi');
  }
  return out;
}
// Daftar harga per tipe kamar dari price_breakdown master trip (yg > 0)
export function tripRoomPrices(t) {
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  const add = mainAddonTotal(bd);
  const addons = MAIN_ADDONS.map((a) => ({ label: a.label, value: Number(bd[a.key]) || 0 })).filter((a) => a.value > 0);
  return ROOM_KEYS
    .filter((r) => !String(r.key).startsWith('land_tour'))
    .map((r) => { const base = Number(bd[r.key]) || 0; const px = base > 0 ? base + mainAddonTotalForKey(bd, r.key) : 0; const discount = Number(bd?._diskon?.[r.key]) || 0; return { key: r.key, label: r.label, icon: r.icon, base, discount, baseBefore: base + discount, addons: addonsForKey(bd, r.key), price: px }; })
    .filter((r) => r.price > 0);
}

// Harga "mulai" SEBELUM diskon (untuk dicoret). 0 kalau tak ada diskon (_diskon di price_breakdown).
// Diskon di-set per tipe kamar via price_breakdown._diskon (mis. { quad:1000000 }).
export function tripPriceBefore(t) {
  const p = tripPrice(t);
  if (!p) return 0;
  const rooms = tripRoomPrices(t);
  if (!rooms.length) return 0;
  const cheapest = rooms.reduce((a, b) => (b.base > 0 && b.base < a.base ? b : a), rooms[0]);
  const disc = Number(cheapest?.discount) || 0;
  return disc > 0 ? p + disc : 0;
}

// KHASANAH — daftar SEMUA biaya wajib (pokok) yg diisi di master trip untuk tampil di
// card harga etalase: main addon (flight/bagasi domestik, tips, city tax, perlengkapan, base),
// visa & asuransi terpisah, plus item wajib gabungan (Visa & Asuransi, Handling & Perlengkapan,
// Asuransi & Tips Local Guide). Hanya yg nilainya > 0. TEONE tidak memanggil ini.
// Konsisten dgn rumus pokok: base + Σ(biaya wajib ini) = harga akhir per pax (mainExpectedPerPassenger).
export function khMandatoryAddons(t) {
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  const list = [...MAIN_ADDONS, ...OPTIONAL_ADDONS, ...KHASANAH_MANDATORY_ADDONS];
  return list.map((a) => ({ label: a.label, value: Number(bd[a.key]) || 0 })).filter((a) => a.value > 0);
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
  // infant: harga dasar saja; child_no_bed: tanpa tips & city tax (tiket+bagasi domestik & base tetap)
  return base + mainAddonTotalForKey(bd, key);
}

// Item harga dipisah: "rooms" (kamar, isi 1-4 orang) vs "specials" (kategori khusus per orang)
const ROOM_GROUP = ['quad', 'triple', 'double', 'single', 'family'];
const SPECIAL_GROUP = ['child_no_bed', 'infant'];
export function tripPriceItems(t, isKh = false) {
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  const add = mainAddonTotal(bd);
  const addons = MAIN_ADDONS.map((a) => ({ label: a.label, value: Number(bd[a.key]) || 0 })).filter((a) => a.value > 0);
  const byKey = {};
  // Khasanah: harga per tipe = kamar + main addon + biaya wajib gabungan (sama dgn invoice).
  ROOM_KEYS.forEach((r) => { const base = Number(bd[r.key]) || 0; const km = (base > 0 && isKh) ? khMandatoryForKey(bd, r.key) : 0; const px = base > 0 ? base + mainAddonTotalForKey(bd, r.key) + km : 0; const discount = Number(bd?._diskon?.[r.key]) || 0; byKey[r.key] = { key: r.key, label: r.label, icon: r.icon, base, discount, baseBefore: base + discount, priceBefore: px > 0 ? px + discount : 0, addons: isKh ? khAddonsForKey(bd, r.key) : addonsForKey(bd, r.key), price: px }; });
  const rooms = ROOM_GROUP.map((k) => byKey[k]).filter((x) => x && x.price > 0);
  const specials = SPECIAL_GROUP.map((k) => byKey[k]).filter((x) => x && x.price > 0);
  // Land Tour per tipe kamar (opsi induk yg di-expand saat diklik). Label = "Land Tour Quad" dst
  let landTour = LAND_TOUR_KEYS.map((r) => {
    const base = Number(bd[r.key]) || 0;
    const px = base > 0 ? base + mainAddonTotalForKey(bd, r.key) : 0;
    return { key: r.key, label: r.label, short: r.label.replace('Land Tour ', ''), icon: r.icon, base, addons: addonsForKey(bd, r.key), price: px };
  }).filter((x) => x.price > 0);
  // Fallback: trip lama yg hanya isi land_tour_only (tanpa per-kamar) -> 1 opsi "Land Tour"
  if (landTour.length === 0) {
    const b0 = Number(bd.land_tour_only) || 0;
    if (b0 > 0) landTour = [{ key: 'land_tour_only', label: 'Land Tour', short: 'Land Tour', icon: '🚐', base: b0, addons: addonsForKey(bd, 'land_tour_only'), price: b0 + mainAddonTotalForKey(bd, 'land_tour_only') }];
  }
  return { rooms, specials, landTour };
}

// Harga Land Tour termurah utk tampilan "mulai dari" (0 kalau tak ada)
export function landTourFrom(t) {
  const { landTour } = tripPriceItems(t);
  if (!landTour || !landTour.length) return 0;
  // Tampilkan HARGA DASAR (pokok) land tour, konsisten dgn harga kamar. Biaya wajib ditambah di invoice.
  const bases = landTour.map((x) => Number(x.base) || 0).filter((v) => v > 0);
  return bases.length ? Math.min(...bases) : Math.min(...landTour.map((x) => x.price));
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

// Normalisasi daftar rekening (bisa lebih dari satu bank). Prioritas: kolom bank_accounts
// (array), fallback ke kolom tunggal bank_name/bank_account_no/bank_account_name.
export function normalizeBankAccounts(data) {
  const out = [];
  const arr = Array.isArray(data?.bank_accounts) ? data.bank_accounts : [];
  for (const a of arr) {
    const no = String(a?.account_no ?? a?.bank_account_no ?? '').trim();
    if (!no) continue;
    out.push({
      bank_name: String(a?.bank_name || 'BCA').trim(),
      account_no: no,
      account_name: String(a?.account_name ?? a?.bank_account_name ?? data?.name ?? '').trim(),
    });
  }
  if (!out.length && data?.bank_account_no) {
    out.push({
      bank_name: String(data.bank_name || 'BCA').trim(),
      account_no: String(data.bank_account_no).trim(),
      account_name: String(data.bank_account_name || data.name || '').trim(),
    });
  }
  return out;
}

// Rekening brand (untuk Transfer Bank Manual di /order/[id]).
export async function getBrandBank() {
  const db = svc();
  if (!db) return null;
  let code = 'teone'; try { code = currentBrandCode(); } catch {}
  let data = null;
  {
    const r = await db.from('brands').select('name, bank_name, bank_account_no, bank_account_name, bank_accounts').eq('code', code).maybeSingle();
    data = r.data || null;
  }
  if (!data) {
    // fallback: teone=id1, khasanah=id2
    const r = await db.from('brands').select('name, bank_name, bank_account_no, bank_account_name, bank_accounts').eq('id', code === 'khasanah' ? 2 : 1).maybeSingle();
    data = r.data || null;
  }
  if (!data) return null;
  const accounts = normalizeBankAccounts(data);
  const primary = accounts[0] || null;
  return {
    // Kompatibel lama (rekening utama = pertama).
    bank_name: primary?.bank_name || data.bank_name || 'BCA',
    bank_account_no: primary?.account_no || data.bank_account_no || '',
    bank_account_name: primary?.account_name || data.bank_account_name || data.name || '',
    // Daftar semua rekening (bisa >1).
    accounts,
  };
}

// Daftar booking Transfer Manual (untuk approval finance). status: 'pending' | 'all-recent'.
export async function getManualTransfers({ limit = 100 } = {}) {
  const db = svc();
  if (!db) return [];
  const { data: rows } = await db.from('bookings')
    .select('id, order_code, trip_id, lead_name, lead_phone, amount, payment_type, status, manual_status, payment_proof_url, payment_proof_name, manual_note, proof_submitted_at, manual_reject_reason, manual_verified_by, manual_verified_at, created_at')
    .eq('payment_method', 'manual_transfer')
    .order('proof_submitted_at', { ascending: false })
    .limit(limit);
  const list = rows || [];
  const tripIds = [...new Set(list.map((b) => b.trip_id).filter(Boolean))];
  let trips = {};
  if (tripIds.length) {
    const { data } = await db.from('trips').select('id, name, kode_trip, departure').in('id', tripIds);
    (data || []).forEach((t) => { trips[t.id] = t; });
  }
  return list.map((b) => ({ ...b, trip: trips[b.trip_id] || null }));
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
