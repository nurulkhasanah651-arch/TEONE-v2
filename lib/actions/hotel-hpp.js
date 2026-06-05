// R215d + R215g: Hotel HPP server actions
// R215g FIX: robust fallback kalau SQL R215d belum di-run + warning gak fatal
// Path: lib/actions/hotel-hpp.js

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { calcHotelCost, calcHotelCostPerPax, getKursForCurrency } from '@/lib/utils/room-pricing';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function saveHotelHPP(data) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const {
    trip_id,
    hotel_name,
    vendor_name,
    calc_mode = 'per_room',
    room_type,
    pax_in_room,
    price_per_room,
    pax_count,
    price_per_pax,
    currency,
    nights,
    price_mode,
    category = 'Hotel',
    notes = '',
  } = data;

  if (!trip_id) return { error: 'trip_id wajib' };
  if (!hotel_name) return { error: 'Nama hotel wajib' };

  if (calc_mode === 'per_room') {
    if (!room_type) return { error: 'Room type wajib (Mode Per Room)' };
    if (!price_per_room || price_per_room <= 0) return { error: 'Harga per room wajib > 0' };
    if (!pax_in_room || pax_in_room <= 0) return { error: 'Pax in room wajib > 0 — assign peserta dulu atau override manual' };
  } else if (calc_mode === 'per_pax') {
    if (!pax_count || pax_count <= 0) return { error: 'Jumlah pax wajib > 0 (Mode Per Pax)' };
    if (!price_per_pax || price_per_pax <= 0) return { error: 'Harga per pax wajib > 0' };
  } else {
    return { error: 'calc_mode harus per_room atau per_pax' };
  }

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, kurs, kurs_usd, kurs_eur, kurs_sar')
    .eq('id', trip_id)
    .maybeSingle();

  if (tripErr) return { error: 'Trip query failed: ' + tripErr.message };
  if (!trip) return { error: `Trip gak ketemu (id=${trip_id})` };

  const kurs = getKursForCurrency(trip, currency);

  let calc;
  let componentLabel;
  let notesSummary;

  if (calc_mode === 'per_room') {
    calc = calcHotelCost({
      paxInRoom: pax_in_room,
      roomType: room_type,
      pricePerRoom: price_per_room,
      currency,
      kurs,
      nights: nights || 1,
      priceMode: price_mode || 'per_night',
    });

    const roomLabel = String(room_type).charAt(0).toUpperCase() + String(room_type).slice(1);
    componentLabel = `${hotel_name} · ${roomLabel}${nights > 1 ? ` · ${nights} malam` : ''}`;

    notesSummary = [
      `${calc.roomsNeeded} room × ${currency} ${Number(price_per_room).toLocaleString('en-US')}`,
      nights > 1 ? `${nights} malam` : null,
      `Kurs: Rp ${kurs.toLocaleString('id-ID')}/${currency}`,
      `Per pax: Rp ${calc.perPaxIDR.toLocaleString('id-ID')}`,
      notes,
    ].filter(Boolean).join(' · ');
  } else {
    calc = calcHotelCostPerPax({
      pax: pax_count,
      pricePerPax: price_per_pax,
      currency,
      kurs,
      nights: nights || 1,
      priceMode: price_mode || 'per_night',
    });

    componentLabel = `${hotel_name}${nights > 1 ? ` · ${nights} malam` : ''} · ${pax_count} pax`;

    notesSummary = [
      `${pax_count} pax × ${currency} ${Number(price_per_pax).toLocaleString('en-US')}/pax`,
      nights > 1 ? `× ${nights} malam` : null,
      `Kurs: Rp ${kurs.toLocaleString('id-ID')}/${currency}`,
      `Per pax: Rp ${calc.perPaxIDR.toLocaleString('id-ID')}`,
      notes,
    ].filter(Boolean).join(' · ');
  }

  const qty = calc_mode === 'per_room' ? calc.roomsNeeded : pax_count;
  const basicFareInIDR = calc_mode === 'per_room'
    ? Math.round(price_per_room * kurs * (price_mode === 'per_night' ? (nights || 1) : 1))
    : Math.round(price_per_pax * kurs * (price_mode === 'per_night' ? (nights || 1) : 1));

  // R215g — Core fields (SELALU exist di trip_finance_items)
  const corePayload = {
    trip_id,
    item_type: 'hpp',
    category: category || 'Hotel',
    component: componentLabel,
    vendor_name: vendor_name || null,
    qty,
    basic_fare: basicFareInIDR,
    total_amount: calc.totalIDR,
    payment_status: 'belum',
    notes: notesSummary,
  };

  // R215d extras — kolom yg ditambah di SQL R215d (mungkin belum di-run)
  const extraPayload = {
    room_type: calc_mode === 'per_room' ? room_type : null,
    price_per_room_foreign: calc_mode === 'per_room' ? price_per_room : price_per_pax,
    currency,
    nights: nights || 1,
    price_mode: price_mode || 'per_night',
    kurs_used: kurs,
    pax_in_room: calc_mode === 'per_room' ? pax_in_room : pax_count,
    is_hotel: true,
  };

  // R215g — Try insert WITH extras first
  let inserted = null;
  let warningMsg = null;
  const { data: ins1, error: insErr1 } = await supabase
    .from('trip_finance_items')
    .insert({ ...corePayload, ...extraPayload })
    .select()
    .maybeSingle();

  if (!insErr1) {
    inserted = ins1;
  } else {
    // R215g — Fallback: try without extras (compatible dgn schema lama)
    console.warn('[saveHotelHPP] insert with extras failed:', insErr1.message);
    const { data: ins2, error: insErr2 } = await supabase
      .from('trip_finance_items')
      .insert(corePayload)
      .select()
      .maybeSingle();

    if (insErr2) {
      return { error: 'Insert failed: ' + insErr2.message };
    }
    inserted = ins2;
    warningMsg = 'Kolom extra (is_hotel, room_type, dll) belum ada di DB — item ke-save dgn data dasar. Jalankan SQL R215d kalau mau metadata extra ke-track.';
  }

  // R215g — Revalidate semua related path biar UI fresh
  revalidatePath(`/finance/cashflow/${trip_id}`);
  revalidatePath(`/finance/payments/${trip_id}`);
  revalidatePath(`/accounting/groups/${trip_id}`);
  revalidatePath('/accounting');
  revalidatePath('/finance');

  return {
    ok: true,
    item: inserted,
    calc,
    warning: warningMsg,
  };
}

