'use server';

// TL/Tim (crew) per trip — TIDAK bayar, disimpan TERPISAH dari trip_passengers
// supaya tidak mempengaruhi income/proyeksi/okupansi/seat. Passport diambil dari
// master TL (tour_leaders) via tl_id; bisa di-override manual per trip.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

function getSvc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createSvcClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const PASSPORT_FIELDS = ['gender', 'place_of_birth', 'birth_date', 'passport_no', 'passport_expiry', 'passport_issued_date', 'passport_issued_at'];

// Daftar crew trip + data passport final (override crew menang, fallback master TL).
export async function getTripCrew(tripId) {
  if (!tripId) return { crew: [] };
  const db = getSvc() || createClient();
  try {
    const { data: crew } = await db.from('trip_crew').select('*').eq('trip_id', tripId).order('id', { ascending: true });
    const rows = crew || [];
    const tlIds = [...new Set(rows.map((c) => c.tl_id).filter(Boolean))];
    let tlMap = {};
    if (tlIds.length) {
      const { data: tls } = await db.from('tour_leaders').select('*').in('id', tlIds);
      tlMap = Object.fromEntries((tls || []).map((t) => [t.id, t]));
    }
    const out = rows.map((c) => {
      const tl = c.tl_id ? (tlMap[c.tl_id] || {}) : {};
      const pick = (k) => (c[k] != null && String(c[k]).trim() !== '') ? c[k] : (tl[k] ?? null);
      return {
        id: c.id, trip_id: c.trip_id, tl_id: c.tl_id || null,
        role: c.role || 'Tour Leader', room_type: c.room_type || '', notes: c.notes || '',
        name: (c.name && c.name.trim()) || tl.name || '',
        phone: tl.phone || '',
        gender: pick('gender'), place_of_birth: pick('place_of_birth'), birth_date: pick('birth_date'),
        passport_no: pick('passport_no'), passport_expiry: pick('passport_expiry'),
        passport_issued_date: pick('passport_issued_date'), passport_issued_at: pick('passport_issued_at'),
        // true kalau crew ini terhubung master TL tapi master-nya belum ada paspor → perlu diisi
        masterPassportMissing: !!c.tl_id && !(tl.passport_no && String(tl.passport_no).trim()),
      };
    });
    return { crew: out };
  } catch (e) {
    return { crew: [], error: e?.message };
  }
}

export async function addTripCrew(tripId, payload = {}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = getSvc() || supabase;
  const row = {
    trip_id: tripId,
    tl_id: payload.tl_id ? Number(payload.tl_id) : null,
    name: (payload.name || '').trim() || null,
    role: (payload.role || 'Tour Leader').trim() || 'Tour Leader',
    room_type: (payload.room_type || '').trim() || null,
    notes: (payload.notes || '').trim() || null,
    created_by: user.email || null,
  };
  if (!row.tl_id && !row.name) return { error: 'Pilih TL dari master atau isi nama' };
  const { error } = await db.from('trip_crew').insert(row);
  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

export async function updateTripCrew(id, payload = {}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = getSvc() || supabase;
  const upd = {};
  if (payload.role !== undefined) upd.role = (payload.role || 'Tour Leader').trim() || 'Tour Leader';
  if (payload.room_type !== undefined) upd.room_type = (payload.room_type || '').trim() || null;
  if (payload.notes !== undefined) upd.notes = (payload.notes || '').trim() || null;
  if (payload.name !== undefined) upd.name = (payload.name || '').trim() || null;
  if (Object.keys(upd).length === 0) return { ok: true };
  const { error } = await db.from('trip_crew').update(upd).eq('id', id);
  if (error) return { error: error.message };
  if (payload.tripId) revalidatePath(`/trips/${payload.tripId}`);
  return { ok: true };
}

export async function removeTripCrew(id, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = getSvc() || supabase;
  const { error } = await db.from('trip_crew').delete().eq('id', id);
  if (error) return { error: error.message };
  if (tripId) revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

// Isi/lengkapi passport di MASTER TL (tour_leaders). Dipakai kalau master TL belum ada paspor;
// begitu diisi, semua trip yang assign TL ini otomatis ikut ke-sync (roomlist/manifest).
export async function updateTlPassport(tlId, payload = {}, tripId = null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!tlId) return { error: 'TL tidak valid' };
  const db = getSvc() || supabase;
  const upd = {};
  for (const k of PASSPORT_FIELDS) {
    if (payload[k] !== undefined) upd[k] = (payload[k] === '' ? null : payload[k]);
  }
  if (Object.keys(upd).length === 0) return { ok: true };
  const { error } = await db.from('tour_leaders').update(upd).eq('id', tlId);
  if (error) return { error: error.message };
  if (tripId) revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}
