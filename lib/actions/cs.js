'use server';

// Round 135 HOTFIX 2: CS actions — passport name FALLBACK
// Kalau Nama Depan/Belakang kosong tapi passport surname/given_names ada → auto-pakai
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
}

function safeDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return str;
}

// HOTFIX 2: resolve nama dari first_name/last_name ATAU passport fallback
function resolveName(p) {
  // Priority 1: Nama Depan + Nama Belakang (manual input)
  let first = (p.first_name || '').trim();
  let last = (p.last_name || '').trim();

  // Priority 2: kalau kosong, pakai passport given_names + surname
  if (!first && p.passport_given_names) first = String(p.passport_given_names).trim();
  if (!last && p.passport_surname) last = String(p.passport_surname).trim();

  // Priority 3: kalau still empty, split full name from passport (1 word)
  if (!first && !last && p.passport_given_names) {
    const full = String(p.passport_given_names).trim();
    const parts = full.split(/\s+/);
    if (parts.length === 1) {
      first = parts[0];
    } else {
      first = parts.slice(0, -1).join(' ');
      last = parts[parts.length - 1];
    }
  }

  const fullName = `${first} ${last}`.trim();
  return { first, last, fullName };
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

  if (p.passport_number) base.passport_number = String(p.passport_number).trim().toUpperCase().substring(0, 30);
  if (p.passport_expiry) {
    const d = safeDate(p.passport_expiry);
    if (d) base.passport_expiry = d;
  }
  if (p.passport_issued_at) base.passport_issued_at = String(p.passport_issued_at).substring(0, 100);
  if (p.passport_photo_url) base.passport_photo_url = p.passport_photo_url;
  if (p.nationality) base.nationality = String(p.nationality).substring(0, 100);
  if (p.dob) {
    const d = safeDate(p.dob);
    if (d) base.dob = d;
  }
  if (p.sex) base.sex = String(p.sex).substring(0, 5);
  if (p.place_of_birth) base.place_of_birth = String(p.place_of_birth).substring(0, 100);
  if (p.mrz_raw) base.mrz_raw = String(p.mrz_raw).substring(0, 500);

  return base;
}

async function insertCustomerDefensive(supabase, payload) {
  let r = await supabase.from('customers').insert(payload).select('id').single();
  if (!r.error) return r;
  console.error('[customer insert attempt 1]', r.error.message);

  const stripped2 = {
    name: payload.name, first_name: payload.first_name, surname: payload.surname,
    phone: payload.phone, whatsapp: payload.whatsapp, email: payload.email,
  };
  r = await supabase.from('customers').insert(stripped2).select('id').single();
  if (!r.error) return r;
  console.error('[customer insert attempt 2]', r.error.message);

  const stripped3 = { name: payload.name };
  r = await supabase.from('customers').insert(stripped3).select('id').single();
  if (!r.error) return r;
  console.error('[customer insert attempt 3]', r.error.message);

  return r;
}