export async function updatePaxRoomType(passengerId, roomType) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const validRooms = ['single', 'twin', 'double', 'triple', 'quad', 'family', 'child_no_bed', 'infant', 'land_tour_only', '', null];
  if (!validRooms.includes(roomType)) {
    return { error: 'Room type invalid' };
  }

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id')
    .eq('id', passengerId)
    .maybeSingle();

  if (!pax) return { error: 'Peserta gak ketemu' };

  const { error: updErr } = await supabase
    .from('trip_passengers')
    .update({ room_type: roomType || null })
    .eq('id', passengerId);

  if (updErr) {
    if (/room_type/.test(updErr.message)) {
      return { error: 'Kolom room_type belum ada — jalankan SQL ADD COLUMN dulu' };
    }
    return { error: 'Update failed: ' + updErr.message };
  }

  if (pax.trip_id) {
    revalidatePath(`/finance/cashflow/${pax.trip_id}`);
    revalidatePath(`/finance/payments/${pax.trip_id}`);
    revalidatePath(`/trips/${pax.trip_id}`);
  }
  return { ok: true };
}

export async function bulkAssignRooms(tripId, assignments) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { error: 'Tidak ada assignment' };
  }

  let updated = 0;
  let errors = [];
  for (const a of assignments) {
    if (!a.passenger_id) continue;
    const { error: e } = await supabase
      .from('trip_passengers')
      .update({ room_type: a.room_type || null })
      .eq('id', a.passenger_id);
    if (e) errors.push(`${a.passenger_id}: ${e.message}`);
    else updated++;
  }

  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath(`/trips/${tripId}`);

  if (errors.length > 0) {
    return { ok: true, updated, warning: `${errors.length} failed: ${errors.slice(0, 3).join(', ')}` };
  }
  return { ok: true, updated };
}

export async function updateTripKurs(tripId, kursData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const update = {};
  if (kursData.kurs_usd != null) update.kurs_usd = Number(kursData.kurs_usd) || 0;
  if (kursData.kurs_eur != null) update.kurs_eur = Number(kursData.kurs_eur) || 0;
  if (kursData.kurs_sar != null) update.kurs_sar = Number(kursData.kurs_sar) || 0;
  if (kursData.kurs != null) update.kurs = Number(kursData.kurs) || 0;

  if (Object.keys(update).length === 0) return { error: 'Tidak ada data kurs' };

  const { error: updErr } = await supabase
    .from('trips')
    .update(update)
    .eq('id', tripId);

  if (updErr) {
    if (/kurs_/i.test(updErr.message)) {
      return { error: 'Kolom kurs_usd/eur/sar belum ada — jalankan SQL ADD COLUMN dulu' };
    }
    return { error: 'Update failed: ' + updErr.message };
  }

  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}
