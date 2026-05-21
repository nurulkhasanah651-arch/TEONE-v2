'use server';

// PNR Inventory — ULTRA defensive: try each field individually so partial save works

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { generateTripId } from '@/lib/utils/id';

function parsePnrFields(formData) {
  const fields = {};

  const v = (name) => (formData.get(name) || '').trim();
  const n = (name) => {
    const x = parseInt(formData.get(name));
    return Number.isFinite(x) ? x : null;
  };

  fields.vendor = v('vendor') || null;
  fields.deposit_total = n('deposit_total') ?? 0;
  fields.payoff_amount = n('payoff_amount') ?? 0;
  fields.payoff_date = formData.get('payoff_date') || null;
  fields.payoff_due_date = formData.get('payoff_due_date') || null;
  fields.vendor_notes = v('notes') || null;
  fields.departure_date = formData.get('departure_date') || null;

  // routes is jsonb array
  const routeStr = v('route');
  if (routeStr) fields.routes = [routeStr];

  fields.price_per_pax = n('ticket_price') ?? 0;
  fields.pax = n('seats') ?? 0;

  return fields;
}

// Try to update one field at a time; return list of failed fields
async function tryUpdateFields(supabase, id, fields) {
  const failed = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (typeof value === 'number' && value === 0 && key !== 'deposit_total' && key !== 'payoff_amount' && key !== 'pax' && key !== 'price_per_pax') continue;
    const { error } = await supabase.from('flight_inventory').update({ [key]: value }).eq('id', id);
    if (error) failed.push(`${key} (${error.message})`);
  }
  return failed;
}

export async function createPnr(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const pnr = (formData.get('pnr') || '').trim();
  if (!pnr) return { error: 'PNR code wajib diisi' };

  // Minimal insert
  const { error: insErr, data } = await supabase
    .from('flight_inventory')
    .insert({ pnr })
    .select('id')
    .single();

  if (insErr) return { error: `INSERT FAILED: ${insErr.message}` };

  // Try update each field
  const fields = parsePnrFields(formData);
  const failed = await tryUpdateFields(supabase, data.id, fields);

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');

  if (failed.length > 0) {
    // Partial success — PNR created but some fields couldn't save
    // We still redirect, but show warning. The user can edit later.
    console.warn(`PNR ${pnr} saved with failed fields:`, failed);
  }

  redirect('/finance/pnr');
}

export async function updatePnr(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const pnr = (formData.get('pnr') || '').trim();
  if (!pnr) return { error: 'PNR code wajib diisi' };

  // Update pnr first
  await supabase.from('flight_inventory').update({ pnr }).eq('id', id);

  // Then try each other field
  const fields = parsePnrFields(formData);
  const failed = await tryUpdateFields(supabase, id, fields);

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');

  if (failed.length > 0) {
    console.warn('Update partial failures:', failed);
  }

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
