// R215d: Hotel HPP + room assignment server actions
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

// ============================================================
// Save Hotel HPP — auto calculate total dari room price
// ============================================================
export async function saveHotelHPP(data) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const {
    trip_id,
    hotel_name,        // e.g. "Madinah Movenpick"
    vendor_name,       // e.g. "TBA"
    // R215d v2 — calc_mode pilih perhitungan
    calc_mode = 'per_room',  // 'per_room' | 'per_pax'
    // Mode A (per_room)
    room_type,         // 'single'|'twin'|'double'|'triple'|'quad'
    pax_in_room,       // jumlah pax yg masuk room type ini
    price_per_room,    // harga per room (in foreign currency)
    // Mode B (per_pax)
    pax_count,         // jumlah pax (total)
    price_per_pax,     // harga per pax (in foreign currency)
    // Shared
    currency,          // 'USD'|'EUR'|'SAR'|'IDR'
    nights,            // jumlah malam
    price_mode,        // 'per_night' | 'total_stay'
    category = 'Hotel',
    notes = '',
  } = data;

  if (!trip_id) return { error: 'trip_id wajib' };
  if (!hotel_name) return { error: 'Nama hotel wajib' };

  if (calc_mode === 'per_room') {
    if (!room_type) return { error: 'Room type wajib (Mode Per Room)' };
    if (!price_per_room || price_per_room <= 0) return { error: 'Harga per room wajib > 0' };
  } else if (calc_mode === 'per_pax') {
    if (!pax_count || pax_count <= 0) return { error: 'Jumlah pax wajib > 0 (Mode Per Pax)' };
    if (!price_per_pax || price_per_pax <= 0) return { error: 'Harga per pax wajib > 0' };
  } else {
    return { error: 'calc_mode harus per_room atau per_pax' };
  }

  // Fetch trip untuk dapat kurs
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('id, kurs, kurs_usd, kurs_eur, kurs_sar')
    .eq('id', trip_id)
    .maybeSingle();

  if (tripErr) return { error: 'Trip query failed: ' + tripErr.message };
  if (!trip) return { error: 'Trip gak ketemu' };

  const kurs = getKursForCurrency(trip, currency);

  // R215d v2 — Calculate based on calc_mode
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
    // Mode B — per pax × nights
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

  // Insert — qty + basic_fare bergantung mode
  const qty = calc_mode === 'per_room' ? calc.roomsNeeded : pax_count;
  const basicFareInIDR = calc_mode === 'per_room'
    ? Math.round(price_per_room * kurs * (price_mode === 'per_night' ? (nights || 1) : 1))
    : Math.round(price_per_pax * kurs * (price_mode === 'per_night' ? (nights || 1) : 1));

  const payload = {
    trip_id,
    item_type: 'hpp',
    category,
    component: componentLabel,
    vendor_name: vendor_name || null,
    qty,
    basic_fare: basicFareInIDR, // per unit (room atau pax) in IDR
    total_amount: calc.totalIDR,
    payment_status: 'belum',
    notes: notesSummary,
    // R215d extras
    room_type: calc_mode === 'per_room' ? room_type : null,
    price_per_room_foreign: calc_mode === 'per_room' ? price_per_room : price_per_pax,
    currency,
    nights: nights || 1,
    price_mode: price_mode || 'per_night',
    kurs_used: kurs,
    pax_in_room: calc_mode === 'per_room' ? pax_in_room : pax_count,
    is_hotel: true,
  };

  const { data: inserted, error: insErr } = await supabase
    .from('trip_finance_items')
    .insert(payload)
    .select()
    .maybeSingle();

  if (insErr) {
    // Defensive — kalau kolom baru belum ada (SQL belum di-run), retry tanpa extra fields
    const isMissingCol = /column.*does not exist/i.test(insErr.message);
    if (isMissingCol) {
      const fallbackPayload = {
        trip_id,
        item_type: 'hpp',
        category,
        component: componentLabel,
        vendor_name: vendor_name || null,
        qty,
        basic_fare: basicFareInIDR,
        total_amount: calc.totalIDR,
        payment_status: 'belum',
        notes: notesSummary + ' · (R215d kolom baru belum di-add — jalankan SQL)',
      };
      const { data: fb, error: fbErr } = await supabase
        .from('trip_finance_items')
        .insert(fallbackPayload)
        .select()
        .maybeSingle();
      if (fbErr) return { error: 'Insert fallback failed: ' + fbErr.message };
      revalidatePath(`/finance/cashflow/${trip_id}`);
      return { ok: true, item: fb, calc, warning: 'Kolom extra belum di-DB — pakai fallback mode (item ke-save tanpa metadata extra)' };
    }
    return { error: 'Insert failed: ' + insErr.message };
  }

  revalidatePath(`/finance/cashflow/${trip_id}`);
  return { ok: true, item: inserted, calc };
}

// ============================================================
// Update room_type peserta
// ============================================================
export async function updatePaxRoomType(passengerId, roomType) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const validRooms = ['single', 'twin', 'double', 'triple', 'quad', '', null];
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
    revalidatePath(`/trips/${pax.trip_id}`);
  }
  return { ok: true };
}

// ============================================================
// Bulk assign room — set room_type buat banyak peserta sekaligus
// ============================================================
export async function bulkAssignRooms(tripId, assignments) {
  // assignments: [{ passenger_id, room_type }, ...]
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

// ============================================================
// Update trip kurs (USD/EUR/SAR)
// ============================================================
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
