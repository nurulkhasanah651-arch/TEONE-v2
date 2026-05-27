'use server';

// Round 150 (v2): CS actions — simpan days_to_close (langsung dari input angka) + lead_source
// (sudah include R134 Passport AI + R133 DP bukti transfer)
// Path: lib/actions/cs.js

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseFields(formData) {
  return {
    trip_id: formData.get('trip_id'),
    tanggal: formData.get('tanggal'),
    from_instagram: parseInt(formData.get('from_instagram')) || 0,
    from_whatsapp: parseInt(formData.get('from_whatsapp')) || 0,
    from_offline: parseInt(formData.get('from_offline')) || 0,
    closing_alumni: parseInt(formData.get('closing_alumni')) || 0,
    closing_mitra: parseInt(formData.get('closing_mitra')) || 0,
    from_ads_meta: parseInt(formData.get('from_ads_meta')) || 0,
    from_ads_google: parseInt(formData.get('from_ads_google')) || 0,
    from_ads_tiktok: parseInt(formData.get('from_ads_tiktok')) || 0,
    jumlah_leads: parseInt(formData.get('jumlah_leads')) || 0,
    notes: formData.get('notes') || null,
  };
}

// R150 v2: parse days_to_close langsung dari input (string angka)
function parseDaysToClose(v) {
  if (v === '' || v == null) return null;
  const n = parseInt(v);
  if (isNaN(n) || n < 0 || n > 3650) return null;
  return n;
}

async function recomputeTripSold(supabase, trip_id) {
  const { count } = await supabase
    .from('trip_passengers')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', trip_id);
  const { data: t } = await supabase.from('trips').select('quota').eq('id', trip_id).single();
  const quota = t?.quota || 0;
  await supabase.from('trips')
    .update({ sold: count || 0, seat_left: Math.max(quota - (count || 0), 0) })
    .eq('id', trip_id);
}

function revalidateAll(trip_id) {
  revalidatePath('/cs');
  revalidatePath('/dashboard');
  revalidatePath('/invoices');
  if (trip_id) {
    revalidatePath(`/trips/${trip_id}`);
    revalidatePath(`/finance/cashflow/${trip_id}`);
    revalidatePath(`/finance/payments/${trip_id}`);
  }
  revalidatePath('/trips');
  revalidatePath('/finance');
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  revalidatePath('/visa');
  revalidatePath('/customers');
  revalidatePath('/ads');
}

async function createDPRequestForCS({ supabase, trip_id, passenger_id, customer_id, customer_name, customer_phone, trip_name, trip_kode, amount, payment_date, payment_method, dp_proof_url, requested_by }) {
  if (!amount || Number(amount) <= 0) return null;

  const payload = {
    trip_id, passenger_id,
    customer_id: customer_id || null,
    customer_name: customer_name || null,
    customer_phone: customer_phone || null,
    trip_name: trip_name || null,
    trip_kode: trip_kode || null,
    amount: Number(amount) || 0,
    payment_date: payment_date || new Date().toISOString().slice(0, 10),
    payment_method: payment_method || 'transfer',
    dp_proof_url: dp_proof_url || null,
    status: 'pending',
    notes: dp_proof_url
      ? 'Auto-submitted dari CS Daily form (bukti transfer terlampir)'
      : 'Auto-submitted dari CS Daily form (tanpa bukti)',
    requested_by,
  };

  let { data, error } = await supabase
    .from('dp_payment_requests').insert(payload).select('id').single();

  if (error && /dp_proof_url/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.dp_proof_url;
    const retry = await supabase
      .from('dp_payment_requests').insert(stripped).select('id').single();
    data = retry.data; error = retry.error;
  }

  if (error) { console.error('[DP request error]', error.message); return null; }
  return data?.id;
}

async function createFamiliesFromBatch({ supabase, trip_id, insertedPassengers, requested_by }) {
  const byName = {};
  for (const ip of insertedPassengers) {
    const fn = (ip.family_name || '').trim();
    if (!fn) continue;
    if (!byName[fn]) byName[fn] = [];
    byName[fn].push(ip);
  }

  const result = {};
  let created = 0;
  for (const [familyName, members] of Object.entries(byName)) {
    if (members.length === 0) continue;

    const head = members[0];

    const { data: fam, error: famErr } = await supabase
      .from('family_groups')
      .insert({
        trip_id, name: familyName,
        head_passenger_id: head.passenger_id,
        head_customer_id: head.customer_id,
        created_by: requested_by,
        notes: 'Auto-created dari CS Daily form',
      })
      .select('id').single();

    if (famErr) {
      console.error(`[family create error] ${familyName}:`, famErr.message);
      continue;
    }

    const familyId = fam.id;

    await supabase
      .from('trip_passengers')
      .update({ family_group_id: familyId, is_family_head: true })
      .eq('id', head.passenger_id);

    const memberIds = members.slice(1).map((m) => m.passenger_id).filter(Boolean);
    if (memberIds.length > 0) {
      await supabase
        .from('trip_passengers')
        .update({ family_group_id: familyId, is_family_head: false })
        .in('id', memberIds);
    }

    result[familyName] = { family_id: familyId, head_passenger_id: head.passenger_id };
    created++;
  }

  return { result, created };
}

