// R187b + R207 + R211 + R215i + R215j: price-breakdown.js
// R211: expectedPerPassenger kurangi discount_amount peserta
// R215i: Optional addon visa/asuransi checklisted → auto-count
// R215j: SEMUA checklisted addon (visa/asuransi/custom: bus premium/snack/dll) → auto-count
//        Cara deteksi: payment type BUKAN milestone DP/P1.../Pelunasan, BUKAN main addon
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

export const MAIN_ADDONS = [
  { key: 'harga_jual_base',   label: 'Harga Jual Base',  icon: '💵' },
  { key: 'domestic_flight',   label: 'Domestik Flight',  icon: '✈' },
  { key: 'domestic_baggage',  label: 'Bagasi Domestik',  icon: '🧳' },
  { key: 'tips',              label: 'Tips',             icon: '💸' },
  { key: 'city_tax',          label: 'City Tax',         icon: '🏛' },
];

export const OPTIONAL_ADDONS = [
  { key: 'visa',      label: 'Visa',     icon: '🛂' },
  { key: 'asuransi',  label: 'Asuransi', icon: '🛡' },
];

export const ADDON_KEYS = [...MAIN_ADDONS, ...OPTIONAL_ADDONS];

// Biaya wajib yang TIDAK ditagihkan ke "Child no Bed" (anak <7th tanpa bed): tips & city tax.
// Tiket domestik, bagasi domestik, dan base TETAP ditagihkan. Infant: tanpa biaya wajib sama sekali.
export const CHILD_NOBED_EXCLUDED_ADDONS = ['tips', 'city_tax'];
export function mainAddonTotalForKey(bd, key) {
  if (!bd || typeof bd !== 'object') return 0;
  if (key === 'infant') return 0;
  const excluded = key === 'child_no_bed' ? CHILD_NOBED_EXCLUDED_ADDONS : [];
  return MAIN_ADDONS.reduce((s, a) => s + (excluded.includes(a.key) ? 0 : (Number(bd[a?.key]) || 0)), 0);
}

export const STANDARD_MILESTONES = ['DP', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'Pelunasan'];

// Kunci harga per peserta: child no bed / infant → pakai age_type (tak makan bed),
// selain itu pakai room_type.
export function paxRoomKey(p) {
  if (p?.age_type === 'child_no_bed' || p?.age_type === 'infant') return p.age_type;
  return roomTypeToKey(p?.room_type);
}

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
  const optLabels = OPTIONAL_ADDONS.map((a) => a.label);
  const optKeys = OPTIONAL_ADDONS.map((a) => a.key);
  return optLabels.includes(type) || optKeys.includes(type);
}

export function isStandardMilestone(type) {
  if (!type) return false;
  return STANDARD_MILESTONES.includes(String(type).trim());
}

export function isMainAddon(type) {
  if (!type) return false;
  const t = String(type).toLowerCase().trim();
  return MAIN_ADDONS.some((a) =>
    String(a.key).toLowerCase() === t ||
    String(a.label).toLowerCase() === t
  );
}

// R215j — Detect "checklisted addon" (bukan DP/cicilan/pelunasan, bukan main addon)
// Semua type lain dianggap optional/custom addon yg di-checklist sama finance
export function isChecklistedAddon(type) {
  if (!type) return false;
  if (isStandardMilestone(type)) return false;
  if (isMainAddon(type)) return false;
  return true;
}

export function paxHasOptionalAddon(payments, addon) {
  if (!addon || !Array.isArray(payments)) return false;
  return payments.some((p) => {
    if (!p?.type) return false;
    const t = String(p.type).toLowerCase().trim();
    return t === String(addon.key).toLowerCase() ||
           t === String(addon.label).toLowerCase();
  });
}

export function getOptionalAddonByType(type) {
  if (!type) return null;
  const t = String(type).toLowerCase().trim();
  return OPTIONAL_ADDONS.find((a) =>
    String(a.key).toLowerCase() === t ||
    String(a.label).toLowerCase() === t
  );
}

// R215j — Get expected price untuk a checklisted addon type
// Priority: breakdown[key/label] → sum of payment amounts → 0
export function getAddonExpectedPrice(type, breakdown = {}, payments = []) {
  if (!type) return 0;
  const t = String(type).trim();
  const tLower = t.toLowerCase();

  // Standard optional (visa/asuransi) — pakai breakdown[key]
  const standard = getOptionalAddonByType(t);
  if (standard) {
    return Number(breakdown[standard.key]) || 0;
  }

  // Custom — try breakdown[exact match] dulu
  const breakdownPrice = Number(breakdown[t]) ||
                         Number(breakdown[tLower]) ||
                         Number(breakdown[tLower.replace(/\s+/g, '_')]) || 0;
  if (breakdownPrice > 0) return breakdownPrice;

  // Fallback — sum payment amounts dgn type yg sama (ambil yg ada nilainya)
  const matchPayments = payments.filter((p) => p?.type === t);
  const sumPayments = matchPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  return sumPayments;
}

