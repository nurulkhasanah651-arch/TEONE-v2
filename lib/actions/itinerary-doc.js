'use server';

// Itinerary Only (Operasional) — dokumen itinerary per trip: tabel penerbangan + jadwal
// harian. Disimpan di trips.itinerary_doc (jsonb). Prefill dari Tour Confirmation / itinerary
// web bila belum pernah diisi. Download PDF format khusus (lihat ItineraryDocEditor).
// Path: lib/actions/itinerary-doc.js

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

const GUARD_PATH = '/operasional';

function svc() {
  const u = brandSupabaseUrl(); const k = brandServiceRoleKey();
  return (u && k) ? createServiceClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
async function guard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, GUARD_PATH); if (g.error) return { error: g.error };
  const db = svc() || supabase;
  return { user, db };
}

const pad2 = (n) => String(n).padStart(2, '0');
function _d(s) { if (!s) return null; try { const dt = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(dt) ? null : dt; } catch { return null; } }
function fmtLong(s) { const dt = _d(s); if (!dt) return ''; return dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtShort(s) { const dt = _d(s); if (!dt) return ''; return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
function addDays(s, n) { const dt = _d(s); if (!dt) return ''; dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); }
const _str = (v) => (v == null ? '' : String(v));
function toActivities(v) {
  if (Array.isArray(v)) return v.map((x) => _str(x).trim()).filter(Boolean);
  return _str(v).split(/\r?\n|•/).map((x) => x.trim()).filter(Boolean);
}

const MONTHS_MAP = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, MEI: 4, JUN: 5, JUL: 6, AUG: 7, AGU: 7, SEP: 8, OCT: 9, OKT: 9, NOV: 10, DEC: 11, DES: 11 };
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const AIRLINE_NAME = { CA: 'Air China', SV: 'Saudia', MF: 'Xiamen Air', EY: 'Etihad Airways', EK: 'Emirates', QR: 'Qatar Airways', TK: 'Turkish Airlines', GA: 'Garuda Indonesia', SQ: 'Singapore Airlines', MH: 'Malaysia Airlines', CX: 'Cathay Pacific', ET: 'Ethiopian Airlines', KL: 'KLM', QZ: 'AirAsia', JT: 'Lion Air', ID: 'Batik Air', CZ: 'China Southern', MU: 'China Eastern', HU: 'Hainan Airlines' };

// Parse baris catatan PNR jadi segmen flight, mis:
//   "CA 476 12 NOV CGKTFU 23:05 05:45+1"  → CA 476 · 12 Nov <year> · CGK – TFU · 23:05 – 05:45 +1
// Baris bisa punya alternatif setelah ">>" (ambil yang pertama).
function parseNotesFlights(notes, depDateStr) {
  const text = _str(notes);
  if (!text.trim()) return { flights: [], airlineCode: '' };
  const dep = _d(depDateStr);
  const depYear = dep ? dep.getFullYear() : null;
  const depMonth = dep ? dep.getMonth() : null;
  const re = /([A-Z]{2})\s*(\d{2,4})\s+(\d{1,2})\s+([A-Za-z]{3})\s+([A-Z]{3})([A-Z]{3})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s*(\+\s*\d)?/;
  const flights = [];
  let airlineCode = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('>>')[0].trim(); // ambil opsi pertama
    if (!line) continue;
    const m = re.exec(line.toUpperCase());
    if (!m) continue;
    const [, al, num, day, monRaw, from, to, dep1, arr1, plus] = m;
    if (!airlineCode) airlineCode = al;
    const mon = MONTHS_MAP[monRaw.toUpperCase()];
    let dateStr = `${parseInt(day)} ${monRaw[0].toUpperCase() + monRaw.slice(1, 3).toLowerCase()}`;
    if (mon != null) {
      let yr = depYear;
      if (yr != null && depMonth != null && mon < depMonth) yr = depYear + 1; // lintas tahun (mis. Des→Jan)
      dateStr = `${parseInt(day)} ${MONTHS_ID[mon]}${yr != null ? ` ${yr}` : ''}`;
    }
    flights.push({
      code: `${al} ${num}`,
      date: dateStr,
      route: `${from} – ${to}`,
      time: `${dep1} – ${arr1}${plus ? ' +1' : ''}`,
    });
  }
  return { flights, airlineCode };
}