function buildCustomerPayload(p, fullName, first, last) {
  const base = {
    name: fullName,
    first_name: first,
    surname: last || null,
    phone: p.phone?.trim() || null,
    whatsapp: p.phone?.trim() || null,
    email: p.email?.trim() || null,
  };

  if (p.passport_number) base.passport_number = String(p.passport_number).trim().toUpperCase();
  if (p.passport_expiry) base.passport_expiry = p.passport_expiry;
  if (p.passport_issued_at) base.passport_issued_at = p.passport_issued_at;
  if (p.passport_photo_url) base.passport_photo_url = p.passport_photo_url;
  if (p.nationality) base.nationality = p.nationality;
  if (p.dob) base.dob = p.dob;
  if (p.sex) base.sex = p.sex;
  if (p.place_of_birth) base.place_of_birth = p.place_of_birth;
  if (p.mrz_raw) base.mrz_raw = p.mrz_raw;

  return base;
}

async function insertCustomerDefensive(supabase, payload) {
  let { data, error } = await supabase
    .from('customers').insert(payload).select('id').single();

  if (error && /passport_|nationality|\bdob\b|\bsex\b|place_of_birth|mrz_raw/.test(error.message)) {
    const stripped = {
      name: payload.name, first_name: payload.first_name, surname: payload.surname,
      phone: payload.phone, whatsapp: payload.whatsapp, email: payload.email,
    };
    const retry = await supabase
      .from('customers').insert(stripped).select('id').single();
    data = retry.data; error = retry.error;
  }

  return { data, error };
}

// R150 v2: build passenger payload with optional days_to_close (langsung dari input) & lead_source
function buildPassengerPayload(p, trip_id, customer_id, closing_date) {
  const base = {
    trip_id, customer_id,
    room_type: p.room_type || null,
    price_paid: parseInt(p.price_paid) || 0,
    age_type: p.age_type || 'adult',
    status: 'confirmed',
  };

  // R150 v2: simpan days_to_close + closing_date (untuk grouping by month nanti)
  const dtc = parseDaysToClose(p.days_to_close);
  if (dtc != null) {
    base.days_to_close = dtc;
    base.closing_date = closing_date || new Date().toISOString().slice(0, 10);
  }
  if (p.source) base.lead_source = p.source;

  return base;
}

async function insertPassengerDefensive(supabase, payload) {
  let { data, error } = await supabase
    .from('trip_passengers').insert(payload).select('id').single();

  if (error && /(first_chat_date|closing_date|days_to_close|lead_source)/.test(error.message)) {
    // strip R150 columns and retry
    const stripped = { ...payload };
    delete stripped.first_chat_date;
    delete stripped.closing_date;
    delete stripped.days_to_close;
    delete stripped.lead_source;
    const retry = await supabase
      .from('trip_passengers').insert(stripped).select('id').single();
    data = retry.data; error = retry.error;
  }

  return { data, error };
}

