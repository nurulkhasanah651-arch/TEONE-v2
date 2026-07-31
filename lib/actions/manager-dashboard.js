'use server';

// Manager Dashboard "Morning Monitoring" — hanya owner / manager / accounting.
// Agregasi read-only lintas: ticketing, visa, operation, selling. + toggle ticket_issued.
// Path: lib/actions/manager-dashboard.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { effectiveSellingStatus } from '@/lib/utils/trip-status';
import { deriveVisaStage } from '@/lib/utils/visa-constants';
import { PREP_ITEMS, PREP_KEYS, PREP_WINDOW_DAYS } from '@/lib/utils/departure-prep';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function fmtD(d) { if (!d) return '—'; const x = new Date(d); if (isNaN(x)) return '—'; return `${x.getDate()} ${MONTHS_ID[x.getMonth()]} ${x.getFullYear()}`; }
function isActive(p) { return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'; }
function daysBetween(fromIso, toIso) { const a = new Date(fromIso), b = new Date(toIso); return Math.round((b - a) / 86400000); }

async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/manager-dashboard'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}

export async function getManagerDashboard() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const todayWIB = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  // ── Follow-up harian → sembunyikan item HANYA untuk hari ini (WIB).
  // Besok muncul lagi kalau tim belum update di divisinya masing2. ──
  const fset = new Set();
  try {
    const startOfTodayWIB = new Date(`${todayWIB}T00:00:00+07:00`).toISOString();
    const { data: fups } = await db.from('manager_followups').select('section, trip_id, created_at').gte('created_at', startOfTodayWIB);
    for (const r of (fups || [])) fset.add(`${r.section}:${r.trip_id}`);
  } catch {}
  const keep = (section, arr) => (arr || []).filter((t) => !fset.has(`${section}:${t.id}`));

  // ── Trips ──
  const { data: tripsRaw } = await db.from('trips')
    .select('id, kode_trip, name, slug, quota, departure, return_date, status, ticket_status, offering_vendor_requested_at, created_at, price_breakdown, visa_doc_template, visa_requirement, visa_status');
  const trips = (tripsRaw || []);
  const tripById = Object.fromEntries(trips.map((t) => [t.id, t]));
  const tripIds = trips.map((t) => t.id);

  // ── Passengers (paginasi) ──
  let pax = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('trip_passengers')
      .select('id, trip_id, customer_id, transfer_status, refund_status, include_visa, include_asuransi, visa_ready, visa_result, visa_biometric_date, visa_docs, visa_type, ticket_issued')
      .order('id', { ascending: true }).range(from, from + 999);
    if (!data || data.length === 0) break;
    pax = pax.concat(data);
    if (data.length < 1000) break;
  }

  // ── Paid visa (participant_payments type Visa) ──
  const paidVisa = new Set();
  const allPaxIds = pax.map((p) => p.id);
  for (let i = 0; i < allPaxIds.length; i += 500) {
    const { data } = await db.from('participant_payments').select('passenger_id, amount, is_transferred').eq('type', 'Visa').in('passenger_id', allPaxIds.slice(i, i + 500));
    for (const r of (data || [])) { if (r.is_transferred !== true && Number(r.amount) > 0) paidVisa.add(r.passenger_id); }
  }

  // ── Flight inventory (PNR) linked ──
  const ticketByTrip = {};
  try {
    const { data: fi } = await db.from('flight_inventory').select('trip_id, ticket_type, ticket_issued').not('trip_id', 'is', null);
    for (const r of (fi || [])) {
      const e = ticketByTrip[r.trip_id] = ticketByTrip[r.trip_id] || { count: 0, issued: 0, fitDom: 0 };
      e.count++; if (r.ticket_issued === true) e.issued++;
      if (['fit', 'domestic'].includes(r.ticket_type)) e.fitDom++;
    }
  } catch {}

  // ── Estimates ──
  const estByTrip = {};
  try { const { data: est } = await db.from('profit_estimates').select('trip_id, expense_rows, updated_at'); for (const s of (est || [])) estByTrip[s.trip_id] = s; } catch {}

  // ── Group pax per trip + name lookup ──
  const paxByTrip = {}; for (const p of pax) (paxByTrip[p.trip_id] = paxByTrip[p.trip_id] || []).push(p);
  const custIds = [...new Set(pax.map((p) => p.customer_id).filter(Boolean))];
  const nameOf = {};
  for (let i = 0; i < custIds.length; i += 500) {
    const { data } = await db.from('customers').select('id, name').in('id', custIds.slice(i, i + 500));
    for (const c of (data || [])) nameOf[c.id] = c.name || '';
  }

  // ── Per-trip compute ──
  const meta = {};
  for (const t of trips) {
    const rows = paxByTrip[t.id] || [];
    const active = rows.filter(isActive);
    const sold = active.length;
    const quota = Number(t.quota || 0);
    const sellStatus = effectiveSellingStatus({ ...t, _soldReal: sold });
    const full = quota > 0 && sold >= quota;
    const seatLeft = Math.max(quota - sold, 0);
    const daysToDep = t.departure ? daysBetween(todayWIB, String(t.departure).slice(0, 10)) : null;
    meta[t.id] = { rows, active, sold, quota, sellStatus, full, seatLeft, daysToDep };
  }
  const upcoming = trips.filter((t) => !['completed', 'cancelled'].includes(meta[t.id].sellStatus));

  const tripCard = (t) => ({ id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '', departureFmt: fmtD(t.departure), departure: t.departure || null, quota: meta[t.id].quota, sold: meta[t.id].sold, seatLeft: meta[t.id].seatLeft, sellStatus: meta[t.id].sellStatus, daysToDep: meta[t.id].daysToDep });

  // ═══ 1. TICKETING ═══
  // (a) full tapi belum ada tiket ke-connect di PNR
  const fullNoTicket = upcoming
    .filter((t) => meta[t.id].full && !(ticketByTrip[t.id] && ticketByTrip[t.id].count > 0))
    .map(tripCard);
  // (b) trip dgn tiket FIT/Domestik yg sudah ke-connect tapi peserta belum ditandai issued
  // (checklist issued hanya utk FIT & Domestik — group tidak perlu)
  const notIssued = [];
  for (const t of upcoming) {
    if (!(ticketByTrip[t.id] && ticketByTrip[t.id].fitDom > 0)) continue;
    const belum = meta[t.id].active.filter((p) => p.ticket_issued !== true);
    if (belum.length) notIssued.push({ ...tripCard(t), total: meta[t.id].active.length, belum: belum.length, peserta: belum.map((p) => ({ id: p.id, nama: nameOf[p.customer_id] || `Peserta #${p.id}` })) });
  }

  // ═══ 2. VISA ═══
  // visa_requirement: 'individual' = urus per peserta · 'group' = visa group (reminder H-60) · 'none'/null = tak butuh
  const VISA_DONE = new Set(['done', 'selesai', 'completed', 'ready', 'issued']);
  const visaNotProcessed = []; // butuh visa (individual), belum bayar, belum proses
  const visaPaidUnscheduled = []; // sudah bayar visa, belum dijadwalkan biometrik
  const visaFullH5 = []; // group full, H-5 bulan, visa belum jalan
  const visaGroupH60 = []; // visa_requirement='group', sudah H-60 (2 bln), visa group belum diurus
  for (const t of upcoming) {
    const req = String(t.visa_requirement || '').toLowerCase();
    const tmpl = t.visa_doc_template || [];
    // Reminder VISA GROUP: H-60 (2 bulan) — urus visa group segera
    if (req === 'group' && meta[t.id].sold > 0 && meta[t.id].daysToDep != null && meta[t.id].daysToDep >= 0 && meta[t.id].daysToDep <= 60 && !VISA_DONE.has(String(t.visa_status || '').toLowerCase())) {
      visaGroupH60.push(tripCard(t));
    }
    // "Belum bayar & belum proses" HANYA trip yg butuh visa individual (bukan group / none)
    if (req === 'none' || req === 'group') continue;
    const belumProses = []; const paidUnsched = [];
    for (const p of meta[t.id].active) {
      if (p.visa_ready === true) continue;
      const vp = paidVisa.has(p.id);
      const needsVisa = p.include_visa === true || vp;
      if (!needsVisa) continue;
      const stage = deriveVisaStage({ ...p, visaPaid: vp }, tmpl);
      if (stage.key === 'siap_biometrik' && vp) paidUnsched.push({ id: p.id, nama: nameOf[p.customer_id] || `Peserta #${p.id}` });
      else if (!vp && (stage.key === 'belum_mulai' || stage.key === 'lengkapi_dokumen')) belumProses.push({ id: p.id, nama: nameOf[p.customer_id] || `Peserta #${p.id}` });
    }
    if (belumProses.length) visaNotProcessed.push({ ...tripCard(t), belum: belumProses.length, peserta: belumProses });
    if (paidUnsched.length) visaPaidUnscheduled.push({ ...tripCard(t), belum: paidUnsched.length, peserta: paidUnsched });
    // full & H-5 bulan (<=150 hari) & masih ada yg belum proses visa
    if (meta[t.id].full && meta[t.id].daysToDep != null && meta[t.id].daysToDep <= 150 && belumProses.length) {
      visaFullH5.push({ ...tripCard(t), belum: belumProses.length });
    }
  }

  // ═══ 3. OPERATION ═══
  const newRelease = upcoming
    .filter((t) => { const c = t.created_at ? daysBetween(String(t.created_at).slice(0, 10), todayWIB) : 999; return c <= 14 && ['prepare to sell', 'open selling'].includes(meta[t.id].sellStatus); })
    .map((t) => ({ ...tripCard(t), offeringRequested: !!t.offering_vendor_requested_at }));
  const fullNoOffering = upcoming
    .filter((t) => meta[t.id].full && !t.offering_vendor_requested_at)
    .map(tripCard);
  const estimateNotUpdated = upcoming
    .filter((t) => {
      if (!t.offering_vendor_requested_at) return false;
      const s = estByTrip[t.id];
      const hasExp = !!(s && Array.isArray(s.expense_rows) && s.expense_rows.length > 0);
      if (!s || !hasExp) return true;
      return new Date(s.updated_at) < new Date(t.offering_vendor_requested_at);
    })
    .map(tripCard);

  // ═══ 4. SELLING ═══
  const almostFull = upcoming
    .filter((t) => meta[t.id].seatLeft > 0 && meta[t.id].seatLeft <= 4)
    .map(tripCard)
    .sort((a, b) => a.seatLeft - b.seatLeft);
  const slowSelling = upcoming
    .filter((t) => {
      const m = meta[t.id];
      if (m.sellStatus !== 'open selling' || m.quota <= 0) return false;
      if (m.daysToDep == null || m.daysToDep > 120 || m.daysToDep < 0) return false; // sudah dekat (<=4 bln)
      const ratio = m.sold / m.quota;
      return ratio < 0.6 && m.sold > 0; // jalan tp masih < 60% & belum penuh
    })
    .map((t) => ({ ...tripCard(t), fillPct: Math.round((meta[t.id].sold / meta[t.id].quota) * 100) }))
    .sort((a, b) => a.fillPct - b.fillPct);

  // ═══ 5. PREPARATION KEBERANGKATAN GROUP (H-20) ═══
  const prepTripsRaw = upcoming.filter((t) => meta[t.id].sold > 0 && meta[t.id].daysToDep != null && meta[t.id].daysToDep >= 0 && meta[t.id].daysToDep <= PREP_WINDOW_DAYS);
  const prepIds = prepTripsRaw.map((t) => t.id);
  const prepChecklist = {};
  if (prepIds.length) {
    try {
      for (let i = 0; i < prepIds.length; i += 500) {
        const { data } = await db.from('group_departure_prep').select('trip_id, checklist').in('trip_id', prepIds.slice(i, i + 500));
        for (const r of (data || [])) prepChecklist[r.trip_id] = r.checklist || {};
      }
    } catch {}
  }
  const preparation = prepTripsRaw
    .map((t) => {
      const cl = prepChecklist[t.id] || {};
      const items = PREP_ITEMS.map((it) => ({ key: it.key, label: it.label, done: cl[it.key] === true }));
      const doneCount = items.filter((it) => it.done).length;
      return { ...tripCard(t), items, doneCount, total: PREP_ITEMS.length };
    })
    .sort((a, b) => (a.daysToDep - b.daysToDep)); // paling dekat berangkat di atas

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    followupMode: 'daily',
    ticketing: {
      fullNoTicket: keep('ticketing.fullNoTicket', fullNoTicket),
      notIssued: keep('ticketing.notIssued', notIssued),
    },
    visa: {
      groupH60: keep('visa.groupH60', visaGroupH60),
      notProcessed: keep('visa.notProcessed', visaNotProcessed),
      paidUnscheduled: keep('visa.paidUnscheduled', visaPaidUnscheduled),
      fullH5: keep('visa.fullH5', visaFullH5),
    },
    operation: {
      newRelease: keep('operation.newRelease', newRelease),
      fullNoOffering: keep('operation.fullNoOffering', fullNoOffering),
      estimateNotUpdated: keep('operation.estimateNotUpdated', estimateNotUpdated),
    },
    selling: {
      slowSelling: keep('selling.slowSelling', slowSelling),
      almostFull: keep('selling.almostFull', almostFull),
    },
    preparation: { trips: preparation, windowDays: PREP_WINDOW_DAYS },
  };
}

