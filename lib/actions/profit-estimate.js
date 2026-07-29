'use server';

// Estimate Profit Group (Operasional) — quotation profit per group/trip.
// Harga jual (income) OTOMATIS dari price_breakdown Master Trip; ops mengisi jumlah pax
// & item/biaya vendor (expense). Total income - expense = margin. Path: lib/actions/profit-estimate.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

const GUARD_PATH = '/operasional/profit-estimate';
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Komponen INCOME (harga jual) yang ditarik dari master trip price_breakdown.
const INCOME_KEYS = [
  { key: 'quad', label: 'Quad', bd: ['quad'] },
  { key: 'triple', label: 'Triple', bd: ['triple'] },
  { key: 'double', label: 'Double / Twin', bd: ['double'] },
  { key: 'single', label: 'Single', bd: ['single'] },
  { key: 'child_no_bed', label: 'Child No Bed', bd: ['child_no_bed'] },
  { key: 'infant', label: 'Infant', bd: ['infant'] },
  { key: 'land_tour', label: 'Landtour', bd: ['land_tour_only', 'land_tour_double'] },
  { key: 'tips', label: 'Tipping Guide', bd: ['tips'] },
  { key: 'visa', label: 'Visa', bd: ['visa'] },
  { key: 'asuransi', label: 'Asuransi', bd: ['asuransi'] },
];

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const numOrZero = (v) => { if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const clean = (v) => { const s = (v == null ? '' : String(v)).trim(); return s || null; };
function fmtD(d) { if (!d) return ''; const x = new Date(d); if (isNaN(x)) return ''; return `${x.getDate()} ${MONTHS_ID[x.getMonth()]} ${x.getFullYear()}`; }
function masterPrice(bd, keys) { for (const k of keys) { const v = Number(bd?.[k]) || 0; if (v > 0) return v; } return 0; }

// Normalisasi room_type peserta (data lama beragam: "Double Room", "double", "twin", dll)
function normRoom(rt) {
  const s = String(rt || '').toLowerCase();
  if (s.includes('land')) return 'land_tour';
  if (s.includes('quad')) return 'quad';
  if (s.includes('triple')) return 'triple';
  if (s.includes('single')) return 'single';
  if (s.includes('child')) return 'child_no_bed';
  if (s.includes('infant')) return 'infant';
  if (s.includes('double') || s.includes('twin')) return 'double';
  return 'double';
}

// Item HPP/expense siap-pakai (template) — ops tinggal add. qty_source = dari mana QTY
// otomatis diambil (headcount = total pax, visa = pax include visa, dst).
const EXPENSE_TEMPLATES = [
  { category: 'International Flight', qty_source: 'headcount' },
  { category: 'Domestic Flight', qty_source: 'headcount' },
  { category: 'Landtour', qty_source: 'headcount' },
  { category: 'Handling', qty_source: 'headcount' },
  { category: 'Visa', qty_source: 'visa' },
  { category: 'Asuransi', qty_source: 'asuransi' },
  { category: 'Tipping Driver', qty_source: 'tipping' },
  { category: 'Tour Leader', qty_source: null },
  { category: 'Fee Mitra', qty_source: null },
  { category: 'Cancellation Fee', qty_source: null },
];
const HOTEL_ROOMS = [
  { room: 'quad', label: 'Hotel Quad', qty_source: 'quad' },
  { room: 'triple', label: 'Hotel Triple', qty_source: 'triple' },
  { room: 'double', label: 'Hotel Double', qty_source: 'double' },
  { room: 'single', label: 'Hotel Single', qty_source: 'single' },
];

function normalizeExpense(e) {
  if (e && e.type === 'hotel') {
    return {
      type: 'hotel', city: e.city || '', noted: e.noted || '', kurs: numOrZero(e.kurs), currency: e.currency || '',
      rooms: (Array.isArray(e.rooms) ? e.rooms : HOTEL_ROOMS).map((r) => ({
        room: r.room || '', label: r.label || 'Hotel', unit_cost: numOrZero(r.unit_cost), qty: numOrZero(r.qty),
        qty_source: r.qty_source || null, qty_locked: r.qty_locked === true, nights: numOrZero(r.nights) || 1,
      })),
    };
  }
  return {
    type: 'item', category: e?.category || '', component: e?.component || '',
    unit_cost: numOrZero(e?.unit_cost), kurs: numOrZero(e?.kurs), currency: e?.currency || '',
    qty: numOrZero(e?.qty), noted: e?.noted || '',
    qty_source: e?.qty_source || null, qty_locked: e?.qty_locked === true,
  };
}
// Kurs efektif: kalau kosong/0 → 1 (berarti harga sudah Rupiah).
function kursOf(v) { const n = numOrZero(v); return n > 0 ? n : 1; }

async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, GUARD_PATH); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}