export async function createCSUpdate(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseFields(formData);
  if (!f.trip_id) return { error: 'Trip harus dipilih' };
  if (!f.tanggal) return { error: 'Tanggal harus diisi' };

  const total_terjual_hari_ini =
    f.from_instagram + f.from_whatsapp + f.from_offline + f.closing_alumni + f.closing_mitra
    + f.from_ads_meta + f.from_ads_google + f.from_ads_tiktok;

  const { data: tripData } = await authClient
    .from('trips').select('quota, sold, seat_left, name, kode_trip')
    .eq('id', f.trip_id).maybeSingle();
  const sisa_seat = tripData?.seat_left ?? Math.max((tripData?.quota || 0) - (tripData?.sold || 0), 0);
  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    trip_id: f.trip_id, tanggal: f.tanggal, total_terjual_hari_ini,
    from_instagram: f.from_instagram, from_whatsapp: f.from_whatsapp,
    from_offline: f.from_offline, closing_alumni: f.closing_alumni,
    closing_mitra: f.closing_mitra, from_ads_meta: f.from_ads_meta,
    from_ads_google: f.from_ads_google, from_ads_tiktok: f.from_ads_tiktok,
    jumlah_leads: f.jumlah_leads, sisa_seat, notes: f.notes, updated_by,
  };

  let { error: csErr } = await authClient.from('cs_daily_updates').insert(payload);
  if (csErr && /from_ads_/.test(csErr.message)) {
    const stripped = { ...payload };
    delete stripped.from_ads_meta;
    delete stripped.from_ads_google;
    delete stripped.from_ads_tiktok;
    const retry = await authClient.from('cs_daily_updates').insert(stripped);
    csErr = retry.error;
  }
  if (csErr) return { error: 'Gagal simpan CS update: ' + csErr.message };

  const participantsRaw = formData.get('participants');
  let participants = [];
  if (participantsRaw && typeof participantsRaw === 'string' && participantsRaw.length > 2) {
    try { participants = JSON.parse(participantsRaw); } catch (e) {
      return { error: 'Format peserta tidak valid: ' + e.message };
    }
  }

  const supabase = getServiceClient() || authClient;
  const insertErrors = [];
  let insertedCount = 0;
  let dpRequestsCount = 0;
  let passportCount = 0;
  let chatTrackedCount = 0;
  const insertedPassengers = [];

  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];
    const first = (p.first_name || '').trim();
    const last = (p.last_name || '').trim();
    const fullName = `${first} ${last}`.trim();
    if (!fullName) continue;

    const customerPayload = buildCustomerPayload(p, fullName, first, last);
    const { data: customer, error: cErr } = await insertCustomerDefensive(supabase, customerPayload);

    if (cErr || !customer) {
      insertErrors.push(`Peserta #${idx + 1} (${fullName}): ${cErr?.message || 'customer error'}`);
      continue;
    }
    if (p.passport_photo_url) passportCount++;

    // R150: passenger with time-to-close fields
    const passengerPayload = buildPassengerPayload(p, f.trip_id, customer.id, f.tanggal);
    const { data: passenger, error: pErr } = await insertPassengerDefensive(supabase, passengerPayload);

    if (pErr) {
      await supabase.from('customers').delete().eq('id', customer.id);
      insertErrors.push(`Peserta #${idx + 1} (${fullName}): ${pErr.message}`);
      continue;
    }
    insertedCount++;
    if (parseDaysToClose(p.days_to_close) != null) chatTrackedCount++;

    insertedPassengers.push({
      passenger_id: passenger.id,
      customer_id: customer.id,
      name: fullName,
      phone: p.phone?.trim() || null,
      family_name: (p.family_name || '').trim(),
    });

    const dpAmount = parseInt(p.dp_amount) || 0;
    if (dpAmount > 0) {
      const dpId = await createDPRequestForCS({
        supabase, trip_id: f.trip_id,
        passenger_id: passenger.id, customer_id: customer.id,
        customer_name: fullName, customer_phone: p.phone?.trim() || null,
        trip_name: tripData?.name || null, trip_kode: tripData?.kode_trip || null,
        amount: dpAmount, payment_date: p.dp_date, payment_method: p.dp_method,
        dp_proof_url: p.dp_proof_url || null,
        requested_by: updated_by,
      });
      if (dpId) dpRequestsCount++;
    }
  }

  let familiesCreated = 0;
  if (insertedPassengers.some((ip) => ip.family_name)) {
    const famResult = await createFamiliesFromBatch({
      supabase, trip_id: f.trip_id,
      insertedPassengers, requested_by: updated_by,
    });
    familiesCreated = famResult.created;
  }

  if (insertedCount > 0) await recomputeTripSold(supabase, f.trip_id);

  if (insertErrors.length > 0) {
    return { error: `CS update tersimpan, tapi ${insertErrors.length} peserta gagal:\n${insertErrors.join('\n')}` };
  }

  revalidateAll(f.trip_id);
  redirect('/cs');
}

export async function updateCSUpdate(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseFields(formData);
  const total_terjual_hari_ini =
    f.from_instagram + f.from_whatsapp + f.from_offline + f.closing_alumni + f.closing_mitra
    + f.from_ads_meta + f.from_ads_google + f.from_ads_tiktok;

  const updatePayload = {
    tanggal: f.tanggal, total_terjual_hari_ini,
    from_instagram: f.from_instagram, from_whatsapp: f.from_whatsapp,
    from_offline: f.from_offline, closing_alumni: f.closing_alumni,
    closing_mitra: f.closing_mitra, from_ads_meta: f.from_ads_meta,
    from_ads_google: f.from_ads_google, from_ads_tiktok: f.from_ads_tiktok,
    jumlah_leads: f.jumlah_leads, notes: f.notes,
  };

  let { error } = await supabase.from('cs_daily_updates').update(updatePayload).eq('id', id);
  if (error && /from_ads_/.test(error.message)) {
    const stripped = { ...updatePayload };
    delete stripped.from_ads_meta;
    delete stripped.from_ads_google;
    delete stripped.from_ads_tiktok;
    const retry = await supabase.from('cs_daily_updates').update(stripped).eq('id', id);
    error = retry.error;
  }
  if (error) return { error: error.message };

  revalidateAll(f.trip_id);
  return { ok: true };
}

