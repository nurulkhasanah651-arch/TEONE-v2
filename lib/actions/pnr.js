'use server';

// R89 RESTORED (R195L): Formula sync PNR → HPP yang dulu BENAR
// + Field name fallback (seats/pax, ticket_price/price_per_pax)
// + Service role + Timeout + Redirect (dari R195i)
// TIDAK MENGUBAH skema HPP, bukti transfer, atau invoice
// Path: lib/actions/pnr.js

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE env vars missing');
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function withTimeout(promise, ms = 8000, label = 'query') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    ),
  ]);
}

function toInt(v) {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/[.\s]/g, '').replace(/,.*$/, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}

function generateTripId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ============================================================
// R89: parsePnrFields — handle field name variants (seats/pax, ticket_price/price_per_pax)
// ============================================================
function parsePnrFields(formData) {
  const fields = {
    pnr: (formData.get('pnr') || '').trim() || null,
    vendor: (formData.get('vendor') || '').trim() || null,
    airline: (formData.get('airline') || '').trim() || null,
    deposit_total: toInt(formData.get('deposit_total')),
    payoff_amount: toInt(formData.get('payoff_amount')),
    payoff_date: formData.get('payoff_date') || null,
    payoff_due_date: formData.get('payoff_due_date') || null,
    payoff_deadline: formData.get('payoff_deadline') || formData.get('payoff_date') || null,
    notes: formData.get('notes') || formData.get('vendor_notes') || null,
  };

  const routeStr = (formData.get('route') || formData.get('routes') || '').trim();
  if (routeStr) {
    fields.routes = routeStr.split('\n').map((r) => r.trim()).filter(Boolean);
  }

  const departure = formData.get('departure_date');
  if (departure) fields.departure_date = departure;

  // R89 KEY: ticket_price → price_per_pax (kalau valid > 0)
  const priceVal = toInt(formData.get('ticket_price') || formData.get('price_per_pax'));
  if (priceVal > 0) fields.price_per_pax = priceVal;

  // R89 KEY: seats → pax (kalau valid > 0)
  const seatsVal = toInt(formData.get('seats') || formData.get('pax'));
  if (seatsVal > 0) fields.pax = seatsVal;

  return fields;
}

