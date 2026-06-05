// R215d: Room & hotel pricing utility
// Path: lib/utils/room-pricing.js

export const ROOM_CAPACITY = {
  single: 1,
  twin: 2,
  double: 2,
  triple: 3,
  quad: 4,
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

// Count peserta per room type
export function countPaxByRoomType(passengers) {
  const counts = { single: 0, twin: 0, double: 0, triple: 0, quad: 0, unassigned: 0 };
  for (const p of passengers || []) {
    if (p.transfer_status === 'transferred') continue;
    if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
    const t = String(p.room_type || '').toLowerCase();
    if (counts[t] != null) counts[t]++;
    else counts.unassigned++;
  }
  return counts;
}

// Get kurs from trip based on currency
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

// Main hotel calc
//   paxInRoom: jumlah pax yg masuk room type ini (auto-count atau manual)
//   roomType: 'single'|'twin'|'double'|'triple'|'quad'
//   pricePerRoom: harga per room (dalam currency asli)
//   currency: 'USD'|'EUR'|'SAR'|'IDR'
//   kurs: rate kurs ke IDR
//   nights: jumlah malam
//   priceMode: 'per_night' | 'total_stay'
export function calcHotelCost({
  paxInRoom = 0,
  roomType = 'quad',
  pricePerRoom = 0,
  currency = 'IDR',
  kurs = 1,
  nights = 1,
  priceMode = 'per_night',
}) {
  const capacity = ROOM_CAPACITY[roomType] || 1;
  const roomsNeeded = Math.ceil(Number(paxInRoom || 0) / capacity);

  const safePrice = Number(pricePerRoom) || 0;
  const safeNights = Math.max(1, Number(nights) || 1);
  const safeKurs = Number(kurs) || 1;

  // unit price per room (in foreign currency)
  const unitPriceForeign = priceMode === 'per_night'
    ? safePrice * safeNights
    : safePrice;

  // total foreign = unit × rooms
  const totalForeign = unitPriceForeign * roomsNeeded;

  // total IDR
  const totalIDR = currency === 'IDR' ? totalForeign : totalForeign * safeKurs;

  // per pax cost
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

// R215d v2 — Hotel cost Mode B: per pax × hari (gak perlu room type)
//   pax: jumlah peserta
//   pricePerPax: harga per peserta (in foreign currency)
//   currency: 'USD'|'EUR'|'SAR'|'IDR'
//   kurs: rate kurs ke IDR
//   nights: jumlah malam
//   priceMode: 'per_night' | 'total_stay'
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

  // unit price per pax (in foreign)
  const unitPriceForeign = priceMode === 'per_night'
    ? safePrice * safeNights
    : safePrice;

  // total foreign = unit × pax
  const totalForeign = unitPriceForeign * safePax;

  // total IDR
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

// Format helper
export function fmtCurrency(amount, currency = 'IDR') {
  const cur = CURRENCIES.find((c) => c.key === currency) || CURRENCIES[0];
  const n = Number(amount || 0);
  if (currency === 'IDR') return `Rp ${n.toLocaleString('id-ID')}`;
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'EUR') return `€${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'SAR') return `${cur.symbol} ${n.toLocaleString('en-US')}`;
  return `${cur.symbol} ${n.toLocaleString('id-ID')}`;
}