export async function deleteCSUpdate(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: csRow } = await supabase.from('cs_daily_updates').select('trip_id').eq('id', id).maybeSingle();
  const { error } = await supabase.from('cs_daily_updates').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidateAll(csRow?.trip_id);
  return { ok: true };
}

// addParticipantsToCS — also pass passport + dp_proof + time-to-close (R150)
export async function addParticipantsToCS(tripId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const raw = formData.get('participants');
  if (!raw) return { error: 'No participants data' };

  let arr;
  try { arr = JSON.parse(raw); } catch (e) {
    return { error: 'Format peserta tidak valid: ' + e.message };
  }
  if (!Array.isArray(arr) || arr.length === 0) return { error: 'List peserta kosong' };

  const supabase = getServiceClient() || authClient;
  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';
  const closingDateFallback = new Date().toISOString().slice(0, 10);

  const { data: tripData } = await supabase
    .from('trips').select('name, kode_trip').eq('id', tripId).maybeSingle();

  let inserted = 0;
  let dpRequests = 0;
  let passportCount = 0;
  let chatTrackedCount = 0;
  const errors = [];
  const insertedPassengers = [];

  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    const first = (p.first_name || '').trim();
    const last = (p.last_name || '').trim();
    const fullName = `${first} ${last}`.trim();
    if (!fullName) continue;

    const customerPayload = buildCustomerPayload(p, fullName, first, last);
    const { data: customer, error: cErr } = await insertCustomerDefensive(supabase, customerPayload);

    if (cErr || !customer) {
      errors.push(`#${i + 1} (${fullName}): ${cErr?.message || 'customer error'}`);
      continue;
    }
    if (p.passport_photo_url) passportCount++;

    const passengerPayload = buildPassengerPayload(p, tripId, customer.id, closingDateFallback);
    const { data: passenger, error: pErr } = await insertPassengerDefensive(supabase, passengerPayload);

    if (pErr) {
      await supabase.from('customers').delete().eq('id', customer.id);
      errors.push(`#${i + 1} (${fullName}): ${pErr.message}`);
      continue;
    }
    inserted++;
    if (parseDaysToClose(p.days_to_close) != null) chatTrackedCount++;

    insertedPassengers.push({
      passenger_id: passenger.id,
      customer_id: customer.id,
      name: fullName,
      phone: p.phone?.trim() || null,
      family_name: (p.family_name || '').trim(),
    });

    const dpAmount = parseInt(p.dp_amount) || 0;
    if (dpAmount > 0) {
      const dpId = await createDPRequestForCS({
        supabase, trip_id: tripId,
        passenger_id: passenger.id, customer_id: customer.id,
        customer_name: fullName, customer_phone: p.phone?.trim() || null,
        trip_name: tripData?.name || null, trip_kode: tripData?.kode_trip || null,
        amount: dpAmount, payment_date: p.dp_date, payment_method: p.dp_method,
        dp_proof_url: p.dp_proof_url || null,
        requested_by: updated_by,
      });
      if (dpId) dpRequests++;
    }
  }

  let familiesCreated = 0;
  if (insertedPassengers.some((ip) => ip.family_name)) {
    const famResult = await createFamiliesFromBatch({
      supabase, trip_id: tripId,
      insertedPassengers, requested_by: updated_by,
    });
    familiesCreated = famResult.created;
  }

  if (inserted > 0) await recomputeTripSold(supabase, tripId);

  revalidateAll(tripId);

  if (errors.length > 0) {
    return { error: errors.join('\n'), inserted, dp_requests: dpRequests, passport_uploads: passportCount, families_created: familiesCreated, chat_tracked: chatTrackedCount };
  }
  return { ok: true, inserted, dp_requests: dpRequests, passport_uploads: passportCount, families_created: familiesCreated, chat_tracked: chatTrackedCount };
}

export async function updateParticipantRoomFromCS(tripId, passengerId, customerId, newRoom) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_passengers').update({ room_type: newRoom || null }).eq('id', passengerId);
  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

export async function removeParticipantFromCS(tripId, passengerId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('trip_passengers').delete().eq('id', passengerId);
  if (error) return { error: error.message };

  const { count } = await supabase
    .from('trip_passengers').select('id', { count: 'exact', head: true }).eq('trip_id', tripId);
  const { data: t } = await supabase.from('trips').select('quota').eq('id', tripId).single();
  const quota = t?.quota || 0;
  await supabase.from('trips')
    .update({ sold: count || 0, seat_left: Math.max(quota - (count || 0), 0) })
    .eq('id', tripId);

  revalidateAll(tripId);
  return { ok: true };
}
