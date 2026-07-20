'use server';

// Round 72 trip actions:
// - Inherit Round 44 (price_breakdown + auto closed_at + auto deadline)
// - Tambah pnr + route field
// - Defensive retry kalau kolom belum di-migrate

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { generateTripId } from '@/lib/utils/id';

function parseTripFields(formData) {
  const tlIdRaw = formData.get('tl_id');
  const tl_id = tlIdRaw && !isNaN(parseInt(tlIdRaw)) ? parseInt(tlIdRaw) : null;

  // Parse price_breakdown JSON dari hidden field
  let price_breakdown = null;
  const bdRaw = formData.get('price_breakdown_json');
  if (bdRaw && typeof bdRaw === 'string') {
    try { price_breakdown = JSON.parse(bdRaw); } catch { price_breakdown = null; }
  }

  const status = formData.get('status') || 'prepare to sell';
  let closed_at = formData.get('closed_at') || null;
  if (['closed selling', 'completed'].includes(status) && !closed_at) {
    closed_at = new Date().toISOString().slice(0, 10);
  }

  const departure = formData.get('departure') || null;
  let deadline_close = formData.get('deadline_close') || null;
  if (departure && !deadline_close) {
    const d = new Date(departure);
    d.setDate(d.getDate() - 45);
    deadline_close = d.toISOString().slice(0, 10);
  }

  return {
    kode_trip: formData.get('kode_trip') || null,
    name: formData.get('name'),
    destination: formData.get('destination') || null,
    fee_category: formData.get('fee_category') || null,
    pic: formData.get('pic') || null,
    pic_email: formData.get('pic_email') || null,
    tl_id,
    tl_name: formData.get('tl_name') || null,
    ticket: formData.get('ticket') || 'FIT',
    status,
    quota: parseInt(formData.get('quota')) || 0,
    // Round 72: 'price' legacy field dihapus dari form.
    // Auto-compute = harga DBL (kamar dewasa standar) dari breakdown.
    // Kalau breakdown kosong, fallback ke 0.
    price: (price_breakdown && Number(price_breakdown.dbl)) || 0,
    departure,
    arrival: formData.get('arrival') || null,
    return_date: formData.get('arrival') || null,  // sinkron: web baca return_date
    deadline_close,
    publish_date: formData.get('publish_date') || null,
    closed_at,
    price_breakdown,
    pnr: (formData.get('pnr') || '').trim() || null,
    route: (formData.get('route') || '').trim() || null,
    notes: formData.get('notes') || null,
    ticket_status: formData.get('ticket_status') || 'pending',
    visa: formData.get('visa') || 'pending',
    manifest: formData.get('manifest') || 'pending',
    roomlist: formData.get('roomlist') || 'pending',
    payment: formData.get('payment') || 'belum',
    briefing_tl: formData.get('briefing_tl') || 'belum',
    visa_requirement: formData.get('visa_requirement') || null,
  };
}

function stripOptional(fields) {
  const out = { ...fields };
  delete out.tl_id;
  delete out.tl_phone;
  delete out.tl_email;
  delete out.publish_date;
  delete out.closed_at;
  delete out.price_breakdown;
  delete out.pnr;
  delete out.route;
  return out;
}

async function resolveTlContact(supabase, tl_id) {
  if (!tl_id) return {};
  try {
    const { data } = await supabase.from('tour_leaders').select('phone, email').eq('id', tl_id).maybeSingle();
    if (data) return { tl_phone: data.phone || null, tl_email: data.email || null };
  } catch {}
  return {};
}