// Bangun baris flight dari PNR Inventory: utamakan CATATAN (detail lengkap),
// fallback ke routes (string kode bandara) / route_from-route_to.
function flightsFromInventory(fiRows) {
  const rows = (fiRows || []).slice().sort((a, b) => String(a.departure_date || '').localeCompare(String(b.departure_date || '')));
  const out = [];
  let airlineName = '';
  for (const fi of rows) {
    const parsed = parseNotesFlights(fi.notes, fi.departure_date);
    if (parsed.flights.length) {
      if (!airlineName) airlineName = _str(fi.airline).trim() || AIRLINE_NAME[parsed.airlineCode] || parsed.airlineCode || '';
      out.push(...parsed.flights);
      continue;
    }
    // Fallback: routes / route_from-route_to (tanpa kode & jam)
    const routeStrs = Array.isArray(fi.routes) ? fi.routes : (fi.routes ? [fi.routes] : []);
    const legs = [];
    for (const rs of routeStrs) {
      const codes = String(rs).toUpperCase().split(/[-→>\s]+/).map((s) => s.trim()).filter(Boolean);
      if (codes.length >= 2 && codes.length % 2 === 0) {
        for (let i = 0; i < codes.length; i += 2) legs.push(`${codes[i]} – ${codes[i + 1]}`);
      } else {
        for (let i = 0; i < codes.length - 1; i++) legs.push(`${codes[i]} – ${codes[i + 1]}`);
      }
    }
    if (!legs.length && (fi.route_from || fi.route_to)) legs.push(`${String(fi.route_from || '').toUpperCase()} – ${String(fi.route_to || '').toUpperCase()}`.trim());
    if (!airlineName) airlineName = _str(fi.airline).trim() || '';
    legs.forEach((leg, i) => {
      const isFirst = i === 0, isLast = i === legs.length - 1;
      out.push({ code: '', date: isFirst ? fmtShort(fi.departure_date) : (isLast && fi.return_date ? fmtShort(fi.return_date) : ''), route: leg, time: '' });
    });
  }
  return { flights: out, airlineName };
}

// Prefill hari dari Tour Confirmation (kalau ada) atau itinerary web; flight dari PNR Inventory.
function defaultDoc(trip, tcItin, fiRows) {
  const title = (trip.public_title || trip.name || '').trim().toUpperCase();
  const sub = [fmtShort(trip.departure), fmtShort(trip.return_date)].filter(Boolean).join(' – ');
  let days = [];
  if (Array.isArray(tcItin) && tcItin.length) {
    days = tcItin.map((d, i) => ({
      day: _str(d.day) || `Day ${i + 1}`,
      date: _str(d.date) || fmtLong(addDays(trip.departure, i)),
      route: _str(d.route),
      activities: toActivities(d.schedule),
      highlight: false,
    }));
  } else if (Array.isArray(trip.itinerary) && trip.itinerary.length) {
    days = trip.itinerary.map((d, i) => ({
      day: `Day ${d.day || i + 1}`,
      date: fmtLong(addDays(trip.departure, (Number(d.day) || i + 1) - 1)),
      route: _str(d.title),
      activities: toActivities(d.detail),
      highlight: false,
    }));
  }
  const { flights, airlineName } = flightsFromInventory(fiRows);
  return { title, subtitle: sub, airline: airlineName || '', flights, days };
}

