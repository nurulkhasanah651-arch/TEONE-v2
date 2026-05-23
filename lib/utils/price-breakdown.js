// Helper price breakdown — Round 87: tambah 3 income wajib
// (Harga Jual Base, Domestik Flight, Bagasi Domestik Flight)
// BASE (harga jual dasar, per peserta): Quad/Triple/Double/Single/Family/Child/Infant/Land Tour Only
// MAIN ADDON (selalu di-charge): Harga Jual, Domestik Flight, Bagasi Domestik, Tips, City Tax
// OPTIONAL ADDON (opt-in via ✓): Visa, Asuransi, custom items

export const ROOM_KEYS = [
  { key: 'quad',           label: 'Quad Room',      icon: '🛏️🛏️🛏️🛏️' },
  { key: 'triple',         label: 'Triple Room',    icon: '🛏️🛏️🛏️' },
  { key: 'double',         label: 'Double Room',    icon: '🛏️🛏️' },
  { key: 'single',         label: 'Single Room',    icon: '🛏️' },
  { key: 'family',         label: 'Family Room',    icon: '👨‍👩‍👧' },
  { key: 'child_no_bed',   label: 'Child no Bed',   icon: '🧒' },
  { key: 'infant',         label: 'Infant',         icon: '👶' },
  { key: 'land_tour_only', label: 'Land Tour Only', icon: '🚌' },
];

export const AGE_KEYS = [
  { key: 'child_no_bed', label: 'Child no Bed', icon: '🧒' },
  { key: 'infant',       label: 'Infant',       icon: '👶' },
];

// MAIN add-ons — SELALU di-charge ke semua peserta (income wajib)
// Round 87: tambah harga_jual_base, domestic_flight, domestic_baggage
export const MAIN_ADDONS = [
  { key: 'harga_jual_base',  label: 'Harga Jual Base',    icon: '💰' },
  { key: 'domestic_flight',  label: 'Domestik Flight',    icon: '✈' },
  { key: 'domestic_baggage', label: 'Bagasi Domestik',    icon: '🧳' },
  { key: 'tips',             label: 'Tips',               icon: '💸' },
  { key: 'city_tax',         label: 'City Tax',           icon: '🏛️' },
];

// OPTIONAL add-ons — cuma masuk expected setelah peserta ✓ checklist Finance
export const OPTIONAL_ADDONS = [
  { key: 'visa',     label: 'Visa',     icon: '🛂' },
  { key: 'asuransi', label: 'Asuransi', icon: '🏥' },
];

export const ADDON_KEYS = [...MAIN_ADDONS, ...OPTIONAL_ADDONS];

export function roomTypeToKey(roomType) {
  if (!roomType) return null;
  const t = roomType.toLowerCase().trim();
  if (t.includes('land tour') || t.includes('land_tour')) return 'land_tour_only';
  if (t.includes('infant')) return 'infant';
  if (t.includes('child')) return 'child_no_bed';
  if (t.includes('quad')) return 'quad';
  if (t.includes('triple')) return 'triple';
  if (t.includes('double') || t.includes('twin')) return 'double';
  if (t.includes('single')) return 'single';
  if (t.includes('family')) return 'family';
  return null;
}

export function isOptionalMilestone(type, breakdown = {}) {
  if (!type) return false;
  const optLabels = OPTIONAL_ADDONS.map((a) => a.label);
  if (optLabels.includes(type)) return true;
  const customs = Array.isArray(breakdown._custom) ? breakdown._custom : [];
  if (customs.some((c) => c.name === type)) return true;
  return false;
}

// MAIN total per peserta (base + harga_jual + domestic_flight + domestic_baggage + tips + city_tax)
export function mainExpectedPerPassenger(passenger, breakdown = {}) {
  const key = roomTypeToKey(passenger?.room_type);
  let total = key ? (breakdown[key] || 0) : (passenger?.price_paid || 0);
  for (const a of MAIN_ADDONS) {
    if (breakdown[a.key] > 0) total += breakdown[a.key];
  }
  return total;
}