export async function createTrip(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fields = parseTripFields(formData);
  if (!fields.name) return { error: 'Nama trip wajib diisi' };
  Object.assign(fields, await resolveTlContact(supabase, fields.tl_id));

  let trip_id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTripId();
    const { data: existing } = await supabase.from('trips').select('id').eq('id', candidate).maybeSingle();
    if (!existing) { trip_id = candidate; break; }
  }
  if (!trip_id) return { error: 'Failed to generate unique trip ID' };

  let payload = { id: trip_id, ...fields, sold: 0, seat_left: fields.quota };
  let { error } = await supabase.from('trips').insert(payload);

  if (error && /tl_id|tl_phone|tl_email|publish_date|closed_at|price_breakdown|pnr|route|return_date/.test(error.message)) {
    const stripped = stripOptional(fields);
    payload = { id: trip_id, ...stripped, sold: 0, seat_left: fields.quota };
    const retry = await supabase.from('trips').insert(payload);
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidatePath('/trips');
  revalidatePath('/dashboard');
  revalidatePath('/finance/cashflow');
  revalidatePath('/ads');
  redirect(`/trips/${trip_id}`);
}

export async function updateTrip(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fields = parseTripFields(formData);
  if (!fields.name) return { error: 'Nama trip wajib diisi' };
  Object.assign(fields, await resolveTlContact(supabase, fields.tl_id));

  const { data: current } = await supabase.from('trips').select('sold, tl_id').eq('id', tripId).single();
  const sold = current?.sold || 0;

  let updatePayload = { ...fields, seat_left: Math.max(fields.quota - sold, 0) };
  // Kalau TL berganti (atau dikosongkan), reset status konfirmasi supaya TL baru mulai fresh
  // & tidak terbawa status (approved/rejected) TL lama.
  const _tlChanged = String(fields.tl_id ?? '') !== String(current?.tl_id ?? '');
  if (_tlChanged) {
    updatePayload.tl_assignment_status = null;
    updatePayload.tl_assignment_token = null;
    updatePayload.tl_assignment_sent_at = null;
    updatePayload.tl_assignment_responded_at = null;
    updatePayload.tl_assignment_response_note = null;
  }
  // .select() supaya tahu berapa baris benar-benar berubah. Tanpa ini, UPDATE yang
  // ditolak RLS mengembalikan 0 baris TANPA error -> UI bilang "tersimpan" padahal tidak.
  let { data: updated, error } = await supabase.from('trips').update(updatePayload).eq('id', tripId).select('id');

  if (error && /tl_id|tl_phone|tl_email|publish_date|closed_at|price_breakdown|pnr|route|return_date/.test(error.message)) {
    const stripped = stripOptional(fields);
    updatePayload = { ...stripped, seat_left: Math.max(fields.quota - sold, 0) };
    const retry = await supabase.from('trips').update(updatePayload).eq('id', tripId).select('id');
    error = retry.error;
    updated = retry.data;
  }

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return { error: 'Perubahan tidak tersimpan — kamu tidak punya izin mengubah trip ini (PIC hanya bisa mengubah trip miliknya sendiri).' };
  }

  revalidatePath('/trips');
  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/dashboard');
  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath('/ads');
  redirect(`/trips/${tripId}`);
}

export async function deleteTrip(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('trips').delete().eq('id', tripId);
  if (error) return { error: error.message };

  revalidatePath('/trips');
  revalidatePath('/dashboard');
  redirect('/trips');
}

// Ganti PIC master trip — role owner/manager/accounting/ops/cs/pic (pic: hanya trip miliknya).
// Pakai service client supaya accounting/cs/ops (yang tak punya izin UPDATE trips via RLS) tetap bisa.
export async function changeTripPic(tripId, picName, picEmail) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const role = await resolveAuthoritativeRole(user);
  if (!['owner', 'manager', 'accounting', 'ops', 'cs', 'pic'].includes(role)) return { error: 'Akses ditolak untuk mengganti PIC.' };
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  const db = (url && key) ? createServiceClient(url, key, { auth: { persistSession: false } }) : auth;
  if (role === 'pic') {
    const { data: t } = await db.from('trips').select('pic_email').eq('id', tripId).maybeSingle();
    if (String(t?.pic_email || '').toLowerCase() !== String(user.email || '').toLowerCase()) {
      return { error: 'PIC hanya bisa mengganti PIC untuk trip miliknya sendiri.' };
    }
  }
  const { error } = await db.from('trips').update({ pic: picName || null, pic_email: picEmail || null }).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath('/trips'); revalidatePath(`/trips/${tripId}`); revalidatePath('/dashboard');
  return { ok: true };
}
