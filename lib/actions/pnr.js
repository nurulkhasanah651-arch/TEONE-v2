'use server';

// Round 91: PNR actions HOTFIX — pakai nama kolom v1 actual
// - airline (NOT vendor)
// - payoff_deadline (NOT payoff_due_date)
// - payoff_amount tidak ada → compute = (pax × price_per_pax) - deposit_total

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { generateTripId } from '@/lib/utils/id';

function parsePnrFields(formData) {
  const fields = {
    pnr: (formData.get('pnr') || '').trim() || null,
    airline: (formData.get('vendor') || formData.get('airline') || '').trim() || null,
    deposit_total: parseInt(formData.get('deposit_total')) || 0,
  };

  // Map deadline pelunasan ke payoff_deadline
  const due = formData.get('payoff_due_date') || formData.get('payoff_deadline');
  if (due) fields.payoff_deadline = due;

  const depDeadline = formData.get('deposit_deadline');
  if (depDeadline) fields.deposit_deadline = depDeadline;

  const notes = formData.get('notes');
  if (notes) fields.notes = notes;

  const routeStr = (formData.get('route') || '').trim();
  if (routeStr) fields.routes = [routeStr];

  const departure = formData.get('departure_date');
  if (departure) fields.departure_date = departure;

  const ret = formData.get('return_date');
  if (ret) fields.return_date = ret;

  const priceVal = parseInt(formData.get('ticket_price'));
  if (Number.isFinite(priceVal) && priceVal > 0) fields.price_per_pax = priceVal;

  const seatsVal = parseInt(formData.get('seats'));
  if (Number.isFinite(seatsVal) && seatsVal > 0) fields.pax = seatsVal;

  return fields;
}

// ============================================================
// SYNC ke HPP item — pakai nama kolom yang benar
// ============================================================
async function syncPnrToHPP(supabase, pnrId, tripId) {
  if (!tripId) return;

  const { data: pnr } = await supabase
    .from('flight_inventory')
    .select('*')
    .eq('id', pnrId)
    .maybeSingle();

  if (!pnr) return;

  const pax = Number(pnr.pax) || 0;
  const pricePerPax = Number(pnr.price_per_pax) || 0;
  const totalCost = pax * pricePerPax;
  const dpPaid = Number(pnr.deposit_total) || 0;

  const isLunas = dpPaid >= totalCost && totalCost > 0;
  const paymentStatus = isLunas ? 'lunas' : (dpPaid > 0 ? 'DP' : 'belum bayar');

  const { data: existing } = await supabase
    .from('trip_finance_items')
    .select('id')
    .eq('pnr_id', pnrId)
    .eq('trip_id', tripId)
    .maybeSingle();

  const routeStr = Array.isArray(pnr.routes) ? pnr.routes.join(' / ') : (pnr.routes || '');
  const vendorName = pnr.airline || pnr.vendor || null;
  const noteText = `Auto-sync dari PNR ${pnr.pnr}${routeStr ? ` (${routeStr})` : ''}`;

  const payload = {
    trip_id: tripId,
    pnr_id: pnrId,
    item_type: 'hpp',
    category: 'Tiket Internasional',
    component: 'Tiket Maskapai',
    vendor_name: vendorName,
    total_amount: totalCost,
    dp_paid: dpPaid,
    deposit_planned: dpPaid,
    deadline_pelunasan: pnr.payoff_deadline || pnr.payoff_due_date || null,
    payment_status: paymentStatus,
    payment_phase: isLunas ? 'pelunasan' : 'deposit',
    payment_request_status: null,
    payment_request_amount: 0,
    notes: noteText,
  };

  if (existing) {
    let { error } = await supabase
      .from('trip_finance_items')
      .update(payload)
      .eq('id', existing.id);

    if (error && /pnr_id|deposit_planned|deadline_pelunasan|payment_phase|payment_request_/.test(error.message)) {
      const stripped = { ...payload };
      delete stripped.pnr_id;
      delete stripped.deposit_planned;
      delete stripped.deadline_pelunasan;
      delete stripped.payment_phase;
      delete stripped.payment_request_status;
      delete stripped.payment_request_amount;
      await supabase.from('trip_finance_items').update(stripped).eq('id', existing.id);
    }
  } else {
    let { error } = await supabase.from('trip_finance_items').insert(payload);

    if (error && /pnr_id|deposit_planned|deadline_pelunasan|payment_phase|payment_request_/.test(error.message)) {
      const stripped = { ...payload };
      delete stripped.pnr_id;
      delete stripped.deposit_planned;
      delete stripped.deadline_pelunasan;
      delete stripped.payment_phase;
      delete stripped.payment_request_status;
      delete stripped.payment_request_amount;
      await supabase.from('trip_finance_items').insert(stripped);
    }
  }
}

