// Round 187b: price-breakdown.js — HIDE milestones dgn amount=0 dari Payment Matrix
// (kecuali DP & Pelunasan yang "wajib" — selalu tampil)
// Sebelumnya P1-P7 selalu masuk meskipun amount=0, akibatnya kolom yg user hapus tetap muncul
//
// + Tetap include R168 fix — P1-P7 ke-track sebagai cicilan harga pokok
// Path: lib/utils/price-breakdown.js

export const ROOM_KEYS = [
  { key: 'quad',          label: 'Quad Room',     icon: '🛏🛏🛏🛏' },
  { key: 'triple',        label: 'Triple Room',   icon: '🛏🛏🛏' },
  { key: 'double',        label: 'Double Room',   icon: '🛏🛏' },
  { key: 'single',        label: 'Single Room',   icon: '🛏' },
  { key: 'family',        label: 'Family Room',   icon: '👪' },
  { key: 'child_no_bed',  label: 'Child no Bed',  icon: '👶' },
  { key: 'infant',        label: 'Infant',        icon: '👶' },
  { key: 'land_tour_only',label: 'Land Tour Only',icon: '🚐' },
];

export const AGE_KEYS = [
  { key: 'child_no_bed', label: 'Child no Bed', icon: '👶' },
  { key: 'infant',       label: 'Infant',       icon: '👶' },
];

// MAIN add-ons — SELALU di-charge ke semua peserta (income wajib)
export const MAIN_ADDONS = [
  { key: 'harga_jual_base',   label: 'Harga Jual Base',  icon: '💵' },
  { key: 'domestic_flight',   label: 'Domestik Flight',  icon: '✈' },
  { key: 'domestic_baggage',  label: 'Bagasi Domestik',  icon: '🧳' },
  { key: 'tips',              label: 'Tips',             icon: '💸' },
  { key: 'city_tax',          label: 'City Tax',         icon: '🏛' },
];

// OPTIONAL add-ons — cuma masuk expected setelah peserta ✓ checklist Finance
export const OPTIONAL_ADDONS = [
  { key: 'visa',      label: 'Visa',     icon: '🛂' },
  { key: 'asuransi',  label: 'Asuransi', icon: '🛡' },
];

export const ADDON_KEYS = [...MAIN_ADDONS, ...OPTIONAL_ADDONS];

export function roomTypeToKey(roomType) {
  if (!roomType) return null;
  const t = String(roomType).toLowerCase().trim();
  if (t.includes('land_tour') || t.includes('land tour')) return 'land_tour_only';
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
  const safeBreakdown = breakdown || {};
  const optLabels = OPTIONAL_ADDONS.map((a) => a.label);
  const optKeys = OPTIONAL_ADDONS.map((a) => a.key);
  return optLabels.includes(type) || optKeys.includes(type);
}

export function mainExpectedPerPassenger(p, breakdown = {}) {
  if (!p) return 0;
  try {
    const safeBreakdown = breakdown || {};
    const key = roomTypeToKey(p?.room_type);
    const basePrice = key
      ? (Number(safeBreakdown[key]) || 0)
      : (Number(p?.price_paid) || 0);
    const mainAddonTotal = MAIN_ADDONS.reduce(
      (s, a) => s + (Number(safeBreakdown[a?.key]) || 0),
      0
    );
    return basePrice + mainAddonTotal;
  } catch (e) {
    console.error('[mainExpectedPerPassenger err]', e?.message, 'pax_id:', p?.id);
    return 0;
  }
}

// R168 RESTORE: expectedPerPassenger = harga pokok (room + main addons) + optional yang sudah di-✓
export function expectedPerPassenger(passenger, breakdown = {}, payments = []) {
  if (!passenger) return 0;
  try {
    const safeBreakdown = breakdown || {};
    const safePayments = Array.isArray(payments) ? payments : [];
    let total = mainExpectedPerPassenger(passenger, safeBreakdown);
    for (const p of safePayments) {
      if (!p || !p.amount) continue;
      if (isOptionalMilestone(p.type, safeBreakdown)) {
        total += Number(p.amount) || 0;
      }
    }
    return total;
  } catch (e) {
    console.error('[expectedPerPassenger err]', e?.message);
    return 0;
  }
}

export function computeIncomeProjection(passengers = [], breakdown = {}, allPayments = []) {
  const safeBreakdown = breakdown || {};
  const safePassengers = Array.isArray(passengers) ? passengers : [];
  const safePayments = Array.isArray(allPayments) ? allPayments : [];

  const byRoom = {};
  let total = 0;
  let undefinedCount = 0;

  const mainAddonTotal = MAIN_ADDONS.reduce(
    (s, a) => s + (Number(safeBreakdown[a?.key]) || 0),
    0
  );

  const paymentsByPax = {};
  for (const py of safePayments) {
    if (!py) continue;
    const pid = py.passenger_id;
    if (!pid) continue;
    if (!paymentsByPax[pid]) paymentsByPax[pid] = [];
    paymentsByPax[pid].push(py);
  }

  for (const p of safePassengers) {
    if (!p) continue;
    try {
      const key = roomTypeToKey(p?.room_type);
      const basePrice = key
        ? (Number(safeBreakdown[key]) || 0)
        : (Number(p?.price_paid) || 0);

      if (!key) undefinedCount++;

      const pPayments = paymentsByPax[p?.id] || [];
      const optionalPaid = pPayments
        .filter((py) => isOptionalMilestone(py?.type, safeBreakdown))
        .reduce((s, py) => s + (Number(py?.amount) || 0), 0);

      const paxTotal = basePrice + mainAddonTotal + optionalPaid;

      if (key) {
        if (!byRoom[key]) byRoom[key] = { count: 0, price: basePrice, subtotal: 0 };
        byRoom[key].count += 1;
        byRoom[key].subtotal += paxTotal;
      }

      total += paxTotal;
    } catch (e) {
      console.error('[computeIncomeProjection pax err]', e?.message, 'pax_id:', p?.id);
    }
  }

  return { byRoom, total, undefinedCount, perPaxMain: mainAddonTotal };
}

