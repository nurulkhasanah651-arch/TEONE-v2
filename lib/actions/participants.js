'use server';

// Round 167: Participants actions — FIX revalidate passport-manage + add R134 passport fields
// Path: lib/actions/participants.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { normalizeAgeType, mainExpectedPerPassenger } from '@/lib/utils/price-breakdown';
import { currentBrandCode } from '@/lib/supabase/service-env';

// price_paid = HARGA PAKET, dihitung sistem dari price_breakdown trip.
// Field "Harga Bayar" sudah DIBUANG dari semua form: dulu CS sering mengisinya
// dgn nominal DP -> invoice menganggap tagihan = uang yg sudah masuk -> 'LUNAS' palsu.
// Balikan 0 bila harga trip belum diisi -> pemanggil TIDAK menyentuh price_paid
// (jangan menimpa nilai lama dgn 0).
async function hitungHargaPaket(supabase, tripId, room_type, age_type) {
  try {
    const { data: t } = await supabase.from('trips').select('price_breakdown').eq('id', tripId).maybeSingle();
    const bd = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
    let brand = ''; try { brand = currentBrandCode(); } catch {}
    return Number(mainExpectedPerPassenger({ room_type, age_type }, bd, brand)) || 0;
  } catch { return 0; }
}

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

    // Legacy passport fields (still supported)
    passport_no: (formData.get('passport_no') || '').trim() || null,
    passport_issued_at: (formData.get('passport_issued_at') || '').trim() || null,
    passport_issued_date: formData.get('passport_issued_date') || null,
    passport_expiry: formData.get('passport_expiry') || null,

    // R134/R167: New passport AI fields
    passport_number: (formData.get('passport_number') || '').trim() || null,
    passport_photo_url: (formData.get('passport_photo_url') || '').trim() || null,
    passport_surname: (formData.get('passport_surname') || '').trim() || null,
    passport_given_names: (formData.get('passport_given_names') || '').trim() || null,
    nationality: (formData.get('nationality') || '').trim() || null,
    dob: formData.get('dob') || null,
    sex: (formData.get('sex') || '').trim() || null,
    place_of_birth: (formData.get('place_of_birth') || '').trim() || null,
    mrz_raw: (formData.get('mrz_raw') || '').trim() || null,

    room_type: formData.get('room_type') || null,
    price_paid: parseInt(formData.get('price_paid')) || 0,
    age_type: normalizeAgeType(formData.get('age_type'), formData.get('room_type')),
    include_visa: (formData.get('visa_choice') || '') === 'include',
    visa_ready: (formData.get('visa_choice') || '') === 'ready',
    visa_type: (formData.get('visa_type') || '').trim() || null,
    mitra_id: parseInt(formData.get('mitra_id')) || null,
    include_asuransi: (formData.get('include_asuransi') || '') === '1',
    // Catatan / permintaan khusus peserta (halal meals, kursi roda, dsb) → ikut ke manifest
    notes: (formData.get('notes') || '').trim() || null,
  };
}

// R167: revalidate semua path yang relevan termasuk passport-manage
function revalidateAllRelated(tripId) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath('/trips');
  revalidatePath('/dashboard');

  // Finance + payment checklist (R81)
  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance');
  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  revalidatePath('/visa');

  // R167: Passport pages — yang sebelumnya kelewat
  revalidatePath(`/trips/${tripId}/passport-manage`);
  revalidatePath(`/trips/${tripId}/passport-ai`);
  revalidatePath('/passport-manage');
  revalidatePath(`/passport-manage/${tripId}`);
  revalidatePath('/customers');
}

// R167: Build customer payload defensive — strip field yg gak ada di schema
function buildCustomerPayload(f) {
  const base = {
    name: f.fullName,
    first_name: f.first_name,
    surname: f.last_name || null,
    phone: f.phone,
    whatsapp: f.phone,
    email: f.email,
    birthday: f.birthday,
    city: f.city,
    gender: f.gender,
  };

  // Legacy passport fields
  if (f.passport_no) base.passport_no = f.passport_no;
  if (f.passport_issued_at) base.passport_issued_at = f.passport_issued_at;
  if (f.passport_issued_date) base.passport_issued_date = f.passport_issued_date;
  if (f.passport_expiry) base.passport_expiry = f.passport_expiry;

  // R134 passport fields
  if (f.passport_number) base.passport_number = String(f.passport_number).toUpperCase();
  if (f.passport_photo_url) base.passport_photo_url = f.passport_photo_url;
  if (f.nationality) base.nationality = f.nationality;
  if (f.dob) base.dob = f.dob;
  if (f.sex) base.sex = f.sex;
  if (f.place_of_birth) base.place_of_birth = f.place_of_birth;
  if (f.mrz_raw) base.mrz_raw = f.mrz_raw;

  return base;
}

