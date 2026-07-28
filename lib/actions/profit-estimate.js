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

async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, GUARD_PATH); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}

// Daftar group/trip untuk dipilih.
export async function listProfitGroups() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, return_date, status')
    .order('departure', { ascending: false, nullsFirst: false });
  const active = (trips || []).filter((t) => !['cancelled'].includes(t.status));
  const { data: saved } = await db.from('profit_estimates').select('trip_id, updated_at');
  const savedMap = Object.fromEntries((saved || []).map((s) => [s.trip_id, s.updated_at]));
  const rows = active.map((t) => ({
    id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '',
    departureFmt: t.departure ? fmtD(t.departure) : '—',
    hasEstimate: !!savedMap[t.id], savedAt: savedMap[t.id] || null,
  }));
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

  const { data: saved } = await db.from('profit_estimates').select('*').eq('trip_id', tripId).maybeSingle();
  const savedIncome = {}; const savedCustom = [];
  for (const r of (saved?.income_rows || [])) {
    if (r && r.key && String(r.key).startsWith('custom_')) savedCustom.push(r);
    else if (r && r.key) savedIncome[r.key] = r;
  }

  // Baris income standar: harga SELALU dari master trip; pax/noted/status dari simpanan.
  const income = INCOME_KEYS.map((ik) => {
    const master = masterPrice(bd, ik.bd);
    const s = savedIncome[ik.key] || {};
    return {
      key: ik.key, label: ik.label, standard: true,
      basic_fare: master,
      pax: numOrZero(s.pax),
      status_payment: s.status_payment === true,
      noted: s.noted || '',
    };
  });
  // Baris income custom (ditambah ops manual)
  for (const s of savedCustom) {
    income.push({
      key: s.key, label: s.label || 'Item', standard: false,
      basic_fare: numOrZero(s.basic_fare), pax: numOrZero(s.pax),
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
    expense: (saved?.expense_rows || []).map((e) => ({
      category: e.category || '', component: e.component || '',
      unit_cost: numOrZero(e.unit_cost), qty: numOrZero(e.qty),
      amount: numOrZero(e.amount), noted: e.noted || '',
    })),
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
    status_payment: r.status_payment === true, noted: clean(r.noted),
  }));
  const expense_rows = (p.expense || []).map((r) => ({
    category: clean(r.category), component: clean(r.component),
    unit_cost: numOrZero(r.unit_cost), qty: numOrZero(r.qty),
    amount: numOrZero(r.amount), noted: clean(r.noted),
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