export function breakdownToList(breakdown = {}) {
  const safeBreakdown = breakdown || {};
  const items = [];
  for (const r of ROOM_KEYS)         items.push({ ...r, group: 'Base Price', value: Number(safeBreakdown[r?.key]) || 0 });
  for (const m of MAIN_ADDONS)       items.push({ ...m, group: 'Wajib',      value: Number(safeBreakdown[m?.key]) || 0 });
  for (const o of OPTIONAL_ADDONS)   items.push({ ...o, group: 'Optional',   value: Number(safeBreakdown[o?.key]) || 0 });
  return items;
}

export function autoDeadlineClose(departureDate) {
  if (!departureDate) return null;
  try {
    const d = new Date(departureDate);
    d.setDate(d.getDate() - 45);
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// ============================================================
// ROUND 187b: FIX — skip milestone amount=0 (kecuali DP + Pelunasan yg wajib)
// Sebelumnya P1-P7 selalu masuk ke list meskipun amount=0,
// akibatnya kolom P6/P7 yg user hapus dari template tetap muncul di Payment Matrix.
//
// Sekarang:
// - DP & Pelunasan: SELALU tampil (wajib, meskipun amount=0)
// - P1-P7: cuma tampil kalau amount > 0 di template
// - Visa & Asuransi: cuma tampil kalau amount > 0
// - Custom items: cuma tampil kalau amount > 0
// ============================================================
export function deriveMilestones(template = {}, breakdown = {}) {
  const safeTemplate = template || {};
  const safeBreakdown = breakdown || {};

  // R187b: STANDARD dengan flag "always" — DP & Pelunasan tampil walau 0
  const STANDARD = [
    { key: 'DP',        always: true  },
    { key: 'P1',        always: false },
    { key: 'P2',        always: false },
    { key: 'P3',        always: false },
    { key: 'P4',        always: false },
    { key: 'P5',        always: false },
    { key: 'P6',        always: false },
    { key: 'P7',        always: false },
    { key: 'Pelunasan', always: true  },
  ];

  const milestones = [];

  for (const m of STANDARD) {
    const amount = Number(safeTemplate[m.key]) || 0;
    // R187b: skip non-always milestone kalau amount <= 0
    if (!m.always && amount <= 0) continue;

    milestones.push({
      key: m.key,
      label: m.key,
      amount,
      source: 'cicilan',
      isOptional: false,
    });
  }

  for (const a of MAIN_ADDONS) {
    if (!a) continue;
    const amount = Number(safeTemplate[a.label]) || Number(safeTemplate[a.key]) || Number(safeBreakdown[a.key]) || 0;
    if (amount > 0) {
      milestones.push({
        key: a.label,
        label: a.label,
        icon: a.icon,
        amount,
        source: 'main_addon',
        isOptional: false,
      });
    }
  }

  for (const a of OPTIONAL_ADDONS) {
    if (!a) continue;
    const amount = Number(safeTemplate[a.label]) || Number(safeTemplate[a.key]) || Number(safeBreakdown[a.key]) || 0;
    if (amount > 0) {
      milestones.push({
        key: a.label,
        label: a.label,
        icon: a.icon,
        amount,
        source: 'optional_addon',
        isOptional: true,
      });
    }
  }

  const customs = Array.isArray(safeBreakdown?._custom) ? safeBreakdown._custom : [];
  const STANDARD_KEYS = STANDARD.map((m) => m.key);
  const existingKeys = new Set([...STANDARD_KEYS, ...ADDON_KEYS.map((a) => a?.label)]);
  for (const c of customs) {
    if (!c || !c.name) continue;
    if (existingKeys.has(c.name)) continue;
    if ((Number(c.price) || 0) > 0) {
      milestones.push({
        key: c.name,
        label: c.name,
        amount: Number(c.price) || 0,
        source: 'custom',
        isOptional: true,
      });
      existingKeys.add(c.name);
    }
  }

  for (const k of Object.keys(safeTemplate)) {
    if (existingKeys.has(k)) continue;
    if ((Number(safeTemplate[k]) || 0) > 0) {
      milestones.push({
        key: k,
        label: k,
        amount: Number(safeTemplate[k]) || 0,
        source: 'template_custom',
        isOptional: true,
      });
    }
  }

  return milestones;
}

// R168: helper untuk cek apakah sebuah milestone type adalah cicilan harga pokok
export function isPokokMilestone(type) {
  return ['DP', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'Pelunasan'].includes(type);
}

// R168: hitung total pembayaran cicilan harga pokok (semua DP + P1-P7 + Pelunasan)
export function calcPokokPaid(payments = []) {
  return (payments || [])
    .filter((p) => isPokokMilestone(p?.type))
    .reduce((s, p) => s + (Number(p?.amount) || 0), 0);
}
