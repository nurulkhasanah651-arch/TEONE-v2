// Helper untuk price breakdown per trip

export const ROOM_KEYS = [
  { key: 'quad',   label: 'Quad Room',   icon: '🛏️🛏️🛏️🛏️' },
  { key: 'triple', label: 'Triple Room', icon: '🛏️🛏️🛏️' },
  { key: 'double', label: 'Double Room', icon: '🛏️🛏️' },
  { key: 'single', label: 'Single Room', icon: '🛏️' },
  { key: 'family', label: 'Family Room', icon: '👨‍👩‍👧' },
];

export const AGE_KEYS = [
  { key: 'child_no_bed', label: 'Child no Bed',   icon: '🧒' },
  { key: 'infant',       label: 'Infant',         icon: '👶' },
];

export const ADDON_KEYS = [
  { key: 'land_tour_only', label: 'Land Tour Only', icon: '🚌' },
  { key: 'visa',           label: 'Visa',           icon: '🛂' },
  { key: 'tips',           label: 'Tips',           icon: '💰' },
  { key: 'asuransi',       label: 'Asuransi',       icon: '🏥' },
  { key: 'city_tax',       label: 'City Tax',       icon: '🏛️' },
];

// Mapping room_type string (di trip_passengers) ke price key
// Case insensitive
export function roomTypeToKey(roomType) {
  if (!roomType) return null;
  const t = roomType.toLowerCase().trim();
  if (t.includes('quad')) return 'quad';
  if (t.includes('triple')) return 'triple';
  if (t.includes('double') || t.includes('twin')) return 'double';
  if (t.includes('single')) return 'single';
  if (t.includes('family')) return 'family';
  if (t.includes('child')) return 'child_no_bed';
  if (t.includes('infant')) return 'infant';
  return null;
}

// Hitung total income projection berdasarkan peserta + price breakdown
// Return: { byRoom: { quad: { count, price, subtotal }, ... }, total, undefinedCount }
export function computeIncomeProjection(passengers = [], breakdown = {}) {
  const byRoom = {};
  let total = 0;
  let undefinedCount = 0;

  for (const p of passengers) {
    const key = roomTypeToKey(p.room_type);
    if (!key) {
      undefinedCount++;
      // Fallback: pakai price_paid kalau ada
      if (p.price_paid) total += p.price_paid;
      continue;
    }
    const price = breakdown[key] || 0;
    if (!byRoom[key]) byRoom[key] = { count: 0, price, subtotal: 0 };
    byRoom[key].count += 1;
    byRoom[key].subtotal += price;
    total += price;
  }

  return { byRoom, total, undefinedCount };
}

// Format breakdown jadi array buat dipake di form
export function breakdownToList(breakdown = {}) {
  const items = [];
  for (const r of ROOM_KEYS)   items.push({ ...r, group: 'Tipe Kamar',  value: breakdown[r.key] || 0 });
  for (const a of AGE_KEYS)    items.push({ ...a, group: 'Anak/Bayi',   value: breakdown[a.key] || 0 });
  for (const ad of ADDON_KEYS) items.push({ ...ad, group: 'Add-on',     value: breakdown[ad.key] || 0 });
  return items;
}

// Helper: hitung tanggal deadline_close otomatis = departure - 45 hari
export function autoDeadlineClose(departureDate) {
  if (!departureDate) return null;
  const d = new Date(departureDate);
  d.setDate(d.getDate() - 45);  // 1.5 bulan = 45 hari
  return d.toISOString().slice(0, 10);
}
