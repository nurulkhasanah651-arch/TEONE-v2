'use server';

// Optional Tour per Group — roster peserta + SAMBUNG ke Payment Checklist Finance.
// ALUR: optional tour (nama+harga) -> otomatis jadi item tagihan di Payment Checklist
// (via price_breakdown._custom, opt-in, TIDAK menambah expected pokok). Finance yang
// menandai lunas di checklist -> tab Optional Tour otomatis menampilkan "Paid"
// (dibaca dari participant_payments, sumber kebenaran = Finance).
// ADITIF: tidak mengubah UI/kalkulasi Finance. _custom hanya dipakai deriveMilestones.
// Path: lib/actions/optional-tours.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/operasional'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}
const clean = (v) => { const s = (v == null ? '' : String(v)).trim(); return s || null; };
const numOrZero = (v) => { if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
function isActivePax(p) {
  return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}
// Harga optional tour dalam Rupiah (utk jadi item tagihan Finance). USD -> pakai kurs.
function idrPrice(t) {
  const p = Number(t.price) || 0;
  if (String(t.currency || 'IDR').toUpperCase() === 'USD') { const k = Number(t.kurs) || 0; return k > 0 ? Math.round(p * k) : 0; }
  return Math.round(p);
}

// Sinkron kolom tagihan optional tour ke price_breakdown._custom milik trip.
// Entry yg dikelola optional tour ditandai `_opt: <tourId>`; entry _custom lain
// (dibuat manual di Finance) TIDAK disentuh.
async function syncBillingColumns(db, tripId) {
  const { data: t } = await db.from('trips').select('price_breakdown').eq('id', tripId).maybeSingle();
  const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? { ...t.price_breakdown } : {};
  const prevCustom = Array.isArray(bd._custom) ? bd._custom : [];
  const keep = prevCustom.filter((c) => c && !c._opt); // entri non-optional-tour dibiarkan
  const { data: tours } = await db.from('optional_tours').select('id, name, price, currency, kurs').eq('trip_id', tripId);
  const optEntries = (tours || [])
    .map((t2) => ({ name: String(t2.name || '').trim(), price: idrPrice(t2), _opt: t2.id }))
    .filter((e) => e.name && e.price > 0);
  bd._custom = [...keep, ...optEntries];
  await db.from('trips').update({ price_breakdown: bd }).eq('id', tripId);
}

// ── Daftar trip (halaman sidebar) ──
export async function listOptionalTourTrips() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, status')
    .order('departure', { ascending: true, nullsFirst: false });
  const active = (trips || []).filter((t) => !['cancelled', 'completed'].includes(String(t.status || '').toLowerCase()));
  const { data: tours } = await db.from('optional_tours').select('id, trip_id, name');
  const { data: parts } = await db.from('optional_tour_participants').select('trip_id');
  const toursByTrip = {}; const namesByTrip = {};
  for (const t of (tours || [])) { toursByTrip[t.trip_id] = (toursByTrip[t.trip_id] || 0) + 1; (namesByTrip[t.trip_id] = namesByTrip[t.trip_id] || []).push(t.name); }
  const joinByTrip = {};
  for (const p of (parts || [])) joinByTrip[p.trip_id] = (joinByTrip[p.trip_id] || 0) + 1;
  const rows = active.map((t) => ({
    id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '', departure: t.departure || null,
    tourCount: toursByTrip[t.id] || 0, joinCount: joinByTrip[t.id] || 0,
  }));
  return { ok: true, rows };
}

// ── Detail 1 trip ──
export async function getTripOptionalTours(tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!tripId) return { error: 'Trip tidak valid' };

  const { data: t } = await db.from('trips').select('id, kode_trip, name, departure').eq('id', tripId).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };

  const { data: tours } = await db.from('optional_tours')
    .select('id, name, price, currency, kurs, active, sort, created_at')
    .eq('trip_id', tripId).order('sort', { ascending: true }).order('created_at', { ascending: true });

  const { data: pax } = await db.from('trip_passengers')
    .select('id, customer_id, room_type, age_type, transfer_status, refund_status')
    .eq('trip_id', tripId).range(0, 4999);
  const active = (pax || []).filter(isActivePax);
  const activeIds = active.map((p) => p.id);

  const custIds = [...new Set(active.map((p) => p.customer_id).filter(Boolean))];
  const nameOf = {};
  for (let i = 0; i < custIds.length; i += 500) {
    const { data } = await db.from('customers').select('id, name').in('id', custIds.slice(i, i + 500));
    for (const c of (data || [])) nameOf[c.id] = c.name || '';
  }
  const participants = active.map((p) => ({
    id: p.id, name: nameOf[p.customer_id] || `Peserta #${p.id}`,
    room_type: p.room_type || '', age_type: p.age_type || '',
  })).sort((a, b) => a.name.localeCompare(b.name));

  // Roster ikut (dari optional_tour_participants)
  const { data: joinsRaw } = await db.from('optional_tour_participants')
    .select('optional_tour_id, passenger_id').eq('trip_id', tripId);
  const joins = {};
  for (const j of (joinsRaw || [])) (joins[j.optional_tour_id] = joins[j.optional_tour_id] || {})[j.passenger_id] = true;

  // STATUS BAYAR dari FINANCE: participant_payments dgn type = nama optional tour.
  const nameToId = {}; for (const x of (tours || [])) nameToId[String(x.name || '').trim()] = x.id;
  const tourNames = Object.keys(nameToId);
  const paid = {}; // { tourId: { passengerId: true } }
  if (activeIds.length && tourNames.length) {
    for (let i = 0; i < activeIds.length; i += 500) {
      const { data: pays } = await db.from('participant_payments')
        .select('passenger_id, type').in('passenger_id', activeIds.slice(i, i + 500)).in('type', tourNames);
      for (const r of (pays || [])) {
        const tid = nameToId[String(r.type || '').trim()]; if (!tid) continue;
        (paid[tid] = paid[tid] || {})[r.passenger_id] = true;
      }
    }
  }

  return {
    ok: true,
    trip: { id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '', departure: t.departure || null },
    tours: (tours || []).map((x) => ({
      id: x.id, name: x.name, price: Number(x.price) || 0, currency: x.currency || 'IDR',
      kurs: Number(x.kurs) || 0, idrPrice: idrPrice(x),
    })),
    participants, joins, paid,
  };
}