async function unlinkPnrFromHPP(supabase, pnrId, tripId) {
  if (!pnrId) return;
  await supabase
    .from('trip_finance_items')
    .delete()
    .eq('pnr_id', pnrId)
    .eq('trip_id', tripId);
}

function revalidatePnrAndFinance(tripId) {
  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  revalidatePath('/finance/cashflow');
  if (tripId) {
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
  }
  revalidatePath('/dashboard');
}

export async function createPnr(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const pnr = (formData.get('pnr') || '').trim();
  if (!pnr) return { error: 'PNR code wajib diisi' };

  const { error, data } = await supabase
    .from('flight_inventory')
    .insert({ pnr })
    .select('id')
    .single();

  if (error) return { error: `INSERT FAILED: ${error.message} (code: ${error.code})` };

  const fields = parsePnrFields(formData);
  delete fields.pnr;

  if (Object.keys(fields).length > 0) {
    const { error: upErr } = await supabase.from('flight_inventory').update(fields).eq('id', data.id);
    if (upErr) {
      return { error: `PNR ${pnr} dibuat (ID ${data.id}), tapi UPDATE gagal: ${upErr.message}.` };
    }
  }

  const { data: full } = await supabase.from('flight_inventory').select('trip_id').eq('id', data.id).maybeSingle();
  if (full?.trip_id) {
    await syncPnrToHPP(supabase, data.id, full.trip_id);
  }

  revalidatePnrAndFinance(full?.trip_id);
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

  const { data: full } = await supabase.from('flight_inventory').select('trip_id').eq('id', id).maybeSingle();
  if (full?.trip_id) {
    await syncPnrToHPP(supabase, id, full.trip_id);
  }

  revalidatePnrAndFinance(full?.trip_id);
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

  await supabase.from('trip_finance_items').delete().eq('pnr_id', id);

  const { error } = await supabase.from('flight_inventory').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePnrAndFinance(null);
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
  await syncPnrToHPP(supabase, id, trip_id);

  revalidatePnrAndFinance(trip_id);
  revalidatePath('/trips');
  redirect(`/trips/${trip_id}/edit`);
}

export async function linkPnrToTrip(pnrId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!tripId) return { error: 'Trip ID wajib' };

  const { error } = await supabase.from('flight_inventory').update({ trip_id: tripId }).eq('id', pnrId);
  if (error) return { error: error.message };

  await syncPnrToHPP(supabase, pnrId, tripId);

  revalidatePnrAndFinance(tripId);
  return { ok: true };
}

export async function unlinkPnrFromTrip(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: pnr } = await supabase.from('flight_inventory').select('trip_id').eq('id', id).maybeSingle();
  const oldTripId = pnr?.trip_id;

  if (oldTripId) {
    await unlinkPnrFromHPP(supabase, id, oldTripId);
  }

  const { error } = await supabase.from('flight_inventory').update({ trip_id: null }).eq('id', id);
  if (error) return { error: error.message };

  revalidatePnrAndFinance(oldTripId);
  return { ok: true };
}

// ============================================================
// MANUAL RESYNC — trigger sync ulang untuk PNR yang sudah linked
// ============================================================
export async function resyncAllLinkedPnrs() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: linkedPnrs } = await supabase
    .from('flight_inventory')
    .select('id, trip_id')
    .not('trip_id', 'is', null);

  if (!Array.isArray(linkedPnrs) || linkedPnrs.length === 0) {
    return { ok: true, count: 0, message: 'Tidak ada PNR yang linked ke trip' };
  }

  let synced = 0;
  for (const p of linkedPnrs) {
    try {
      await syncPnrToHPP(supabase, p.id, p.trip_id);
      synced++;
    } catch (e) {
      console.error('Sync error PNR', p.id, e);
    }
  }

  revalidatePnrAndFinance(null);
  return { ok: true, count: synced };
}
