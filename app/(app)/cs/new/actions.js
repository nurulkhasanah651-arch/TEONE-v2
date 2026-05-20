'use server';

// Server Actions for trip CRUD operations

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { generateTripId } from '@/lib/utils/id';

function parseTripFields(formData) {
  return {
    kode_trip: formData.get('kode_trip') || null,
    name: formData.get('name'),
    destination: formData.get('destination') || null,
    pic: formData.get('pic') || null,
    tl_name: formData.get('tl_name') || null,
    ticket: formData.get('ticket') || 'FIT',
    status: formData.get('status') || 'prepare to sell',
    quota: parseInt(formData.get('quota')) || 0,
    price: parseInt(formData.get('price')) || 0,
    departure: formData.get('departure') || null,
    arrival: formData.get('arrival') || null,
    deadline_close: formData.get('deadline_close') || null,
    notes: formData.get('notes') || null,
  };
}

export async function createTrip(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fields = parseTripFields(formData);
  if (!fields.name) return { error: 'Nama trip wajib diisi' };

  // Generate unique trip ID (6-char hex matching v1 format)
  let trip_id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTripId();
    const { data: existing } = await supabase.from('trips').select('id').eq('id', candidate).maybeSingle();
    if (!existing) { trip_id = candidate; break; }
  }
  if (!trip_id) return { error: 'Failed to generate unique trip ID, please try again' };

  const { error } = await supabase.from('trips').insert({
    id: trip_id,
    ...fields,
    sold: 0,
    seat_left: fields.quota,
  });

  if (error) return { error: error.message };

  revalidatePath('/trips');
  revalidatePath('/dashboard');
  redirect(`/trips/${trip_id}`);
}

export async function updateTrip(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fields = parseTripFields(formData);
  if (!fields.name) return { error: 'Nama trip wajib diisi' };

  // Recompute seat_left if quota changed
  const { data: current } = await supabase.from('trips').select('sold').eq('id', tripId).single();
  const sold = current?.sold || 0;

  const { error } = await supabase
    .from('trips')
    .update({
      ...fields,
      seat_left: Math.max(fields.quota - sold, 0),
    })
    .eq('id', tripId);

  if (error) return { error: error.message };

  revalidatePath('/trips');
  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/dashboard');
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