// ── Katalog optional tour (+ sinkron kolom tagihan Finance) ──
export async function addOptionalTour(tripId, fields) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!tripId) return { error: 'Trip tidak valid' };
  const name = clean(fields?.name); if (!name) return { error: 'Nama optional tour wajib diisi' };
  const { error } = await db.from('optional_tours').insert({
    trip_id: tripId, name, price: numOrZero(fields?.price),
    currency: clean(fields?.currency) || 'IDR', kurs: numOrZero(fields?.kurs), created_by: user.email || 'staff',
  });
  if (error) return { error: error.message };
  await syncBillingColumns(db, tripId);
  revalidatePath('/operasional/optional-tour');
  revalidatePath(`/finance/payments/${tripId}`);
  return { ok: true };
}

export async function updateOptionalTour(id, fields) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!id) return { error: 'Data tidak valid' };
  const { data: old } = await db.from('optional_tours').select('id, trip_id, name').eq('id', id).maybeSingle();
  if (!old) return { error: 'Optional tour tidak ditemukan' };
  const upd = {};
  if (fields?.name !== undefined) { const n = clean(fields.name); if (!n) return { error: 'Nama tidak boleh kosong' }; upd.name = n; }
  if (fields?.price !== undefined) upd.price = numOrZero(fields.price);
  if (fields?.currency !== undefined) upd.currency = clean(fields.currency) || 'IDR';
  if (fields?.kurs !== undefined) upd.kurs = numOrZero(fields.kurs);
  if (Object.keys(upd).length) {
    const { error } = await db.from('optional_tours').update(upd).eq('id', id);
    if (error) return { error: error.message };
  }
  // Kalau nama berubah, ikut rename type di participant_payments (biar status bayar Finance tetap nyambung).
  if (upd.name && upd.name !== old.name) {
    try {
      const { data: pax } = await db.from('trip_passengers').select('id').eq('trip_id', old.trip_id).range(0, 4999);
      const ids = (pax || []).map((p) => p.id);
      for (let i = 0; i < ids.length; i += 500) {
        await db.from('participant_payments').update({ type: upd.name }).eq('type', old.name).in('passenger_id', ids.slice(i, i + 500));
      }
    } catch {}
  }
  await syncBillingColumns(db, old.trip_id);
  revalidatePath('/operasional/optional-tour');
  revalidatePath(`/finance/payments/${old.trip_id}`);
  return { ok: true };
}

export async function deleteOptionalTour(id) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!id) return { error: 'Data tidak valid' };
  const { data: old } = await db.from('optional_tours').select('id, trip_id').eq('id', id).maybeSingle();
  await db.from('optional_tour_participants').delete().eq('optional_tour_id', id);
  const { error } = await db.from('optional_tours').delete().eq('id', id);
  if (error) return { error: error.message };
  // Catatan: participant_payments (riwayat bayar Finance) TIDAK dihapus (jaga histori keuangan).
  if (old?.trip_id) { await syncBillingColumns(db, old.trip_id); revalidatePath(`/finance/payments/${old.trip_id}`); }
  revalidatePath('/operasional/optional-tour');
  return { ok: true };
}

// ── Roster: peserta ikut / tidak ikut (centang) ──
export async function toggleParticipant(tripId, optionalTourId, passengerId, join) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  const pid = parseInt(passengerId);
  if (!tripId || !optionalTourId || !pid) return { error: 'Data tidak valid' };
  if (join) {
    const { error } = await db.from('optional_tour_participants')
      .upsert({ trip_id: tripId, optional_tour_id: optionalTourId, passenger_id: pid, created_by: user.email || 'staff' },
        { onConflict: 'optional_tour_id,passenger_id' });
    if (error) return { error: error.message };
  } else {
    const { error } = await db.from('optional_tour_participants')
      .delete().eq('optional_tour_id', optionalTourId).eq('passenger_id', pid);
    if (error) return { error: error.message };
  }
  revalidatePath('/operasional/optional-tour');
  return { ok: true };
}