// ============================================================
// R89: syncPnrToHPP — UPDATE-OR-INSERT (bukan DELETE-FIRST)
// ============================================================
async function syncPnrToHPP(supabase, pnrId, tripId) {
  if (!tripId) return; // PNR belum di-link ke trip, skip

  // Fetch latest PNR data
  const { data: pnr } = await withTimeout(
    supabase.from('flight_inventory').select('*').eq('id', pnrId).maybeSingle(),
    8000, 'fetch pnr'
  );
  if (!pnr) return;

  const pax = Number(pnr.pax) || 0;
  const pricePerPax = Number(pnr.price_per_pax) || 0;
  const totalCost = pax * pricePerPax;
  const dpPaid = Number(pnr.deposit_total) || 0;

  // R89: status logic
  const isLunas = dpPaid >= totalCost && totalCost > 0;
  const paymentStatus = isLunas ? 'lunas' : (dpPaid > 0 ? 'DP' : 'belum bayar');

  // R89: cek existing HPP item yang linked ke PNR ini (UPDATE-OR-INSERT)
  const { data: existing } = await supabase
    .from('trip_finance_items')
    .select('id')
    .eq('pnr_id', pnrId)
    .eq('trip_id', tripId)
    .maybeSingle();

  const routeStr = Array.isArray(pnr.routes) ? pnr.routes.join(' / ') : (pnr.routes || '');
  const noteText = `Auto-sync dari PNR ${pnr.pnr}${routeStr ? ` (${routeStr})` : ''}`;

  const payload = {
    trip_id: tripId,
    pnr_id: pnrId,
    item_type: 'hpp',
    category: 'Tiket Internasional',
    component: 'Tiket Maskapai',
    vendor_name: pnr.vendor || pnr.airline || null,
    total_amount: totalCost,
    dp_paid: dpPaid,
    deposit_planned: dpPaid,
    deadline_pelunasan: pnr.payoff_due_date || pnr.payoff_deadline || null,
    payment_status: paymentStatus,
    payment_phase: isLunas ? 'pelunasan' : 'deposit',
    payment_request_status: null,
    payment_request_amount: 0,
    notes: noteText,
  };

  if (existing) {
    // R89: UPDATE existing HPP item (jangan delete, prevent double)
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
    // R89: INSERT new HPP item
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
  if (!pnrId || !tripId) return;
  await supabase.from('trip_finance_items').delete().eq('pnr_id', pnrId).eq('trip_id', tripId);
}

function revalidatePnrAndFinance(tripId) {
  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  revalidatePath('/finance/cashflow');
  revalidatePath('/accounting');
  if (tripId) {
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/accounting/groups/${tripId}`);
  }
  revalidatePath('/dashboard');
}

// ============================================================
// CREATE PNR
// ============================================================
export async function createPnr(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); }
  catch (e) { return { error: 'Service role gak ke-set: ' + e.message }; }

  const payload = parsePnrFields(formData);
  if (!payload.pnr) return { error: 'PNR code wajib diisi' };

  let createdData = null;
  try {
    const result = await withTimeout(
      supabase.from('flight_inventory').insert(payload).select('id, trip_id').single(),
      10000, 'create pnr'
    );
    if (result.error) return { error: 'INSERT failed: ' + result.error.message };
    createdData = result.data;
  } catch (e) {
    return { error: 'Save error: ' + (e?.message || 'unknown') };
  }

  if (createdData?.trip_id) {
    await syncPnrToHPP(supabase, createdData.id, createdData.trip_id);
  }

  revalidatePnrAndFinance(createdData?.trip_id);
  redirect('/finance/pnr');
}

// ============================================================
// UPDATE PNR
// ============================================================
export async function updatePnr(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); }
  catch (e) { return { error: 'Service role gak ke-set' }; }

  const updates = parsePnrFields(formData);

  let tripIdToRevalidate = null;
  try {
    const r = await withTimeout(
      supabase.from('flight_inventory').update(updates).eq('id', id),
      10000, 'update pnr'
    );
    if (r.error) return { error: 'UPDATE failed: ' + r.error.message };

    const { data: pnr } = await supabase.from('flight_inventory').select('trip_id').eq('id', id).maybeSingle();
    tripIdToRevalidate = pnr?.trip_id;
    if (pnr?.trip_id) {
      await syncPnrToHPP(supabase, id, pnr.trip_id);
    }
  } catch (e) {
    return { error: 'Update error: ' + (e?.message || 'unknown') };
  }

  revalidatePnrAndFinance(tripIdToRevalidate);
  redirect('/finance/pnr');
}

export async function deletePnr(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); }
  catch (e) { return { error: 'Service role gak ke-set' }; }

  const { data: pnr } = await supabase.from('flight_inventory').select('trip_id').eq('id', id).maybeSingle();
  if (pnr?.trip_id) {
    await unlinkPnrFromHPP(supabase, id, pnr.trip_id);
  }

  const { error } = await supabase.from('flight_inventory').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePnrAndFinance(null);
  return { ok: true };
}

export async function convertPnrToTrip(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); }
  catch (e) { return { error: 'Service role gak ke-set' }; }

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
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!tripId) return { error: 'Trip ID wajib' };

  let supabase;
  try { supabase = getServiceClient(); }
  catch (e) { return { error: 'Service role gak ke-set' }; }

  const { error } = await supabase.from('flight_inventory').update({ trip_id: tripId }).eq('id', pnrId);
  if (error) return { error: error.message };

  await syncPnrToHPP(supabase, pnrId, tripId);

  revalidatePnrAndFinance(tripId);
  return { ok: true };
}

export async function unlinkPnrFromTrip(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); }
  catch (e) { return { error: 'Service role gak ke-set' }; }

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

export async function resyncAllLinkedPnrs() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); }
  catch (e) { return { error: 'Service role gak ke-set' }; }

  const { data: linkedPnrs } = await supabase
    .from('flight_inventory').select('id, trip_id').not('trip_id', 'is', null);

  if (!Array.isArray(linkedPnrs) || linkedPnrs.length === 0) {
    return { ok: true, count: 0, message: 'Tidak ada PNR yang linked ke trip' };
  }

  let synced = 0;
  for (const p of linkedPnrs) {
    try {
      await syncPnrToHPP(supabase, p.id, p.trip_id);
      synced++;
    } catch {}
  }

  revalidatePnrAndFinance(null);
  return { ok: true, count: synced, message: `${synced} PNR resynced` };
}
