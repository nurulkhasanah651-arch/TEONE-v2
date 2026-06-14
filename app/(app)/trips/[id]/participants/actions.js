'use server';

// Round 81: Participant actions — auto-sync ke /finance/cashflow + /finance/payments
// Saat edit/hapus peserta → income projection & payment checklist refresh otomatis

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { mainExpectedPerPassenger } from '@/lib/utils/price-breakdown';

function parseParticipantFields(formData) {
  const first_name = (formData.get('first_name') || '').trim();
  const last_name = (formData.get('last_name') || '').trim();
  const fullName = `${first_name} ${last_name}`.trim();
  return {
    first_name,
    last_name,
    fullName,
    phone: (formData.get('phone') || '').trim() || null,
    email: (formData.get('email') || '').trim() || null,
    birthday: formData.get('birthday') || null,
    city: (formData.get('city') || '').trim() || null,
    gender: formData.get('gender') || null,
    passport_no: (formData.get('passport_no') || '').trim() || null,
    passport_issued_at: (formData.get('passport_issued_at') || '').trim() || null,
    passport_issued_date: formData.get('passport_issued_date') || null,
    passport_expiry: formData.get('passport_expiry') || null,
    room_type: formData.get('room_type') || null,
    price_paid: parseInt(formData.get('price_paid')) || 0,
    age_type: formData.get('age_type') || 'adult',
  };
}

function revalidateAllRelated(tripId) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/trips');
  revalidatePath('/dashboard');
  // Round 81: sync finance + payment checklist
  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance');
  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  revalidatePath('/visa');
}

// Auto-hitung harga pokok per peserta dari price_breakdown trip (sama seperti checkout web).
// Dipakai kalau admin tidak mengisi "Harga Bayar" manual.
async function autoPricePaid(supabase, tripId, room_type, age_type) {
  try {
    const { data: trip } = await supabase.from('trips').select('price_breakdown').eq('id', tripId).maybeSingle();
    const bd = (trip?.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};
    return mainExpectedPerPassenger({ room_type, age_type }, bd) || 0;
  } catch { return 0; }
}

export async function addParticipant(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseParticipantFields(formData);
  if (!f.fullName) return { error: 'Nama peserta wajib diisi' };

  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .insert({
      name: f.fullName,
      first_name: f.first_name,
      surname: f.last_name || null,
      phone: f.phone,
      whatsapp: f.phone,
      email: f.email,
      birthday: f.birthday,
      city: f.city,
      gender: f.gender,
      passport_no: f.passport_no,
      passport_issued_at: f.passport_issued_at,
      passport_issued_date: f.passport_issued_date,
      passport_expiry: f.passport_expiry,
    })
    .select('id')
    .single();

  if (cErr) return { error: 'Gagal simpan customer: ' + cErr.message };

  // Auto-isi harga dari tipe kamar + harga trip kalau dikosongkan
  const pricePaid = f.price_paid > 0 ? f.price_paid : await autoPricePaid(supabase, tripId, f.room_type, f.age_type);

  const { error: pErr } = await supabase.from('trip_passengers').insert({
    trip_id: tripId,
    customer_id: customer.id,
    room_type: f.room_type,
    price_paid: pricePaid,
    age_type: f.age_type,
    status: 'confirmed',
  });

  if (pErr) {
    await supabase.from('customers').delete().eq('id', customer.id);
    return { error: 'Gagal link customer ke trip: ' + pErr.message };
  }

  await recomputeTripSold(supabase, tripId);
  revalidateAllRelated(tripId);
  return { ok: true };
}

export async function updateParticipant(tripId, passengerId, customerId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseParticipantFields(formData);
  if (!f.fullName) return { error: 'Nama peserta wajib diisi' };

  const customerUpdates = {
    name: f.fullName,
    first_name: f.first_name,
    surname: f.last_name || null,
    phone: f.phone,
    whatsapp: f.phone,
    email: f.email,
    birthday: f.birthday,
    city: f.city,
    gender: f.gender,
    passport_no: f.passport_no,
    passport_issued_at: f.passport_issued_at,
    passport_issued_date: f.passport_issued_date,
    passport_expiry: f.passport_expiry,
  };

  const passengerUpdates = {
    room_type: f.room_type,
    price_paid: f.price_paid > 0 ? f.price_paid : await autoPricePaid(supabase, tripId, f.room_type, f.age_type),
    age_type: f.age_type,
  };

  const [cRes, pRes] = await Promise.all([
    supabase.from('customers').update(customerUpdates).eq('id', customerId),
    supabase.from('trip_passengers').update(passengerUpdates).eq('id', passengerId),
  ]);

  if (cRes.error) return { error: 'Gagal update customer: ' + cRes.error.message };
  if (pRes.error) return { error: 'Gagal update passenger: ' + pRes.error.message };

  revalidateAllRelated(tripId);
  return { ok: true };
}

export async function removeParticipant(tripId, passengerId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('trip_passengers').delete().eq('id', passengerId);
  if (error) return { error: error.message };

  await recomputeTripSold(supabase, tripId);
  revalidateAllRelated(tripId);
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