// Hitung jumlah pax per kategori dari peserta booking.
function countPax(paxRows) {
  const cnt = { quad: 0, triple: 0, double: 0, single: 0, child_no_bed: 0, infant: 0, land_tour: 0 };
  let head = 0, visa = 0, asr = 0;
  for (const p of (paxRows || [])) {
    const k = normRoom(p.room_type);
    if (cnt[k] != null) { cnt[k]++; head++; }
    if (p.include_visa === true) visa++;
    if (p.include_asuransi === true) asr++;
  }
  return { ...cnt, tips: head, visa, asuransi: asr, headcount: head };
}
function occFromKeyLabel(room, label) {
  const s = String(room || label || '').toLowerCase();
  if (s.includes('quad')) return 4; if (s.includes('triple')) return 3;
  if (s.includes('double') || s.includes('twin')) return 2; if (s.includes('single')) return 1; return 1;
}
// Total income/expense/margin dari sebuah estimate tersimpan (mirror logika editor).
function estimateTotals(bd, saved, paxBy) {
  const savedIncome = {}; const savedCustom = [];
  for (const r of (saved?.income_rows || [])) {
    if (r && r.key && String(r.key).startsWith('custom_')) savedCustom.push(r);
    else if (r && r.key) savedIncome[r.key] = r;
  }
  let totalIncome = 0;
  for (const ik of INCOME_KEYS) {
    const fare = masterPrice(bd, ik.bd); const s = savedIncome[ik.key] || {};
    const pax = s.pax_override === true ? numOrZero(s.pax) : (paxBy[ik.key] || 0);
    totalIncome += fare * pax;
  }
  for (const s of savedCustom) totalIncome += numOrZero(s.basic_fare) * numOrZero(s.pax);

  const qsrc = {
    headcount: paxBy.headcount, visa: paxBy.visa, asuransi: paxBy.asuransi, tipping: paxBy.tips,
    quad: paxBy.quad, triple: paxBy.triple, double: paxBy.double, single: paxBy.single,
    child_no_bed: paxBy.child_no_bed, infant: paxBy.infant, land_tour: paxBy.land_tour,
  };
  const effQty = (r) => (r.qty_source && r.qty_locked !== true ? (Number(qsrc[r.qty_source]) || 0) : numOrZero(r.qty));
  let totalExpense = 0;
  for (const e of (saved?.expense_rows || [])) {
    if (e?.type === 'hotel') {
      const k = kursOf(e.kurs);
      for (const h of (e.rooms || [])) totalExpense += (numOrZero(h.unit_cost) * k / occFromKeyLabel(h.room, h.label)) * effQty(h) * (numOrZero(h.nights) || 1);
    } else {
      totalExpense += numOrZero(e.unit_cost) * kursOf(e.kurs) * effQty(e);
    }
  }
  return { totalIncome, totalExpense, margin: totalIncome - totalExpense, headcount: paxBy.headcount };
}

// Daftar group/trip untuk dipilih — dikelompokkan per bulan + profit per trip.
export async function listProfitGroups() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, return_date, status, price_breakdown')
    .order('departure', { ascending: false, nullsFirst: false });
  const active = (trips || []).filter((t) => !['cancelled'].includes(t.status));
  const { data: saved } = await db.from('profit_estimates').select('*');
  const savedByTrip = Object.fromEntries((saved || []).map((s) => [s.trip_id, s]));

  // Ambil SEMUA peserta (paginasi) supaya income tiap trip bisa dihitung LIVE — profit
  // langsung muncul walau estimate belum disimpan. Expense diambil dari yang tersimpan (0 jika belum).
  const paxByTrip = {};
  try {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('trip_passengers')
        .select('trip_id, room_type, include_visa, include_asuransi').order('id', { ascending: true }).range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const p of data) { (paxByTrip[p.trip_id] = paxByTrip[p.trip_id] || []).push(p); }
      if (data.length < 1000) break;
    }
  } catch {}

  const rows = active.map((t) => {
    const s = savedByTrip[t.id];
    const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
    const tot = estimateTotals(bd, s || null, countPax(paxByTrip[t.id]));
    const hasExpense = !!(s && Array.isArray(s.expense_rows) && s.expense_rows.length > 0);
    let monthKey = '9999', monthLabel = 'Tanpa Tanggal';
    if (t.departure) { const d = new Date(t.departure); monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; monthLabel = `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`; }
    return {
      id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '',
      departureFmt: t.departure ? fmtD(t.departure) : '—', monthKey, monthLabel,
      hasEstimate: !!s, hasExpense, savedAt: s?.updated_at || null,
      profit: tot.margin, income: tot.totalIncome, expense: tot.totalExpense,
    };
  });
  return { ok: true, rows };
}

