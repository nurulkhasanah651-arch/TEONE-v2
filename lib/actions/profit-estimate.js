'use server';

// Estimate Profit Group (Operasional) — quotation profit per group/trip.
// Harga jual (income) OTOMATIS dari price_breakdown Master Trip; ops mengisi jumlah pax
// & item/biaya vendor (expense). Total income - expense = margin. Path: lib/actions/profit-estimate.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { getBrandCode } from '@/lib/brand';
import { customerSiteUrlFor } from '@/lib/brand-shared';

const REVIEW_ROLES = ['owner', 'manager', 'accounting'];

const GUARD_PATH = '/operasional/profit-estimate';
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const PROFIT_HEADCOUNT_KEYS = ['quad', 'triple', 'double', 'single', 'child_no_bed', 'infant', 'land_tour'];

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
  { key: 'city_tax', label: 'City Tax', bd: ['city_tax'] },
  { key: 'visa', label: 'Visa', bd: ['visa'] },
  { key: 'asuransi', label: 'Asuransi', bd: ['asuransi'] },
  // Komponen tambahan — hanya tampil di income kalau diisi di master trip (harga > 0).
  { key: 'domestic_flight', label: 'Tiket Domestik', bd: ['domestic_flight'], optional: true },
  { key: 'domestic_baggage', label: 'Bagasi Domestik', bd: ['domestic_baggage'], optional: true },
  { key: 'perlengkapan', label: 'Perlengkapan', bd: ['perlengkapan'], optional: true },
  { key: 'harga_jual_base', label: 'Base', bd: ['harga_jual_base'], optional: true },
];

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const numOrZero = (v) => { if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const clean = (v) => { const s = (v == null ? '' : String(v)).trim(); return s || null; };
function fmtD(d) { if (!d) return ''; const x = new Date(d); if (isNaN(x)) return ''; return `${x.getDate()} ${MONTHS_ID[x.getMonth()]} ${x.getFullYear()}`; }
function fmtDT(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`; }
// Peta email -> nama karyawan (untuk tampilkan "diperbarui oleh <nama>").
async function nameMap(db) {
  const map = {};
  try { const { data } = await db.from('employees').select('email, full_name, nickname'); for (const e of (data || [])) { if (e.email) map[String(e.email).toLowerCase()] = e.nickname || e.full_name || e.email; } } catch {}
  return map;
}
function displayBy(map, email) { if (!email) return ''; return map[String(email).toLowerCase()] || email; }
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

// Peserta AKTIF (bukan yang sudah pindah trip / refund) — supaya pax income selalu
// sesuai master trip terkini.
function isActivePax(p) {
  return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}
// Tandai peserta yang sudah BAYAR visa / asuransi (peserta lama yg diinput lewat pembayaran).
async function annotatePaidVA(db, paxRows) {
  const rows = paxRows || [];
  const ids = rows.map((p) => p.id).filter((x) => x != null);
  if (!ids.length) return rows;
  const paidV = new Set(); const paidA = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from('participant_payments')
      .select('passenger_id, amount, is_transferred, type').in('type', ['Visa', 'Asuransi']).in('passenger_id', ids.slice(i, i + 500));
    for (const r of (data || [])) {
      if (r.is_transferred === true || !(Number(r.amount) > 0)) continue;
      if (r.type === 'Visa') paidV.add(r.passenger_id); else if (r.type === 'Asuransi') paidA.add(r.passenger_id);
    }
  }
  for (const p of rows) { p._paid_visa = paidV.has(p.id); p._paid_asuransi = paidA.has(p.id); }
  return rows;
}

// Hitung jumlah pax per kategori dari peserta booking AKTIF.
function countPax(paxRows) {
  const cnt = { quad: 0, triple: 0, double: 0, single: 0, child_no_bed: 0, infant: 0, land_tour: 0 };
  let head = 0, visa = 0, asr = 0;
  for (const p of (paxRows || [])) {
    const active = isActivePax(p);
    // Kamar/headcount/tips/city tax: HANYA peserta aktif.
    if (active) {
      const k = normRoom(p.room_type);
      if (cnt[k] != null) { cnt[k]++; head++; }
    }
    // Visa/asuransi: peserta AKTIF (checkbox ON atau sudah bayar) ATAU peserta refund/pindah
    // yang SUDAH BAYAR (biaya visa/asuransi sudah keluar & non-refundable -> income tetap real).
    if ((active && (p.include_visa === true || p._paid_visa === true)) || (!active && p._paid_visa === true)) visa++;
    if ((active && (p.include_asuransi === true || p._paid_asuransi === true)) || (!active && p._paid_asuransi === true)) asr++;
  }
  // City tax ditagih ke semua pax KECUALI infant & child-no-bed. Tiket/bagasi domestik,
  // perlengkapan, base: bebas infant saja (child no bed tetap ditagih). Tipping: semua pax.
  const billable = Math.max(head - cnt.infant - cnt.child_no_bed, 0);
  const exInfant = Math.max(head - cnt.infant, 0);
  return {
    ...cnt, tips: head, city_tax: billable,
    domestic_flight: exInfant, domestic_baggage: exInfant, perlengkapan: exInfant, harga_jual_base: exInfant,
    visa, asuransi: asr, headcount: head,
  };
}
function occFromKeyLabel(room, label) {
  const s = String(room || label || '').toLowerCase();
  if (s.includes('quad')) return 4; if (s.includes('triple')) return 3;
  if (s.includes('double') || s.includes('twin')) return 2; if (s.includes('single')) return 1; return 1;
}

// Penyesuaian OTOMATIS per trip (bukan input manual):
//  - visaByTrip  : total biaya visa yang sudah diisi di Payment Visa (net fee − refund) → HPP estimate.
//  - hangusByTrip: total admin_fee dari refund approved (dana hangus) → income tambahan estimate.
async function fetchAutoAdjust(db, tripIds) {
  const visaByTrip = {}; const hangusByTrip = {}; const ppnByTrip = {};
  // PPN paket tour (Khasanah) yang SUDAH DIBAYAR → income tambahan.
  try {
    const { computePpnByGroup } = await import('@/lib/shop/ppn-group');
    const ppnMap = await computePpnByGroup(db, tripIds && tripIds.length ? tripIds : null);
    for (const [tid, v] of Object.entries(ppnMap || {})) ppnByTrip[tid] = Number(v.ppnCollected) || 0;
  } catch {}
  const idset = (tripIds && tripIds.length) ? new Set(tripIds.map(String)) : null;
  try {
    const { data } = await db.from('visa_apply_payments')
      .select('trip_id, fee_embassy_amount, fee_tls_amount, fee_asuransi_amount, refund_amount, refund_asuransi_amount');
    for (const r of (data || [])) {
      const tid = r.trip_id; if (!tid || (idset && !idset.has(String(tid)))) continue;
      const net = (Number(r.fee_embassy_amount) || 0) + (Number(r.fee_tls_amount) || 0) + (Number(r.fee_asuransi_amount) || 0)
        - (Number(r.refund_amount) || 0) - (Number(r.refund_asuransi_amount) || 0);
      if (net > 0) visaByTrip[tid] = (visaByTrip[tid] || 0) + net;
    }
  } catch {}
  try {
    const { data } = await db.from('refunds').select('trip_id, admin_fee, status').eq('status', 'approved');
    for (const r of (data || [])) {
      const tid = r.trip_id; if (!tid || (idset && !idset.has(String(tid)))) continue;
      const fee = Number(r.admin_fee) || 0; if (fee > 0) hangusByTrip[tid] = (hangusByTrip[tid] || 0) + fee;
    }
  } catch {}
  return { visaByTrip, hangusByTrip, ppnByTrip };
}

// Total income/expense/margin dari sebuah estimate tersimpan (mirror logika editor).
// auto = { visa, hangus } → penyesuaian otomatis (biaya visa masuk HPP, dana hangus masuk income).
function estimateTotals(bd, saved, paxBy, auto) {
  const savedIncome = {}; const savedCustom = [];
  for (const r of (saved?.income_rows || [])) {
    if (r && r.key && String(r.key).startsWith('custom_')) savedCustom.push(r);
    else if (r && r.key) savedIncome[r.key] = r;
  }
  let totalIncome = 0;
  const resolved = {}; // pax EFEKTIF per komponen (hormati override) — dipakai income & qty expense auto
  for (const ik of INCOME_KEYS) {
    const fare = masterPrice(bd, ik.bd); const s = savedIncome[ik.key] || {};
    const pax = s.pax_override === true ? numOrZero(s.pax) : (paxBy[ik.key] || 0);
    resolved[ik.key] = pax;
    totalIncome += fare * pax;
  }
  for (const s of savedCustom) totalIncome += numOrZero(s.basic_fare) * numOrZero(s.pax);

  // qty_source expense HARUS pakai pax income efektif (sama dgn editor detail), bukan pax live mentah.
  const headcountResolved = PROFIT_HEADCOUNT_KEYS.reduce((a, k) => a + (resolved[k] || 0), 0);
  const qsrc = {
    headcount: headcountResolved, visa: resolved.visa || 0, asuransi: resolved.asuransi || 0, tipping: resolved.tips || 0,
    quad: resolved.quad || 0, triple: resolved.triple || 0, double: resolved.double || 0, single: resolved.single || 0,
    child_no_bed: resolved.child_no_bed || 0, infant: resolved.infant || 0, land_tour: resolved.land_tour || 0,
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
  // Penyesuaian otomatis: dana hangus → income, biaya visa (Payment Visa) → HPP/expense.
  totalIncome += numOrZero(auto?.hangus);
  totalIncome += numOrZero(auto?.ppn); // PPN paket tour yang sudah dibayar → income
  totalExpense += numOrZero(auto?.visa);
  return { totalIncome, totalExpense, margin: totalIncome - totalExpense, headcount: headcountResolved };
}

// Daftar group/trip untuk dipilih — dikelompokkan per bulan + profit per trip.
export async function listProfitGroups() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, slug, departure, return_date, status, price_breakdown, offering_vendor_requested_at')
    .order('departure', { ascending: true, nullsFirst: false });
  const active = (trips || []).filter((t) => !['cancelled'].includes(t.status));
  let brandCode = 'teone'; try { brandCode = getBrandCode(); } catch {}
  const domain = customerSiteUrlFor(brandCode).replace(/\/$/, '');
  const { data: saved } = await db.from('profit_estimates').select('*');
  const savedByTrip = Object.fromEntries((saved || []).map((s) => [s.trip_id, s]));

  // Ambil SEMUA peserta (paginasi) supaya income tiap trip bisa dihitung LIVE — profit
  // langsung muncul walau estimate belum disimpan. Expense diambil dari yang tersimpan (0 jika belum).
  const paxByTrip = {}; let allPaxRows = [];
  try {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('trip_passengers')
        .select('id, trip_id, room_type, include_visa, include_asuransi, transfer_status, refund_status').order('id', { ascending: true }).range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const p of data) { (paxByTrip[p.trip_id] = paxByTrip[p.trip_id] || []).push(p); allPaxRows.push(p); }
      if (data.length < 1000) break;
    }
    await annotatePaidVA(db, allPaxRows); // tandai peserta yg sudah bayar visa/asuransi (object refs sama)
  } catch {}

  const { visaByTrip, hangusByTrip, ppnByTrip } = await fetchAutoAdjust(db, active.map((t) => t.id));
  const names = await nameMap(db);
  let _role = ''; try { _role = await resolveAuthoritativeRole(g.user); } catch {}
  const canReview = REVIEW_ROLES.includes(_role);
  const rows = active.map((t) => {
    const s = savedByTrip[t.id];
    const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
    const _auto = { visa: visaByTrip[t.id] || 0, hangus: hangusByTrip[t.id] || 0, ppn: ppnByTrip[t.id] || 0 };
    const _paxBy = countPax(paxByTrip[t.id]);
    const tot = estimateTotals(bd, s || null, _paxBy, _auto);
    const hasExpense = !!(s && Array.isArray(s.expense_rows) && s.expense_rows.length > 0);
    // Perbandingan vendor (kalau ada > 1) — margin per vendor, income sama.
    let vendorMargins = [];
    if (s && Array.isArray(s.vendors) && s.vendors.length > 1) {
      vendorMargins = s.vendors.map((v, i) => {
        const vt = estimateTotals(bd, { income_rows: s.income_rows, expense_rows: Array.isArray(v.expense) ? v.expense : [] }, _paxBy, _auto);
        return { name: v.name || `Vendor ${i + 1}`, margin: vt.margin, expense: vt.totalExpense };
      });
    }
    let monthKey = '9999', monthLabel = 'Tanpa Tanggal';
    if (t.departure) { const d = new Date(t.departure); monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; monthLabel = `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`; }
    return {
      id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '',
      departure: t.departure || null,
      departureFmt: t.departure ? fmtD(t.departure) : '—', monthKey, monthLabel,
      hasEstimate: !!s, hasExpense, savedAt: s?.updated_at || null,
      savedAtFmt: s?.updated_at ? fmtDT(s.updated_at) : null, savedBy: s ? displayBy(names, s.created_by) : null,
      profit: tot.margin, income: tot.totalIncome, expense: tot.totalExpense,
      vendors: vendorMargins,
      offeringRequested: !!t.offering_vendor_requested_at,
      offeringAt: t.offering_vendor_requested_at || null,
      ownerNote: s?.owner_note || '', ownerApproval: s?.owner_approval || '',
      reviewBy: s?.owner_review_by ? displayBy(names, s.owner_review_by) : '',
      reviewAtFmt: s?.owner_review_at ? fmtDT(s.owner_review_at) : '',
      webUrl: `${domain}/trip/${t.slug || t.id}`,
    };
  });
  return { ok: true, rows, canReview };
}

// Catatan/approval OWNER untuk sebuah trip (tampil di kartu Estimate Profit).
// Hanya owner/manager/accounting. approval: 'approved' | 'revisi' | 'hold' | '' (kosong = cabut).
export async function setOwnerReview(tripId, note, approval) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!tripId) return { error: 'Trip tidak valid' };
  let role = ''; try { role = await resolveAuthoritativeRole(user); } catch {}
  if (!REVIEW_ROLES.includes(role)) return { error: 'Hanya owner/manager/accounting yang bisa memberi catatan/approval.' };
  const _appr = ['approved', 'revisi', 'hold'].includes(String(approval || '')) ? approval : null;
  const row = {
    trip_id: tripId, owner_note: clean(note), owner_approval: _appr,
    owner_review_by: user.email || 'staff', owner_review_at: new Date().toISOString(),
  };
  const { error } = await db.from('profit_estimates').upsert(row, { onConflict: 'trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/operasional/profit-estimate');
  return { ok: true };
}

// Tandai/​batalkan "sudah minta offering vendor" untuk sebuah trip.
export async function setOfferingVendor(tripId, requested) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!tripId) return { error: 'Trip tidak valid' };
  const upd = requested
    ? { offering_vendor_requested_at: new Date().toISOString(), offering_vendor_requested_by: user.email || 'staff' }
    : { offering_vendor_requested_at: null, offering_vendor_requested_by: null };
  const { error } = await db.from('trips').update(upd).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath('/operasional/profit-estimate');
  return { ok: true };
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

  // Hitung PAX otomatis dari peserta AKTIF di Master Trip (exclude refund & pindah trip).
  const { data: pax } = await db.from('trip_passengers')
    .select('id, room_type, include_visa, include_asuransi, transfer_status, refund_status').eq('trip_id', tripId).range(0, 4999);
  await annotatePaidVA(db, pax || []);
  const paxMasterBy = countPax(pax);

  const { data: saved } = await db.from('profit_estimates').select('*').eq('trip_id', tripId).maybeSingle();
  const savedIncome = {}; const savedCustom = [];
  for (const r of (saved?.income_rows || [])) {
    if (r && r.key && String(r.key).startsWith('custom_')) savedCustom.push(r);
    else if (r && r.key) savedIncome[r.key] = r;
  }

  // Baris income standar: harga & pax OTOMATIS dari master trip. Kalau ops pernah override
  // pax (pax_override), pakai nilai simpanan; kalau tidak, ikut jumlah booking terbaru.
  const income = INCOME_KEYS
    .filter((ik) => !ik.optional || masterPrice(bd, ik.bd) > 0) // komponen tambahan hanya tampil kalau diisi
    .map((ik) => {
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

  // Penyesuaian otomatis (read-only, tidak ikut tersimpan — selalu dihitung ulang dari data terkini).
  const { visaByTrip, hangusByTrip, ppnByTrip } = await fetchAutoAdjust(db, [tripId]);
  const autoVisa = visaByTrip[tripId] || 0;
  const autoHangus = hangusByTrip[tripId] || 0;
  const autoPpn = ppnByTrip[tripId] || 0;

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
    // Vendor perbandingan: dari kolom vendors (kalau ada), else 1 vendor dari expense_rows.
    vendors: (Array.isArray(saved?.vendors) && saved.vendors.length)
      ? saved.vendors.map((v, i) => ({ name: (v?.name || `Vendor ${i + 1}`), expense: (Array.isArray(v?.expense) ? v.expense : []).map(normalizeExpense) }))
      : [{ name: 'Vendor 1', expense: (saved?.expense_rows || []).map(normalizeExpense) }],
    autoIncome: [
      ...(autoHangus > 0 ? [{ key: 'auto_hangus', label: 'Dana Hangus (refund/cancel)', amount: autoHangus }] : []),
      ...(autoPpn > 0 ? [{ key: 'auto_ppn', label: 'PPN Paket Tour (sudah dibayar)', amount: autoPpn }] : []),
    ],
    autoExpense: autoVisa > 0 ? [{ key: 'auto_visa', label: 'Visa (dari Payment Visa)', category: 'Visa', amount: autoVisa }] : [],
    templates: EXPENSE_TEMPLATES,
    hotelRooms: HOTEL_ROOMS,
    savedAt: saved?.updated_at || null,
    savedAtFmt: saved?.updated_at ? fmtDT(saved.updated_at) : null,
    savedBy: saved ? displayBy(await nameMap(db), saved.created_by) : null,
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
  const mapExpense = (rows) => (Array.isArray(rows) ? rows : []).map((r) => (r?.type === 'hotel'
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

  // Vendor perbandingan. Vendor #1 = utama → expense_rows (dipakai Proyeksi/Accounting).
  const _vin = (Array.isArray(p.vendors) && p.vendors.length) ? p.vendors : [{ name: 'Vendor 1', expense: p.expense || [] }];
  const vendors = _vin.map((v, i) => ({ name: (clean(v?.name) || `Vendor ${i + 1}`), expense: mapExpense(v?.expense) }));
  const expense_rows = vendors[0].expense;

  const row = {
    trip_id: tripId,
    rate_kurs: numOrZero(p.rate_kurs),
    periode: clean(p.periode),
    noted: clean(p.noted),
    income_rows, expense_rows, vendors,
    updated_at: new Date().toISOString(),
    created_by: user.email || 'staff',
  };
  const { error } = await db.from('profit_estimates').upsert(row, { onConflict: 'trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/operasional/profit-estimate');
  return { ok: true };
}