export function mainExpectedPerPassenger(p, breakdown = {}) {
  if (!p) return 0;
  try {
    const safeBreakdown = breakdown || {};
    const key = paxRoomKey(p);
    const basePrice = key
      ? (Number(safeBreakdown[key]) || 0)
      : (Number(p?.price_paid) || 0);
    // Infant: tanpa biaya wajib. Child no Bed: tanpa tips & city tax (tiket+bagasi domestik & base tetap).
    const mainAddonTotal = mainAddonTotalForKey(safeBreakdown, key);
    return basePrice + mainAddonTotal;
  } catch (e) {
    console.error('[mainExpectedPerPassenger err]', e?.message, 'pax_id:', p?.id);
    return 0;
  }
}

// R211 + R215j: expectedPerPassenger
// - main expected (room + main addons)
// - PLUS SEMUA checklisted addons (visa, asuransi, custom: bus premium, snack, dll)
// - MINUS discount
export function expectedPerPassenger(passenger, breakdown = {}, payments = []) {
  if (!passenger) return 0;
  try {
    const safeBreakdown = breakdown || {};
    const safePayments = Array.isArray(payments) ? payments : [];
    let total = mainExpectedPerPassenger(passenger, safeBreakdown);

    // R215j: Get UNIQUE checklisted addon types (deduplicate)
    const checklistedTypes = new Set();
    for (const p of safePayments) {
      if (!p?.type) continue;
      if (isChecklistedAddon(p.type)) {
        checklistedTypes.add(p.type);
      }
    }

    // For each unique checklisted type, add expected price
    for (const type of checklistedTypes) {
      total += getAddonExpectedPrice(type, safeBreakdown, safePayments);
    }

    // R211: kurangi diskon peserta
    const discount = Number(passenger.discount_amount) || 0;
    total = Math.max(total - discount, 0);
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

  // R215j: tracking SEMUA addon type yg ke-checklist (standard + custom)
  // optionalCountByAddon[type] = { count, price, total, label, icon, isCustom }
  const optionalCountByAddon = {};

  for (const p of safePassengers) {
    if (!p) continue;
    try {
      const key = paxRoomKey(p);
      const basePrice = key
        ? (Number(safeBreakdown[key]) || 0)
        : (Number(p?.price_paid) || 0);

      if (!key) undefinedCount++;

      const pPayments = paymentsByPax[p?.id] || [];

      // R215j: Get UNIQUE checklisted addon types untuk peserta ini
      const checklistedTypes = new Set();
      for (const py of pPayments) {
        if (!py?.type) continue;
        if (isChecklistedAddon(py.type)) {
          checklistedTypes.add(py.type);
        }
      }

      // Sum semua checklisted addon expected price
      let optionalTotal = 0;
      for (const type of checklistedTypes) {
        const addonPrice = getAddonExpectedPrice(type, safeBreakdown, pPayments);
        optionalTotal += addonPrice;

        // Update summary stats
        if (!optionalCountByAddon[type]) {
          const standard = getOptionalAddonByType(type);
          optionalCountByAddon[type] = {
            count: 0,
            price: addonPrice,
            total: 0,
            label: standard?.label || type,
            icon: standard?.icon || '⭐',
            isCustom: !standard,
            key: standard?.key || type,
          };
        }
        optionalCountByAddon[type].count += 1;
        optionalCountByAddon[type].total += addonPrice;
      }

      // R211: kurangi diskon. Infant tanpa biaya wajib.
      const discount = Number(p.discount_amount) || 0;
      const addonForThis = mainAddonTotalForKey(safeBreakdown, key);
      const paxTotal = Math.max(basePrice + addonForThis + optionalTotal - discount, 0);

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

  return { byRoom, total, undefinedCount, perPaxMain: mainAddonTotal, optionalCountByAddon };
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

export function deriveMilestones(template = {}, breakdown = {}, allPayments = []) {
  const safeTemplate = template || {};
  const safeBreakdown = breakdown || {};
  const safePayments = Array.isArray(allPayments) ? allPayments : [];

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
      existingKeys.add(k);
    }
  }

  const customFromPayments = new Set();
  for (const py of safePayments) {
    if (!py?.type) continue;
    if (existingKeys.has(py.type)) continue;
    customFromPayments.add(py.type);
  }

  for (const customType of customFromPayments) {
    milestones.push({
      key: customType,
      label: customType,
      amount: 0,
      source: 'custom',
      isOptional: true,
    });
    existingKeys.add(customType);
  }

  return milestones;
}

export function isPokokMilestone(type) {
  return STANDARD_MILESTONES.includes(type);
}

export function calcPokokPaid(payments = []) {
  return (payments || [])
    .filter((p) => isPokokMilestone(p?.type))
    .reduce((s, p) => s + (Number(p?.amount) || 0), 0);
}
