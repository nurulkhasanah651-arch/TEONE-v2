'use server';

// Server Actions for trip participants
// A participant = customer record + trip_passengers link

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function addParticipant(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const first_name = (formData.get('first_name') || '').trim();
  const last_name = (formData.get('last_name') || '').trim();
  const fullName = `${first_name} ${last_name}`.trim();
  if (!fullName) return { error: 'Nama peserta wajib diisi' };

  const phone = (formData.get('phone') || '').trim() || null;
  const email = (formData.get('email') || '').trim() || null;
  const passport_no = (formData.get('passport_no') || '').trim() || null;
  const passport_expiry = formData.get('passport_expiry') || null;
  const room_type = formData.get('room_type') || null;
  const price_paid = parseInt(formData.get('price_paid')) || 0;

  // Step 1: insert customer
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .insert({
      name: fullName,
      phone,
      email,
      passport_no,
      passport_expiry,
    })
    .select('id')
    .single();

  if (cErr) return { error: 'Gagal simpan customer: ' + cErr.message };

  // Step 2: link customer to trip
  const { error: pErr } = await supabase.from('trip_passengers').insert({
    trip_id: tripId,
    customer_id: customer.id,
    room_type,
    price_paid,
    status: 'confirmed',
  });

  if (pErr) {
    // Rollback customer if link fails
    await supabase.from('customers').delete().eq('id', customer.id);
    return { error: 'Gagal link customer ke trip: ' + pErr.message };
  }

  // Update sold count on trip
  await recomputeTripSold(supabase, tripId);

  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/trips');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateParticipant(tripId, passengerId, customerId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const first_name = (formData.get('first_name') || '').trim();
  const last_name = (formData.get('last_name') || '').trim();
  const fullName = `${first_name} ${last_name}`.trim();
  if (!fullName) return { error: 'Nama peserta wajib diisi' };

  const customerUpdates = {
    name: fullName,
    phone: (formData.get('phone') || '').trim() || null,
    email: (formData.get('email') || '').trim() || null,
    passport_no: (formData.get('passport_no') || '').trim() || null,
    passport_expiry: formData.get('passport_expiry') || null,
  };

  const passengerUpdates = {
    room_type: formData.get('room_type') || null,
    price_paid: parseInt(formData.get('price_paid')) || 0,
  };

  const [cRes, pRes] = await Promise.all([
    supabase.from('customers').update(customerUpdates).eq('id', customerId),
    supabase.from('trip_passengers').update(passengerUpdates).eq('id', passengerId),
  ]);

  if (cRes.error) return { error: 'Gagal update customer: ' + cRes.error.message };
  if (pRes.error) return { error: 'Gagal update passenger: ' + pRes.error.message };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

export async function removeParticipant(tripId, passengerId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('trip_passengers').delete().eq('id', passengerId);
  if (error) return { error: error.message };

  await recomputeTripSold(supabase, tripId);

  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/trips');
  revalidatePath('/dashboard');
  return { ok: true };
}

async function recomputeTripSold(supabase, tripId) {
  const { count } = await supabase
    .from('trip_passengers')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId);

  const { data: trip } = await supabase.from('trips').select('quota').eq('id', tripId).single();
  const quota = trip?.quota || 0;

  await supabase
    .from('trips')
    .update({ sold: count || 0, seat_left: Math.max(quota - (count || 0), 0) })
    .eq('id', tripId);
}
