// Helper untuk price breakdown per trip — Round 47: tambah expected-per-pax include add-ons

export const ROOM_KEYS = [
  { key: 'quad',   label: 'Quad Room',   icon: '🛏️🛏️🛏️🛏️' },
  { key: 'triple', label: 'Triple Room', icon: '🛏️🛏️🛏️' },
  { key: 'double', label: 'Double Room', icon: '🛏️🛏️' },
  { key: 'single', label: 'Single Room', icon: '🛏️' },
  { key: 'family', label: 'Family Room', icon: '👨‍👩‍👧' },
];

export const AGE_KEYS = [
  { key: 'child_no_bed', label: 'Child no Bed', icon: '🧒' },
  { key: 'infant',       label: 'Infant',       icon: '👶' },
];

export const ADDON_KEYS = [
  { key: 'land_tour_only', label: 'Land Tour Only', icon: '🚌' },
  { key: 'visa',           label: 'Visa',           icon: '🛂' },
  { key: 'tips',           label: 'Tips',           icon: '💰' },
  { key: 'asuransi',       label: 'Asuransi',       icon: '🏥' },
  { key: 'city_tax',       label: 'City Tax',       icon: '🏛️' },
];

// Mapping room_type string ke price key
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

// Hitung expected per peserta = harga room + semua add-ons + customs
export function expectedPerPassenger(passenger, breakdown = {}) {
  const key = roomTypeToKey(passenger?.room_type);
  let total = key ? (breakdown[key] || 0) : (passenger?.price_paid || 0);

  // Add-ons (kalau set > 0, berlaku untuk semua peserta)
  for (const a of ADDON_KEYS) {
    if (breakdown[a.key] > 0) total += breakdown[a.key];
  }

  // Customs
  const customs = Array.isArray(breakdown._custom) ? breakdown._custom : [];
  for (const c of customs) {
    if ((c.price || 0) > 0) total += c.price;
  }

  return total;
}

// Compute income projection — Round 47: include add-ons per peserta
export function computeIncomeProjection(passengers = [], breakdown = {}) {
  const byRoom = {};
  let total = 0;
  let undefinedCount = 0;

  // Total add-ons fixed (berlaku per peserta)
  const addonTotal = ADDON_KEYS.reduce((s, a) => s + (breakdown[a.key] || 0), 0);
  const customTotal = (Array.isArray(breakdown._custom) ? breakdown._custom : []).reduce((s, c) => s + (c.price || 0), 0);
  const perPaxAddons = addonTotal + customTotal;

  for (const p of passengers) {
    const key = roomTypeToKey(p.room_type);
    if (!key) {
      undefinedCount++;
      if (p.price_paid) total += p.price_paid;
      // add-ons tetap berlaku
      total += perPaxAddons;
      continue;
    }
    const roomPrice = breakdown[key] || 0;
    const paxTotal = roomPrice + perPaxAddons;
    if (!byRoom[key]) byRoom[key] = { count: 0, price: roomPrice, subtotal: 0 };
    byRoom[key].count += 1;
    byRoom[key].subtotal += paxTotal;
    total += paxTotal;
  }

  return { byRoom, total, undefinedCount, perPaxAddons };
}

export function breakdownToList(breakdown = {}) {
  const items = [];
  for (const r of ROOM_KEYS)   items.push({ ...r, group: 'Tipe Kamar', value: breakdown[r.key] || 0 });
  for (const a of AGE_KEYS)    items.push({ ...a, group: 'Anak/Bayi',  value: breakdown[a.key] || 0 });
  for (const ad of ADDON_KEYS) items.push({ ...ad, group: 'Add-on',    value: breakdown[ad.key] || 0 });
  return items;
}

export function autoDeadlineClose(departureDate) {
  if (!departureDate) return null;
  const d = new Date(departureDate);
  d.setDate(d.getDate() - 45);
  return d.toISOString().slice(0, 10);
}

// Helper: derive milestones for payment matrix — Round 47
// Returns array of { key, label, amount, source, autoFill }
//   - Cicilan milestones (DP/P1/P2/P3/Pelunasan): dari template
//   - Add-on milestones (Visa/Tips/Asuransi/CityTax/LandTour): dari breakdown
//   - Custom milestones: dari breakdown._custom + template custom keys
export function deriveMilestones(template = {}, breakdown = {}) {
  const STANDARD = ['DP', 'P1', 'P2', 'P3', 'Pelunasan'];
  const milestones = [];

  // Standard cicilan
  for (const k of STANDARD) {
    milestones.push({
      key: k,
      label: k,
      amount: template[k] || 0,
      source: 'cicilan',
    });
  }

  // Add-ons dari breakdown
  for (const a of ADDON_KEYS) {
    const amount = template[a.label] || template[a.key] || breakdown[a.key] || 0;
    if (amount > 0) {
      milestones.push({
        key: a.label,        // pakai label sebagai key di participant_payments.type
        label: a.label,
        icon: a.icon,
        amount,
        source: 'addon',
      });
    }
  }

  // Custom items dari breakdown
  const customs = Array.isArray(breakdown._custom) ? breakdown._custom : [];
  const existingKeys = new Set([...STANDARD, ...ADDON_KEYS.map((a) => a.label)]);
  for (const c of customs) {
    if (!c.name || existingKeys.has(c.name)) continue;
    if ((c.price || 0) > 0) {
      milestones.push({
        key: c.name,
        label: c.name,
        amount: c.price,
        source: 'custom',
      });
      existingKeys.add(c.name);
    }
  }

  // Custom dari template yang belum ke-cover
  for (const k of Object.keys(template)) {
    if (existingKeys.has(k)) continue;
    if ((template[k] || 0) > 0) {
      milestones.push({
        key: k,
        label: k,
        amount: template[k],
        source: 'template_custom',
      });
    }
  }

  return milestones;
}