async function insertPassengerDefensive(supabase, payload) {
  let r = await supabase.from('trip_passengers').insert(payload).select('id').single();
  if (!r.error) return r;
  console.error('[passenger insert attempt 1]', r.error.message);

  const stripped = { ...payload };
  delete stripped.cs_update_id;
  r = await supabase.from('trip_passengers').insert(stripped).select('id').single();
  if (!r.error) return r;
  console.error('[passenger insert attempt 2]', r.error.message);

  return r;
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
    payment_date: safeDate(payment_date) || new Date().toISOString().slice(0, 10),
    payment_method: payment_method || 'transfer',
    dp_proof_url: dp_proof_url || null,
    status: 'pending',
    notes: dp_proof_url ? 'Auto-submitted dari CS Daily (bukti terlampir)' : 'Auto-submitted dari CS Daily',
    requested_by,
  };

  let r = await supabase.from('dp_payment_requests').insert(payload).select('id').single();
  if (r.error && /dp_proof_url/.test(r.error.message)) {
    const stripped = { ...payload };
    delete stripped.dp_proof_url;
    r = await supabase.from('dp_payment_requests').insert(stripped).select('id').single();
  }
  if (r.error) { console.error('[DP request error]', r.error.message); return null; }
  return r.data?.id;
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

    if (famErr) { console.error(`[family create error] ${familyName}:`, famErr.message); continue; }

    const familyId = fam.id;
    await supabase.from('trip_passengers')
      .update({ family_group_id: familyId, is_family_head: true })
      .eq('id', head.passenger_id);

    const memberIds = members.slice(1).map((m) => m.passenger_id).filter(Boolean);
    if (memberIds.length > 0) {
      await supabase.from('trip_passengers')
        .update({ family_group_id: familyId, is_family_head: false })
        .in('id', memberIds);
    }

    result[familyName] = { family_id: familyId, head_passenger_id: head.passenger_id };
    created++;
  }

  return { result, created };
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

  let { data: csRow, error: csErr } = await authClient
    .from('cs_daily_updates').insert(payload).select('id').single();
  if (csErr && /from_ads_/.test(csErr.message)) {
    const stripped = { ...payload };
    delete stripped.from_ads_meta;
    delete stripped.from_ads_google;
    delete stripped.from_ads_tiktok;
    const retry = await authClient.from('cs_daily_updates').insert(stripped).select('id').single();
    csRow = retry.data; csErr = retry.error;
  }
  if (csErr) return { error: 'Gagal simpan CS update: ' + csErr.message };

  const csUpdateId = csRow?.id;

  // ROUND 135 HOTFIX 2: terima participants dari form (filter dipindah ke server, biar passport fallback works)
  const participantsRaw = formData.get('participants');
  const participantsAllRaw = formData.get('participants_all'); // semua peserta termasuk yg first_name kosong
  let participants = [];

  // Prefer participants_all (yg unfiltered) kalau ada, fallback ke participants
  const raw = participantsAllRaw || participantsRaw;
  if (raw && typeof raw === 'string' && raw.length > 2) {
    try { participants = JSON.parse(raw); } catch (e) {
      return { error: 'Format peserta tidak valid: ' + e.message };
    }
  }

  const supabase = getServiceClient() || authClient;
  const insertErrors = [];
  let insertedCount = 0;
  let dpRequestsCount = 0;
  let passportCount = 0;
  let skippedNoName = 0;
  const insertedPassengers = [];

  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];

    // ROUND 135 HOTFIX 2: pakai resolveName yang fallback ke passport
    const { first, last, fullName } = resolveName(p);

    if (!fullName) {
      skippedNoName++;
      console.error(`[peserta #${idx + 1} skipped] Tidak ada nama (first_name, last_name, passport_surname, passport_given_names semua kosong)`);
      continue;
    }

    const customerPayload = buildCustomerPayload(p, fullName, first, last);
    const { data: customer, error: cErr } = await insertCustomerDefensive(supabase, customerPayload);

    if (cErr || !customer) {
      insertErrors.push(`Peserta #${idx + 1} (${fullName}): customer FAIL — ${cErr?.message || 'unknown'}`);
      continue;
    }
    if (p.passport_photo_url) passportCount++;

    const passengerPayload = {
      trip_id: f.trip_id, customer_id: customer.id,
      room_type: p.room_type || null,
      price_paid: parseInt(p.price_paid) || 0,
      age_type: p.age_type || 'adult',
      status: 'confirmed',
      cs_update_id: csUpdateId,
    };

    const { data: passenger, error: pErr } = await insertPassengerDefensive(supabase, passengerPayload);

    if (pErr) {
      await supabase.from('customers').delete().eq('id', customer.id);
      insertErrors.push(`Peserta #${idx + 1} (${fullName}): passenger FAIL — ${pErr.message}`);
      continue;
    }
    insertedCount++;

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
    return {
      error: `⚠ CS update tersimpan, TAPI ${insertErrors.length} peserta GAGAL masuk master trip:\n\n${insertErrors.join('\n\n')}\n\n${insertedCount} peserta berhasil. Cek console log Vercel buat detail.`,
    };
  }

  if (participants.length > 0 && insertedCount === 0 && skippedNoName > 0) {
    return {
      error: `⚠ ${skippedNoName} peserta gak ke-save karena nama kosong (Nama Depan/Belakang ATAU Surname/Given Names dari passport semua kosong). Pastikan minimal isi salah satu.`,
    };
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
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const { data: csRow } = await supabase
    .from('cs_daily_updates').select('trip_id, tanggal').eq('id', id).maybeSingle();
  const tripId = csRow?.trip_id;

  const { data: linkedPax } = await supabase
    .from('trip_passengers').select('id, customer_id').eq('cs_update_id', id);

  const passengerIds = (linkedPax || []).map((p) => p.id);
  const customerIds = (linkedPax || []).map((p) => p.customer_id).filter(Boolean);

  const stats = { passengers_deleted: 0, customers_deleted: 0, payments_deleted: 0, dp_requests_deleted: 0, invoices_deleted: 0, families_deleted: 0 };

  if (passengerIds.length > 0) {
    try { const r = await supabase.from('dp_payment_requests').delete({ count: 'exact' }).in('passenger_id', passengerIds); stats.dp_requests_deleted = r.count || 0; } catch {}
    try { const r = await supabase.from('participant_payments').delete({ count: 'exact' }).in('passenger_id', passengerIds); stats.payments_deleted = r.count || 0; } catch {}
    try { const r = await supabase.from('invoices').delete({ count: 'exact' }).in('passenger_id', passengerIds); stats.invoices_deleted = r.count || 0; } catch {}

    try {
      const { data: famsToDelete } = await supabase
        .from('family_groups').select('id').in('head_passenger_id', passengerIds);
      if (famsToDelete && famsToDelete.length > 0) {
        const famIds = famsToDelete.map((f) => f.id);
        await supabase.from('trip_passengers')
          .update({ family_group_id: null, is_family_head: false })
          .in('family_group_id', famIds);
        const r = await supabase.from('family_groups').delete({ count: 'exact' }).in('id', famIds);
        stats.families_deleted = r.count || 0;
      }
    } catch {}

    const { count: paxCount, error: paxErr } = await supabase
      .from('trip_passengers').delete({ count: 'exact' }).in('id', passengerIds);
    if (paxErr) return { error: 'Gagal hapus peserta: ' + paxErr.message };
    stats.passengers_deleted = paxCount || 0;

    for (const cid of customerIds) {
      const { count: stillUsed } = await supabase
        .from('trip_passengers').select('id', { count: 'exact', head: true })
        .eq('customer_id', cid);
      if ((stillUsed || 0) === 0) {
        const { error: cErr } = await supabase.from('customers').delete().eq('id', cid);
        if (!cErr) stats.customers_deleted++;
      }
    }
  }

  const { error: csErr } = await supabase.from('cs_daily_updates').delete().eq('id', id);
  if (csErr) return { error: 'Gagal hapus CS update: ' + csErr.message };

  if (tripId) await recomputeTripSold(supabase, tripId);
  revalidateAll(tripId);

  return {
    ok: true,
    message: `CS update dihapus + cascade: ${stats.passengers_deleted} peserta, ${stats.customers_deleted} customer, ${stats.payments_deleted} payment, ${stats.dp_requests_deleted} DP, ${stats.invoices_deleted} invoice, ${stats.families_deleted} family.`,
    ...stats,
  };
}

