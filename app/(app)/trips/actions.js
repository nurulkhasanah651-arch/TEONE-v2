'use server';

// Server Actions for trip CRUD
// Round 42 final: tl_id + publish_date + closed_at — semua defensive

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { generateTripId } from '@/lib/utils/id';

function parseTripFields(formData) {
  const tlIdRaw = formData.get('tl_id');
  const tl_id = tlIdRaw && !isNaN(parseInt(tlIdRaw)) ? parseInt(tlIdRaw) : null;

  return {
    kode_trip: formData.get('kode_trip') || null,
    name: formData.get('name'),
    destination: formData.get('destination') || null,
    pic: formData.get('pic') || null,
    tl_id,
    tl_name: formData.get('tl_name') || null,
    ticket: formData.get('ticket') || 'FIT',
    status: formData.get('status') || 'prepare to sell',
    quota: parseInt(formData.get('quota')) || 0,
    price: parseInt(formData.get('price')) || 0,
    departure: formData.get('departure') || null,
    arrival: formData.get('arrival') || null,
    deadline_close: formData.get('deadline_close') || null,
    publish_date: formData.get('publish_date') || null,
    closed_at: formData.get('closed_at') || null,
    notes: formData.get('notes') || null,
    ticket_status: formData.get('ticket_status') || 'pending',
    visa: formData.get('visa') || 'pending',
    manifest: formData.get('manifest') || 'pending',
    roomlist: formData.get('roomlist') || 'pending',
    payment: formData.get('payment') || 'belum',
    briefing_tl: formData.get('briefing_tl') || 'belum',
  };
}

function stripOptionalCols(fields) {
  const out = { ...fields };
  delete out.tl_id;
  delete out.publish_date;
  delete out.closed_at;
  return out;
}

export async function createTrip(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fields = parseTripFields(formData);
  if (!fields.name) return { error: 'Nama trip wajib diisi' };

  let trip_id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTripId();
    const { data: existing } = await supabase.from('trips').select('id').eq('id', candidate).maybeSingle();
    if (!existing) { trip_id = candidate; break; }
  }
  if (!trip_id) return { error: 'Failed to generate unique trip ID' };

  let payload = { id: trip_id, ...fields, sold: 0, seat_left: fields.quota };

  let { error } = await supabase.from('trips').insert(payload);

  // Defensive: kalau ada kolom yang belum di-migrate, retry tanpa kolom opsional
  if (error && /tl_id|publish_date|closed_at/.test(error.message)) {
    const stripped = stripOptionalCols(fields);
    payload = { id: trip_id, ...stripped, sold: 0, seat_left: fields.quota };
    const retry = await supabase.from('trips').insert(payload);
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidatePath('/trips');
  revalidatePath('/dashboard');
  revalidatePath('/ads');
  redirect(`/trips/${trip_id}`);
}

export async function updateTrip(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fields = parseTripFields(formData);
  if (!fields.name) return { error: 'Nama trip wajib diisi' };

  const { data: current } = await supabase.from('trips').select('sold').eq('id', tripId).single();
  const sold = current?.sold || 0;

  let updatePayload = { ...fields, seat_left: Math.max(fields.quota - sold, 0) };
  let { error } = await supabase.from('trips').update(updatePayload).eq('id', tripId);

  if (error && /tl_id|publish_date|closed_at/.test(error.message)) {
    const stripped = stripOptionalCols(fields);
    updatePayload = { ...stripped, seat_left: Math.max(fields.quota - sold, 0) };
    const retry = await supabase.from('trips').update(updatePayload).eq('id', tripId);
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidatePath('/trips');
  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/dashboard');
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
