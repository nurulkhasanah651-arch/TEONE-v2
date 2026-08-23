'use server';

// Optional Tour per Group — pencatatan peserta optional tour + status bayar (checklist).
// ADITIF: modul baru, tidak mengubah alur/tabel lama. Pakai service-role client & guard '/operasional'.
// Tabel: optional_tours (katalog per trip) + optional_tour_participants (siapa ikut + paid).
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

// ── Daftar trip (untuk halaman sidebar Optional Tour) ──
export async function listOptionalTourTrips() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, status')
    .order('departure', { ascending: true, nullsFirst: false });
  const active = (trips || []).filter((t) => !['cancelled', 'completed'].includes(String(t.status || '').toLowerCase()));

  // Ringkasan peserta optional per trip
  const { data: tours } = await db.from('optional_tours').select('id, trip_id, active');
  const { data: parts } = await db.from('optional_tour_participants').select('trip_id, paid');
  const toursByTrip = {};
  for (const t of (tours || [])) toursByTrip[t.trip_id] = (toursByTrip[t.trip_id] || 0) + 1;
  const paxByTrip = {}; const paidByTrip = {};
  for (const p of (parts || [])) {
    paxByTrip[p.trip_id] = (paxByTrip[p.trip_id] || 0) + 1;
    if (p.paid === true) paidByTrip[p.trip_id] = (paidByTrip[p.trip_id] || 0) + 1;
  }
  const rows = active.map((t) => ({
    id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '', departure: t.departure || null,
    tourCount: toursByTrip[t.id] || 0,
    joinCount: paxByTrip[t.id] || 0,
    paidCount: paidByTrip[t.id] || 0,
  }));
  return { ok: true, rows };
}

// ── Detail 1 trip: katalog optional tour + peserta aktif + siapa ikut & status bayar ──
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

  // Nama peserta dari customers
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

  // Siapa ikut apa (join)
  const { data: joinsRaw } = await db.from('optional_tour_participants')
    .select('id, optional_tour_id, passenger_id, paid, paid_at, note').eq('trip_id', tripId);
  const joins = {};
  for (const j of (joinsRaw || [])) {
    (joins[j.optional_tour_id] = joins[j.optional_tour_id] || {})[j.passenger_id] =
      { rowId: j.id, paid: j.paid === true, paid_at: j.paid_at || null, note: j.note || '' };
  }

  return {
    ok: true,
    trip: { id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '', departure: t.departure || null },
    tours: (tours || []).map((x) => ({
      id: x.id, name: x.name, price: Number(x.price) || 0, currency: x.currency || 'IDR',
      kurs: Number(x.kurs) || 0, active: x.active !== false,
    })),
    participants,
    joins,
  };
}

// ── Katalog optional tour ──
export async function addOptionalTour(tripId, fields) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!tripId) return { error: 'Trip tidak valid' };
  const name = clean(fields?.name); if (!name) return { error: 'Nama optional tour wajib diisi' };
  const row = {
    trip_id: tripId, name,
    price: numOrZero(fields?.price),
    currency: clean(fields?.currency) || 'IDR',
    kurs: numOrZero(fields?.kurs),
    created_by: user.email || 'staff',
  };
  const { error } = await db.from('optional_tours').insert(row);
  if (error) return { error: error.message };
  revalidatePath('/operasional/optional-tour');
  return { ok: true };
}

export async function updateOptionalTour(id, fields) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!id) return { error: 'Data tidak valid' };
  const upd = {};
  if (fields?.name !== undefined) { const n = clean(fields.name); if (!n) return { error: 'Nama tidak boleh kosong' }; upd.name = n; }
  if (fields?.price !== undefined) upd.price = numOrZero(fields.price);
  if (fields?.currency !== undefined) upd.currency = clean(fields.currency) || 'IDR';
  if (fields?.kurs !== undefined) upd.kurs = numOrZero(fields.kurs);
  if (fields?.active !== undefined) upd.active = fields.active === true;
  if (!Object.keys(upd).length) return { ok: true };
  const { error } = await db.from('optional_tours').update(upd).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/operasional/optional-tour');
  return { ok: true };
}

export async function deleteOptionalTour(id) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!id) return { error: 'Data tidak valid' };
  // hapus peserta ikutannya dulu (kalau FK cascade tak aktif), lalu tour-nya
  await db.from('optional_tour_participants').delete().eq('optional_tour_id', id);
  const { error } = await db.from('optional_tours').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/operasional/optional-tour');
  return { ok: true };
}

// ── Peserta ikut / tidak ikut optional tour (centang) ──
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

// ── Checklist status bayar ──
export async function setParticipantPaid(rowId, paid) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!rowId) return { error: 'Data tidak valid' };
  const upd = paid
    ? { paid: true, paid_at: new Date().toISOString(), paid_by: user.email || 'staff' }
    : { paid: false, paid_at: null, paid_by: null };
  const { error } = await db.from('optional_tour_participants').update(upd).eq('id', rowId);
  if (error) return { error: error.message };
  revalidatePath('/operasional/optional-tour');
  return { ok: true };
}

export async function setParticipantNote(rowId, note) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!rowId) return { error: 'Data tidak valid' };
  const { error } = await db.from('optional_tour_participants').update({ note: clean(note) }).eq('id', rowId);
  if (error) return { error: error.message };
  return { ok: true };
}