export async function addParticipantsToCS(tripId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const raw = formData.get('participants_all') || formData.get('participants');
  if (!raw) return { error: 'No participants data' };
  const csUpdateId = formData.get('cs_update_id') || null;

  let arr;
  try { arr = JSON.parse(raw); } catch (e) {
    return { error: 'Format peserta tidak valid: ' + e.message };
  }
  if (!Array.isArray(arr) || arr.length === 0) return { error: 'List peserta kosong' };

  const supabase = getServiceClient() || authClient;
  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: tripData } = await supabase
    .from('trips').select('name, kode_trip').eq('id', tripId).maybeSingle();

  let inserted = 0;
  let dpRequests = 0;
  let passportCount = 0;
  const errors = [];
  const insertedPassengers = [];

  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    const { first, last, fullName } = resolveName(p);
    if (!fullName) continue;

    const customerPayload = buildCustomerPayload(p, fullName, first, last);
    const { data: customer, error: cErr } = await insertCustomerDefensive(supabase, customerPayload);

    if (cErr || !customer) {
      errors.push(`#${i + 1} (${fullName}): ${cErr?.message || 'customer error'}`);
      continue;
    }
    if (p.passport_photo_url) passportCount++;

    const passengerPayload = {
      trip_id: tripId, customer_id: customer.id,
      room_type: p.room_type || null,
      price_paid: parseInt(p.price_paid) || 0,
      age_type: p.age_type || 'adult',
      status: 'confirmed',
      cs_update_id: csUpdateId,
    };

    const { data: passenger, error: pErr } = await insertPassengerDefensive(supabase, passengerPayload);

    if (pErr) {
      await supabase.from('customers').delete().eq('id', customer.id);
      errors.push(`#${i + 1} (${fullName}): ${pErr.message}`);
      continue;
    }
    inserted++;

    insertedPassengers.push({
      passenger_id: passenger.id, customer_id: customer.id,
      name: fullName, phone: p.phone?.trim() || null,
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
      supabase, trip_id: tripId, insertedPassengers, requested_by: updated_by,
    });
    familiesCreated = famResult.created;
  }

  if (inserted > 0) await recomputeTripSold(supabase, tripId);
  revalidateAll(tripId);

  if (errors.length > 0) {
    return { error: errors.join('\n'), inserted, dp_requests: dpRequests, passport_uploads: passportCount, families_created: familiesCreated };
  }
  return { ok: true, inserted, dp_requests: dpRequests, passport_uploads: passportCount, families_created: familiesCreated };
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
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const { data: pax } = await supabase
    .from('trip_passengers').select('customer_id').eq('id', passengerId).maybeSingle();

  try { await supabase.from('participant_payments').delete().eq('passenger_id', passengerId); } catch {}
  try { await supabase.from('dp_payment_requests').delete().eq('passenger_id', passengerId); } catch {}
  try { await supabase.from('invoices').delete().eq('passenger_id', passengerId); } catch {}

  const { error } = await supabase.from('trip_passengers').delete().eq('id', passengerId);
  if (error) return { error: error.message };

  if (pax?.customer_id) {
    const { count } = await supabase
      .from('trip_passengers').select('id', { count: 'exact', head: true })
      .eq('customer_id', pax.customer_id);
    if ((count || 0) === 0) {
      await supabase.from('customers').delete().eq('id', pax.customer_id);
    }
  }

  await recomputeTripSold(supabase, tripId);
  revalidateAll(tripId);
  return { ok: true };
}
