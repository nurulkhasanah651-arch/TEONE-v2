// Compute bersama "Morning Monitoring" — dipakai Dashboard Manager (semua trip)
// & Dashboard PIC (discope ke trip milik PIC). Modul murni (bukan 'use server'):
// menerima `db` service client dari pemanggil.
// Path: lib/monitor/build-monitor.js

import { effectiveSellingStatus } from '@/lib/utils/trip-status';
import { deriveVisaStage } from '@/lib/utils/visa-constants';
import { PREP_ITEMS, PREP_WINDOW_DAYS } from '@/lib/utils/departure-prep';

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function fmtD(d) { if (!d) return '—'; const x = new Date(d); if (isNaN(x)) return '—'; return `${x.getDate()} ${MONTHS_ID[x.getMonth()]} ${x.getFullYear()}`; }
function isActive(p) { return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'; }
function daysBetween(fromIso, toIso) { const a = new Date(fromIso), b = new Date(toIso); return Math.round((b - a) / 86400000); }

// Hitung seluruh section monitor. `tripFilter(trip) => bool` (opsional) menyaring trip
// yang diikutkan (mis. hanya trip milik PIC). Return raw (tanpa filter follow-up harian);
// pemanggil (manager) yang menerapkan keep()/follow-up.
export async function buildMonitor(db, { tripFilter = null } = {}) {
  const todayWIB = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  // ── Trips ──
  const { data: tripsRaw } = await db.from('trips')
    .select('id, kode_trip, name, slug, quota, departure, return_date, status, ticket_status, offering_vendor_requested_at, created_at, price_breakdown, visa_doc_template, visa_requirement, visa_status, pic, pic_email');
  let trips = (tripsRaw || []);
  if (typeof tripFilter === 'function') trips = trips.filter(tripFilter);
  const tripIds = new Set(trips.map((t) => t.id));

  // ── Passengers (paginasi) — hanya untuk trip yang dipantau ──
  let pax = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('trip_passengers')
      .select('id, trip_id, customer_id, transfer_status, refund_status, include_visa, include_asuransi, visa_ready, visa_result, visa_biometric_date, visa_docs, visa_type, ticket_issued')
      .order('id', { ascending: true }).range(from, from + 999);
    if (!data || data.length === 0) break;
    pax = pax.concat(data.filter((p) => tripIds.has(p.trip_id)));
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
      if (!tripIds.has(r.trip_id)) continue;
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
  const fullNoTicket = upcoming
    .filter((t) => meta[t.id].full && !(ticketByTrip[t.id] && ticketByTrip[t.id].count > 0))
    .map(tripCard);
  const notIssued = [];
  for (const t of upcoming) {
    if (!(ticketByTrip[t.id] && ticketByTrip[t.id].fitDom > 0)) continue;
    const belum = meta[t.id].active.filter((p) => p.ticket_issued !== true);
    if (belum.length) notIssued.push({ ...tripCard(t), total: meta[t.id].active.length, belum: belum.length, peserta: belum.map((p) => ({ id: p.id, nama: nameOf[p.customer_id] || `Peserta #${p.id}` })) });
  }

  // ═══ 2. VISA ═══
  const VISA_DONE = new Set(['done', 'selesai', 'completed', 'ready', 'issued']);
  const visaNotProcessed = [];
  const visaPaidUnscheduled = [];
  const visaFullH5 = [];
  const visaGroupH60 = [];
  for (const t of upcoming) {
    const req = String(t.visa_requirement || '').toLowerCase();
    const tmpl = t.visa_doc_template || [];
    if (req === 'group' && meta[t.id].sold > 0 && meta[t.id].daysToDep != null && meta[t.id].daysToDep >= 0 && meta[t.id].daysToDep <= 60 && !VISA_DONE.has(String(t.visa_status || '').toLowerCase())) {
      visaGroupH60.push(tripCard(t));
    }
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
      if (m.daysToDep == null || m.daysToDep > 120 || m.daysToDep < 0) return false;
      const ratio = m.sold / m.quota;
      return ratio < 0.6 && m.sold > 0;
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
    .sort((a, b) => (a.daysToDep - b.daysToDep));

  return {
    generatedAt: new Date().toISOString(),
    tripIds: [...tripIds],
    ticketing: { fullNoTicket, notIssued },
    visa: { groupH60: visaGroupH60, notProcessed: visaNotProcessed, paidUnscheduled: visaPaidUnscheduled, fullH5: visaFullH5 },
    operation: { newRelease, fullNoOffering, estimateNotUpdated },
    selling: { slowSelling, almostFull },
    preparation: { trips: preparation, windowDays: PREP_WINDOW_DAYS },
  };
}