export function expectedPerPassenger(passenger, breakdown = {}, payments = []) {
  let total = mainExpectedPerPassenger(passenger, breakdown);
  for (const p of payments) {
    if (!p.amount) continue;
    if (isOptionalMilestone(p.type, breakdown)) {
      total += p.amount;
    }
  }
  return total;
}

export function computeIncomeProjection(passengers = [], breakdown = {}, allPayments = []) {
  const byRoom = {};
  let total = 0;
  let undefinedCount = 0;

  const paymentsByPax = {};
  for (const p of allPayments) {
    if (!paymentsByPax[p.passenger_id]) paymentsByPax[p.passenger_id] = [];
    paymentsByPax[p.passenger_id].push(p);
  }

  // Round 87: mainAddonTotal sekarang include harga_jual_base + domestic_flight + domestic_baggage + tips + city_tax
  const mainAddonTotal = MAIN_ADDONS.reduce((s, a) => s + (breakdown[a.key] || 0), 0);

  for (const p of passengers) {
    const key = roomTypeToKey(p.room_type);
    const basePrice = key ? (breakdown[key] || 0) : (p.price_paid || 0);
    if (!key) undefinedCount++;

    const pPayments = paymentsByPax[p.id] || [];
    const optionalPaid = pPayments
      .filter((py) => isOptionalMilestone(py.type, breakdown))
      .reduce((s, py) => s + (py.amount || 0), 0);

    const paxTotal = basePrice + mainAddonTotal + optionalPaid;

    if (key) {
      if (!byRoom[key]) byRoom[key] = { count: 0, price: basePrice, subtotal: 0 };
      byRoom[key].count += 1;
      byRoom[key].subtotal += paxTotal;
    }
    total += paxTotal;
  }

  return { byRoom, total, undefinedCount, perPaxMain: mainAddonTotal };
}

export function breakdownToList(breakdown = {}) {
  const items = [];
  for (const r of ROOM_KEYS)       items.push({ ...r, group: 'Base Price', value: breakdown[r.key] || 0 });
  for (const m of MAIN_ADDONS)     items.push({ ...m, group: 'Wajib',      value: breakdown[m.key] || 0 });
  for (const o of OPTIONAL_ADDONS) items.push({ ...o, group: 'Optional',   value: breakdown[o.key] || 0 });
  return items;
}

export function autoDeadlineClose(departureDate) {
  if (!departureDate) return null;
  const d = new Date(departureDate);
  d.setDate(d.getDate() - 45);
  return d.toISOString().slice(0, 10);
}

export function deriveMilestones(template = {}, breakdown = {}) {
  const STANDARD = ['DP', 'P1', 'P2', 'P3', 'Pelunasan'];
  const milestones = [];

  for (const k of STANDARD) {
    milestones.push({ key: k, label: k, amount: template[k] || 0, source: 'cicilan', isOptional: false });
  }

  for (const a of MAIN_ADDONS) {
    const amount = template[a.label] || template[a.key] || breakdown[a.key] || 0;
    if (amount > 0) {
      milestones.push({ key: a.label, label: a.label, icon: a.icon, amount, source: 'main_addon', isOptional: false });
    }
  }

  for (const a of OPTIONAL_ADDONS) {
    const amount = template[a.label] || template[a.key] || breakdown[a.key] || 0;
    if (amount > 0) {
      milestones.push({ key: a.label, label: a.label, icon: a.icon, amount, source: 'optional_addon', isOptional: true });
    }
  }

  const customs = Array.isArray(breakdown._custom) ? breakdown._custom : [];
  const existingKeys = new Set([...STANDARD, ...ADDON_KEYS.map((a) => a.label)]);
  for (const c of customs) {
    if (!c.name || existingKeys.has(c.name)) continue;
    if ((c.price || 0) > 0) {
      milestones.push({ key: c.name, label: c.name, amount: c.price, source: 'custom', isOptional: true });
      existingKeys.add(c.name);
    }
  }

  for (const k of Object.keys(template)) {
    if (existingKeys.has(k)) continue;
    if ((template[k] || 0) > 0) {
      milestones.push({ key: k, label: k, amount: template[k], source: 'template_custom', isOptional: true });
    }
  }

  return milestones;
}
