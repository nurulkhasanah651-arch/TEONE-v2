'use server';

// PNR Inventory (flight_inventory) server actions

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { generateTripId } from '@/lib/utils/id';

function parsePnrFields(formData) {
  // Only include known-good columns. Other fields skipped to avoid schema errors.
  const fields = {
    pnr: (formData.get('pnr') || '').trim() || null,
    route: (formData.get('route') || '').trim() || null,
    vendor: (formData.get('vendor') || '').trim() || null,
    deposit_total: parseInt(formData.get('deposit_total')) || 0,
    payoff_amount: parseInt(formData.get('payoff_amount')) || 0,
    payoff_date: formData.get('payoff_date') || null,
    payoff_due_date: formData.get('payoff_due_date') || null,
    vendor_notes: formData.get('notes') || null,
  };

  // Optional fields — only add if user provided values (skip if column may not exist in v1)
  const departure = formData.get('departure_date');
  if (departure) fields.departure_date = departure;

  const ticketPrice = parseInt(formData.get('ticket_price'));
  if (Number.isFinite(ticketPrice) && ticketPrice > 0) fields.ticket_price = ticketPrice;

  const seats = parseInt(formData.get('seats'));
  if (Number.isFinite(seats) && seats > 0) fields.seats = seats;

  return fields;
}

export async function createPnr(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parsePnrFields(formData);
  if (!f.pnr) return { error: 'PNR code wajib diisi' };

  const { error } = await supabase.from('flight_inventory').insert(f);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  redirect('/finance/pnr');
}

export async function updatePnr(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parsePnrFields(formData);
  if (!f.pnr) return { error: 'PNR code wajib diisi' };

  const { error } = await supabase.from('flight_inventory').update(f).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  redirect('/finance/pnr');
}

export async function deletePnr(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Check if linked to a trip
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

// Convert a PNR to a new master trip — pre-fill trip info from PNR data
export async function convertPnrToTrip(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: pnr, error: pErr } = await supabase.from('flight_inventory').select('*').eq('id', id).maybeSingle();
  if (pErr || !pnr) return { error: 'PNR not found' };
  if (pnr.trip_id) return { error: 'PNR sudah terhubung ke trip lain' };

  // Generate trip ID
  let trip_id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTripId();
    const { data: existing } = await supabase.from('trips').select('id').eq('id', candidate).maybeSingle();
    if (!existing) { trip_id = candidate; break; }
  }
  if (!trip_id) return { error: 'Gagal generate trip ID, coba lagi' };

  // Create trip from PNR data
  const { error: tErr } = await supabase.from('trips').insert({
    id: trip_id,
    name: `Trip dari PNR ${pnr.pnr}`,
    pnr: pnr.pnr,
    flight_details: pnr.route,
    departure: pnr.departure_date,
    quota: pnr.seats,
    price: pnr.ticket_price,
    status: 'prepare to sell',
    ticket: 'GROUP',
    sold: 0,
    seat_left: pnr.seats,
  });
  if (tErr) return { error: 'Gagal create trip: ' + tErr.message };

  // Link PNR to the new trip
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
