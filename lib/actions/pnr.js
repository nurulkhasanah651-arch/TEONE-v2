'use server';

// PNR Inventory actions — uses ACTUAL v1 column names:
// - routes (jsonb array, not 'route')
// - price_per_pax (not 'ticket_price')
// - pax (not 'seats')

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { generateTripId } from '@/lib/utils/id';

function parsePnrFields(formData) {
  const fields = {
    pnr: (formData.get('pnr') || '').trim() || null,
    vendor: (formData.get('vendor') || '').trim() || null,
    deposit_total: parseInt(formData.get('deposit_total')) || 0,
    payoff_amount: parseInt(formData.get('payoff_amount')) || 0,
    payoff_date: formData.get('payoff_date') || null,
    payoff_due_date: formData.get('payoff_due_date') || null,
    vendor_notes: formData.get('notes') || null,
  };

  // Route → routes (jsonb array)
  const routeStr = (formData.get('route') || '').trim();
  if (routeStr) fields.routes = [routeStr];

  const departure = formData.get('departure_date');
  if (departure) fields.departure_date = departure;

  // ticket_price → price_per_pax
  const priceVal = parseInt(formData.get('ticket_price'));
  if (Number.isFinite(priceVal) && priceVal > 0) fields.price_per_pax = priceVal;

  // seats → pax
  const seatsVal = parseInt(formData.get('seats'));
  if (Number.isFinite(seatsVal) && seatsVal > 0) fields.pax = seatsVal;

  return fields;
}

export async function createPnr(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const pnr = (formData.get('pnr') || '').trim();
  if (!pnr) return { error: 'PNR code wajib diisi' };

  // Step 1: minimal insert with just pnr
  const { error, data } = await supabase
    .from('flight_inventory')
    .insert({ pnr })
    .select('id')
    .single();

  if (error) return { error: `INSERT FAILED: ${error.message} (code: ${error.code})` };

  // Step 2: update with the rest of the fields
  const fields = parsePnrFields(formData);
  delete fields.pnr; // already set

  if (Object.keys(fields).length > 0) {
    const { error: upErr } = await supabase.from('flight_inventory').update(fields).eq('id', data.id);
    if (upErr) {
      return { error: `PNR ${pnr} dibuat (ID ${data.id}), tapi UPDATE gagal: ${upErr.message}. Coba edit manual.` };
    }
  }

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  redirect('/finance/pnr');
}

export async function updatePnr(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fields = parsePnrFields(formData);
  if (!fields.pnr) return { error: 'PNR code wajib diisi' };

  const { error } = await supabase.from('flight_inventory').update(fields).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  redirect('/finance/pnr');
}

export async function deletePnr(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: pnr } = await supabase.from('flight_inventory').select('trip_id, pnr').eq('id', id).maybeSingle();
  if (pnr?.trip_id) {
    return { error: `PNR ${pnr.pnr} masih terhubung ke trip ${pnr.trip_id}. Unlink dulu.` };
  }

  const { error } = await supabase.from('flight_inventory').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  return { ok: true };
}

export async function convertPnrToTrip(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: pnr, error: pErr } = await supabase.from('flight_inventory').select('*').eq('id', id).maybeSingle();
  if (pErr || !pnr) return { error: 'PNR not found' };
  if (pnr.trip_id) return { error: 'PNR sudah terhubung ke trip lain' };

  let trip_id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTripId();
    const { data: existing } = await supabase.from('trips').select('id').eq('id', candidate).maybeSingle();
    if (!existing) { trip_id = candidate; break; }
  }
  if (!trip_id) return { error: 'Gagal generate trip ID' };

  // routes is jsonb array — extract first as text for flight_details
  const routeText = Array.isArray(pnr.routes) ? pnr.routes.join(' · ') : (pnr.routes || '');

  const { error: tErr } = await supabase.from('trips').insert({
    id: trip_id,
    name: `Trip dari PNR ${pnr.pnr}`,
    pnr: pnr.pnr,
    flight_details: routeText,
    departure: pnr.departure_date,
    quota: pnr.pax || 0,
    price: pnr.price_per_pax || 0,
    status: 'prepare to sell',
    ticket: 'GROUP',
    sold: 0,
    seat_left: pnr.pax || 0,
  });
  if (tErr) return { error: 'Gagal create trip: ' + tErr.message };

  await supabase.from('flight_inventory').update({ trip_id }).eq('id', id);

  revalidatePath('/finance/pnr');
  revalidatePath('/trips');
  revalidatePath('/finance');
  redirect(`/trips/${trip_id}/edit`);
}

export async function unlinkPnrFromTrip(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('flight_inventory').update({ trip_id: null }).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  return { ok: true };
}
