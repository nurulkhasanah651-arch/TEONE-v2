// R215d + R215g: Room & hotel pricing utility
// R215g FIX: normalize room_type variations ("Quad Room", "QUAD", "quad_room" → 'quad')
// Path: lib/utils/room-pricing.js

export const ROOM_CAPACITY = {
  single: 1,
  twin: 2,
  double: 2,
  triple: 3,
  quad: 4,
  family: 4,
  child_no_bed: 0,
  infant: 0,
  land_tour_only: 0,
};

export const ROOM_TYPES = [
  { key: 'single', label: 'Single', capacity: 1, color: 'bg-purple-100 text-purple-800' },
  { key: 'twin', label: 'Twin', capacity: 2, color: 'bg-blue-100 text-blue-800' },
  { key: 'double', label: 'Double', capacity: 2, color: 'bg-cyan-100 text-cyan-800' },
  { key: 'triple', label: 'Triple', capacity: 3, color: 'bg-emerald-100 text-emerald-800' },
  { key: 'quad', label: 'Quad', capacity: 4, color: 'bg-amber-100 text-amber-800' },
];

export const CURRENCIES = [
  { key: 'IDR', label: 'IDR (Rp)', symbol: 'Rp', flag: '🇮🇩' },
  { key: 'USD', label: 'USD ($)', symbol: '$', flag: '🇺🇸' },
  { key: 'EUR', label: 'EUR (€)', symbol: '€', flag: '🇪🇺' },
  { key: 'SAR', label: 'SAR (﷼)', symbol: '﷼', flag: '🇸🇦' },
];

// R215g — Normalize room_type variations
// "Quad Room", "QUAD", "quad_room", "Quad" → 'quad'
// "Triple Room", "Triple" → 'triple'
// dll
export function normalizeRoomType(roomType) {
  if (!roomType) return null;
  const t = String(roomType).toLowerCase().trim();
  if (!t) return null;
  // Match pattern (sama dengan roomTypeToKey di price-breakdown.js)
  if (t.includes('land_tour') || t.includes('land tour')) return 'land_tour_only';
  if (t.includes('infant')) return 'infant';
  if (t.includes('child')) return 'child_no_bed';
  if (t.includes('family')) return 'family';
  if (t.includes('quad')) return 'quad';
  if (t.includes('triple')) return 'triple';
  if (t.includes('double')) return 'double';
  if (t.includes('twin')) return 'twin';
  if (t.includes('single')) return 'single';
  return null;
}

// R215g — Count peserta per room type (NORMALIZED)
export function countPaxByRoomType(passengers) {
  const counts = { single: 0, twin: 0, double: 0, triple: 0, quad: 0, family: 0, child_no_bed: 0, infant: 0, land_tour_only: 0, unassigned: 0 };
  for (const p of passengers || []) {
    if (p.transfer_status === 'transferred') continue;
    if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
    const normalized = normalizeRoomType(p.room_type);
    if (normalized && counts[normalized] != null) counts[normalized]++;
    else counts.unassigned++;
  }
  return counts;
}

export function getKursForCurrency(trip, currency) {
  if (!trip) return 1;
  switch (String(currency || '').toUpperCase()) {
    case 'USD': return trip.kurs_usd || 16000;
    case 'EUR': return trip.kurs_eur || 18000;
    case 'SAR': return trip.kurs_sar || 4500;
    case 'IDR': return 1;
    default: return trip.kurs || 1;
  }
}

export function calcHotelCost({
  paxInRoom = 0,
  roomType = 'quad',
  pricePerRoom = 0,
  currency = 'IDR',
  kurs = 1,
  nights = 1,
  priceMode = 'per_night',
}) {
  const normalized = normalizeRoomType(roomType) || roomType;
  const capacity = ROOM_CAPACITY[normalized] || 1;
  const roomsNeeded = Math.ceil(Number(paxInRoom || 0) / capacity);

  const safePrice = Number(pricePerRoom) || 0;
  const safeNights = Math.max(1, Number(nights) || 1);
  const safeKurs = Number(kurs) || 1;

  const unitPriceForeign = priceMode === 'per_night'
    ? safePrice * safeNights
    : safePrice;

  const totalForeign = unitPriceForeign * roomsNeeded;
  const totalIDR = currency === 'IDR' ? totalForeign : totalForeign * safeKurs;
  const perPaxIDR = paxInRoom > 0 ? Math.round(totalIDR / paxInRoom) : 0;

  return {
    roomsNeeded,
    capacity,
    unitPriceForeign,
    totalForeign,
    totalIDR: Math.round(totalIDR),
    perPaxIDR,
    currency,
    kurs: safeKurs,
  };
}

export function calcHotelCostPerPax({
  pax = 0,
  pricePerPax = 0,
  currency = 'IDR',
  kurs = 1,
  nights = 1,
  priceMode = 'per_night',
}) {
  const safePrice = Number(pricePerPax) || 0;
  const safeNights = Math.max(1, Number(nights) || 1);
  const safePax = Math.max(0, Number(pax) || 0);
  const safeKurs = Number(kurs) || 1;

  const unitPriceForeign = priceMode === 'per_night'
    ? safePrice * safeNights
    : safePrice;

  const totalForeign = unitPriceForeign * safePax;
  const totalIDR = currency === 'IDR' ? totalForeign : totalForeign * safeKurs;
  const perPaxIDR = currency === 'IDR' ? unitPriceForeign : unitPriceForeign * safeKurs;

  return {
    pax: safePax,
    nights: safeNights,
    unitPriceForeign,
    totalForeign,
    totalIDR: Math.round(totalIDR),
    perPaxIDR: Math.round(perPaxIDR),
    currency,
    kurs: safeKurs,
  };
}

export function fmtCurrency(amount, currency = 'IDR') {
  const cur = CURRENCIES.find((c) => c.key === currency) || CURRENCIES[0];
  const n = Number(amount || 0);
  if (currency === 'IDR') return `Rp ${n.toLocaleString('id-ID')}`;
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'EUR') return `€${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'SAR') return `${cur.symbol} ${n.toLocaleString('en-US')}`;
  return `${cur.symbol} ${n.toLocaleString('id-ID')}`;
}