// Ambil estimate untuk 1 group/trip (prefill harga dari master trip).
export async function getProfitEstimate(tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!tripId) return { error: 'Trip tidak valid' };

  const { data: t } = await db.from('trips')
    .select('id, kode_trip, name, departure, return_date, price_breakdown, visa_country')
    .eq('id', tripId).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };
  const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};

  // Hitung PAX otomatis dari peserta yang sudah booking di Master Trip.
  const { data: pax } = await db.from('trip_passengers')
    .select('room_type, include_visa, include_asuransi').eq('trip_id', tripId).range(0, 4999);
  const cnt = { quad: 0, triple: 0, double: 0, single: 0, child_no_bed: 0, infant: 0, land_tour: 0 };
  let head = 0, visaCnt = 0, asrCnt = 0;
  for (const p of (pax || [])) {
    const k = normRoom(p.room_type);
    if (cnt[k] != null) { cnt[k]++; head++; }
    if (p.include_visa === true) visaCnt++;
    if (p.include_asuransi === true) asrCnt++;
  }
  const paxMasterBy = { ...cnt, tips: head, visa: visaCnt, asuransi: asrCnt };

  const { data: saved } = await db.from('profit_estimates').select('*').eq('trip_id', tripId).maybeSingle();
  const savedIncome = {}; const savedCustom = [];
  for (const r of (saved?.income_rows || [])) {
    if (r && r.key && String(r.key).startsWith('custom_')) savedCustom.push(r);
    else if (r && r.key) savedIncome[r.key] = r;
  }

  // Baris income standar: harga & pax OTOMATIS dari master trip. Kalau ops pernah override
  // pax (pax_override), pakai nilai simpanan; kalau tidak, ikut jumlah booking terbaru.
  const income = INCOME_KEYS.map((ik) => {
    const master = masterPrice(bd, ik.bd);
    const s = savedIncome[ik.key] || {};
    const paxMaster = paxMasterBy[ik.key] || 0;
    return {
      key: ik.key, label: ik.label, standard: true,
      basic_fare: master,
      pax_master: paxMaster,
      pax_override: s.pax_override === true,
      pax: s.pax_override === true ? numOrZero(s.pax) : paxMaster,
      status_payment: s.status_payment === true,
      noted: s.noted || '',
    };
  });
  // Baris income custom (ditambah ops manual)
  for (const s of savedCustom) {
    income.push({
      key: s.key, label: s.label || 'Item', standard: false,
      basic_fare: numOrZero(s.basic_fare), pax_master: 0, pax_override: true, pax: numOrZero(s.pax),
      status_payment: s.status_payment === true, noted: s.noted || '',
    });
  }

  const periodeDefault = (t.departure || t.return_date)
    ? `${fmtD(t.departure)}${t.return_date ? ' - ' + fmtD(t.return_date) : ''}` : '';

  return {
    ok: true,
    trip: { id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '', country: t.visa_country || '' },
    meta: {
      rate_kurs: saved?.rate_kurs != null ? Number(saved.rate_kurs) : 0,
      periode: saved?.periode || periodeDefault,
      noted: saved?.noted || '',
    },
    income,
    expense: (saved?.expense_rows || []).map(normalizeExpense),
    templates: EXPENSE_TEMPLATES,
    hotelRooms: HOTEL_ROOMS,
    savedAt: saved?.updated_at || null,
  };
}

export async function saveProfitEstimate(tripId, payload) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!tripId) return { error: 'Trip tidak valid' };
  const p = payload || {};

  const income_rows = (p.income || []).map((r) => ({
    key: r.key, label: clean(r.label) || 'Item', standard: r.standard === true,
    basic_fare: numOrZero(r.basic_fare), pax: numOrZero(r.pax),
    pax_override: r.standard ? (r.pax_override === true) : true,
    status_payment: r.status_payment === true, noted: clean(r.noted),
  }));
  const expense_rows = (p.expense || []).map((r) => (r?.type === 'hotel'
    ? {
      type: 'hotel', city: clean(r.city), noted: clean(r.noted), kurs: numOrZero(r.kurs), currency: clean(r.currency),
      rooms: (Array.isArray(r.rooms) ? r.rooms : []).map((h) => ({
        room: h.room || '', label: clean(h.label) || 'Hotel', unit_cost: numOrZero(h.unit_cost), qty: numOrZero(h.qty),
        qty_source: h.qty_source || null, qty_locked: h.qty_locked === true, nights: numOrZero(h.nights) || 1,
      })),
    }
    : {
      type: 'item', category: clean(r.category), component: clean(r.component),
      unit_cost: numOrZero(r.unit_cost), kurs: numOrZero(r.kurs), currency: clean(r.currency),
      qty: numOrZero(r.qty), noted: clean(r.noted),
      qty_source: r.qty_source || null, qty_locked: r.qty_locked === true,
    }));

  const row = {
    trip_id: tripId,
    rate_kurs: numOrZero(p.rate_kurs),
    periode: clean(p.periode),
    noted: clean(p.noted),
    income_rows, expense_rows,
    updated_at: new Date().toISOString(),
    created_by: user.email || 'staff',
  };
  const { error } = await db.from('profit_estimates').upsert(row, { onConflict: 'trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/operasional/profit-estimate');
  return { ok: true };
}