const VALID_SECTIONS = new Set([
  'ticketing.fullNoTicket', 'ticketing.notIssued',
  'visa.groupH60', 'visa.notProcessed', 'visa.paidUnscheduled', 'visa.fullH5',
  'operation.newRelease', 'operation.fullNoOffering', 'operation.estimateNotUpdated',
  'selling.slowSelling', 'selling.almostFull',
]);

// Tandai "sudah follow up" → item hilang HARI INI; muncul lagi besok kalau belum dikerjakan tim.
export async function markFollowup(section, tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!VALID_SECTIONS.has(section)) return { error: 'Section tidak valid' };
  const tid = String(tripId || '').trim(); if (!tid) return { error: 'Trip tidak valid' };
  const { error } = await db.from('manager_followups')
    .upsert({ section, trip_id: tid, created_at: new Date().toISOString(), created_by: user?.id || null }, { onConflict: 'section,trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Batal follow-up (mis. kepencet) → item muncul lagi.
export async function clearFollowup(section, tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const tid = String(tripId || '').trim(); if (!section || !tid) return { error: 'Data tidak valid' };
  const { error } = await db.from('manager_followups').delete().eq('section', section).eq('trip_id', tid);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Centang / batal item checklist kesiapan keberangkatan group (H-20).
export async function setDeparturePrep(tripId, key, done) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  const tid = String(tripId || '').trim(); if (!tid) return { error: 'Trip tidak valid' };
  if (!PREP_KEYS.includes(key)) return { error: 'Item tidak valid' };
  const { data: row } = await db.from('group_departure_prep').select('checklist').eq('trip_id', tid).maybeSingle();
  const checklist = { ...(row?.checklist || {}) };
  if (done) checklist[key] = true; else delete checklist[key];
  const { error } = await db.from('group_departure_prep')
    .upsert({ trip_id: tid, checklist, updated_at: new Date().toISOString(), updated_by: user?.id || null }, { onConflict: 'trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Tandai / batalkan peserta sudah issued tiket.
export async function toggleTicketIssued(passengerId, issued) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const pid = parseInt(passengerId); if (!pid) return { error: 'Peserta tidak valid' };
  const upd = issued ? { ticket_issued: true, ticket_issued_at: new Date().toISOString() } : { ticket_issued: false, ticket_issued_at: null };
  const { error } = await db.from('trip_passengers').update(upd).eq('id', pid);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}