export async function getItineraryDoc(tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!tripId) return { error: 'Trip belum dipilih.' };
  const { data: trip } = await db.from('trips')
    .select('id, kode_trip, name, public_title, departure, return_date, itinerary, itinerary_doc')
    .eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan.' };

  let tcItin = null;
  try { const { data: tc } = await db.from('tour_confirmations').select('itinerary').eq('trip_id', tripId).maybeSingle(); tcItin = tc?.itinerary || null; } catch {}
  let fiRows = [];
  try { const { data: fi } = await db.from('flight_inventory').select('airline, route_from, route_to, departure_date, return_date, routes, ticket_type, notes').eq('trip_id', tripId); fiRows = fi || []; } catch {}

  const saved = trip.itinerary_doc && typeof trip.itinerary_doc === 'object' ? trip.itinerary_doc : null;
  const def = defaultDoc(trip, tcItin, fiRows);
  const doc = saved ? {
    title: _str(saved.title) || def.title,
    subtitle: _str(saved.subtitle) || def.subtitle,
    airline: _str(saved.airline),
    // Kalau flight belum pernah diisi, ikut dari PNR Inventory (biar tak isi ulang).
    flights: Array.isArray(saved.flights) && saved.flights.length ? saved.flights : def.flights,
    days: Array.isArray(saved.days) && saved.days.length ? saved.days : def.days,
  } : def;

  return {
    ok: true,
    saved: !!saved,
    trip: { id: trip.id, kode: trip.kode_trip || '', name: trip.public_title || trip.name || '', departure: trip.departure, return_date: trip.return_date },
    doc,
  };
}

export async function saveItineraryDoc(tripId, data = {}) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!tripId) return { error: 'Trip belum dipilih.' };

  const flights = Array.isArray(data.flights) ? data.flights.map((f) => ({
    code: _str(f.code).trim(), date: _str(f.date).trim(), route: _str(f.route).trim(), time: _str(f.time).trim(),
  })).filter((f) => f.code || f.route || f.date || f.time) : [];
  const days = Array.isArray(data.days) ? data.days.map((d) => ({
    day: _str(d.day).trim(), date: _str(d.date).trim(), route: _str(d.route).trim(),
    activities: toActivities(d.activities), highlight: !!d.highlight,
  })).filter((d) => d.day || d.route || d.activities.length) : [];

  const doc = {
    title: _str(data.title).trim(),
    subtitle: _str(data.subtitle).trim(),
    airline: _str(data.airline).trim(),
    flights, days,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('trips').update({ itinerary_doc: doc }).eq('id', tripId);
  if (error) return { error: 'Gagal simpan: ' + error.message };
  return { ok: true };
}

export async function listItineraryTrips() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const [{ data: trips }, { data: pax }, { data: fi }] = await Promise.all([
    db.from('trips').select('id, kode_trip, name, public_title, departure, return_date, status, pic, itinerary_doc')
      .order('departure', { ascending: false, nullsFirst: false }),
    db.from('trip_passengers').select('trip_id, status, transfer_status, refund_status'),
    db.from('flight_inventory').select('trip_id, ticket_type, ticket_issued, eticket_docs').not('trip_id', 'is', null),
  ]);
  const cnt = {};
  for (const p of (pax || [])) {
    if (p.status === 'cancelled' || p.transfer_status === 'transferred' || p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
    cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1;
  }
  // Tiket per trip: jenis (FIT/Domestik/Group) + apakah e-ticket sudah terbit.
  const TYPE_LABEL = { fit: 'FIT', domestic: 'Domestik', group: 'Group' };
  const tk = {};
  for (const r of (fi || [])) {
    const e = tk[r.trip_id] = tk[r.trip_id] || { types: new Set(), issued: false };
    const t = String(r.ticket_type || '').toLowerCase();
    e.types.add(TYPE_LABEL[t] || (t ? t.toUpperCase() : 'PNR'));
    if (r.ticket_issued === true || (Array.isArray(r.eticket_docs) && r.eticket_docs.length > 0)) e.issued = true;
  }
  const list = (trips || []).map((t) => {
    const info = tk[t.id];
    return {
      id: t.id, kode: t.kode_trip || '', name: t.public_title || t.name || '',
      departure: t.departure, return_date: t.return_date, status: t.status, pic: t.pic || '',
      pax: cnt[t.id] || 0, hasDoc: !!(t.itinerary_doc && typeof t.itinerary_doc === 'object'),
      ticketTypes: info ? [...info.types] : [],
      ticketIssued: !!info?.issued,
    };
  });
  return { ok: true, trips: list };
}