// R167: Defensive update — kalau ada kolom yg gak exist, strip & retry
async function updateCustomerDefensive(supabase, customerId, payload) {
  let { error } = await supabase.from('customers').update(payload).eq('id', customerId);

  if (error && /passport_number|passport_photo_url|nationality|\bdob\b|\bsex\b|place_of_birth|mrz_raw|passport_no|passport_issued/.test(error.message)) {
    // Strip optional passport fields
    const stripped = {
      name: payload.name,
      first_name: payload.first_name,
      surname: payload.surname,
      phone: payload.phone,
      whatsapp: payload.whatsapp,
      email: payload.email,
      birthday: payload.birthday,
      city: payload.city,
      gender: payload.gender,
    };
    const retry = await supabase.from('customers').update(stripped).eq('id', customerId);
    error = retry.error;
  }

  return { error };
}

export async function addParticipant(tripId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseParticipantFields(formData);
  if (!f.fullName) return { error: 'Nama peserta wajib diisi' };

  const supabase = getServiceClient() || authClient;
  const customerPayload = buildCustomerPayload(f);

  // Try with full payload first, fallback strip if schema missing
  let { data: customer, error: cErr } = await supabase
    .from('customers').insert(customerPayload).select('id').single();

  if (cErr && /passport_number|passport_photo_url|nationality|\bdob\b|\bsex\b|place_of_birth|mrz_raw/.test(cErr.message)) {
    const stripped = {
      name: customerPayload.name, first_name: customerPayload.first_name,
      surname: customerPayload.surname, phone: customerPayload.phone,
      whatsapp: customerPayload.whatsapp, email: customerPayload.email,
      birthday: customerPayload.birthday, city: customerPayload.city, gender: customerPayload.gender,
    };
    const retry = await supabase.from('customers').insert(stripped).select('id').single();
    customer = retry.data; cErr = retry.error;
  }

  if (cErr) return { error: 'Gagal simpan customer: ' + cErr.message };

  const _hargaBaru = await hitungHargaPaket(supabase, tripId, f.room_type, f.age_type);
  const { error: pErr } = await supabase.from('trip_passengers').insert({
    trip_id: tripId,
    customer_id: customer.id,
    room_type: f.room_type,
    price_paid: _hargaBaru > 0 ? _hargaBaru : f.price_paid,
    age_type: f.age_type,
    visa_type: f.visa_type,
    mitra_id: f.mitra_id,
    lead_source: 'master',  // ditambah via Master Trip -> BUKAN closing CS
    status: 'confirmed',
    notes: f.notes,
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
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseParticipantFields(formData);
  if (!f.fullName) return { error: 'Nama peserta wajib diisi' };

  const supabase = getServiceClient() || authClient;
  const customerPayload = buildCustomerPayload(f);

  const _hargaPaket = await hitungHargaPaket(supabase, tripId, f.room_type, f.age_type);
  const passengerUpdates = {
    room_type: f.room_type,
    age_type: f.age_type,
    include_visa: f.include_visa,
    visa_ready: f.visa_ready,
    include_asuransi: f.include_asuransi,
    visa_type: f.visa_type,
    mitra_id: f.mitra_id,
    notes: f.notes,
  };
  // Harga paket ikut tipe kamar. Kalau harga trip belum diisi (hasil 0), jangan disentuh.
  if (_hargaPaket > 0) passengerUpdates.price_paid = _hargaPaket;

  // Centang "sudah dicek CS". Hanya disentuh bila form memang mengirimnya,
  // supaya form peserta lain yg tak punya field ini tidak menghapus statusnya.
  const rawVerified = formData.get('passport_verified');
  if (rawVerified !== null) {
    const v = rawVerified === 'true' || rawVerified === 'on' || rawVerified === '1';
    passengerUpdates.passport_verified = v;
    passengerUpdates.passport_verified_at = v ? new Date().toISOString() : null;
    passengerUpdates.passport_verified_by = v ? (user.email || null) : null;
  }

  const [cRes, pRes] = await Promise.all([
    updateCustomerDefensive(supabase, customerId, customerPayload),
    supabase.from('trip_passengers').update(passengerUpdates).eq('id', passengerId),
  ]);

  if (cRes.error) return { error: 'Gagal update customer: ' + cRes.error.message };
  if (pRes.error) return { error: 'Gagal update passenger: ' + pRes.error.message };

  revalidateAllRelated(tripId);
  return { ok: true };
}

export async function removeParticipant(tripId, passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

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
