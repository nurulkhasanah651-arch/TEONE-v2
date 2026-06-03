'use server';

// R195f: PNR actions — SERVICE ROLE everywhere (bypass RLS sepenuhnya)
// + Timeout 8 detik per query (kalau hang, return error gak diam aja)
// + Logging detail
// Path: lib/actions/pnr.js

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE env vars missing');
  }
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// R195f: timeout wrapper — kalau query > 8 detik, abort
function withTimeout(promise, ms = 8000, label = 'query') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    ),
  ]);
}

function generateTripId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

async function syncPnrToHPP(supabase, pnrId, tripId, userEmail) {
  if (!pnrId || !tripId) return;

  const { data: pnr } = await withTimeout(
    supabase.from('flight_inventory').select('*').eq('id', pnrId).maybeSingle(),
    8000, 'fetch pnr'
  );
  if (!pnr) return;

  const pax = Number(pnr.pax) || 0;
  const pricePerPax = Number(pnr.price_per_pax) || 0;
  const totalCost = pax * pricePerPax;
  const dpPaid = Number(pnr.deposit_total) || 0;
  const sisa = Math.max(0, totalCost - dpPaid);

  const isLunas = dpPaid >= totalCost && totalCost > 0;
  const hasDeposit = dpPaid > 0 && !isLunas;

  let paymentStatus, paymentPhase, paymentRequestStatus, paymentRequestAmount;
  if (isLunas) {
    paymentStatus = 'lunas'; paymentPhase = 'pelunasan';
    paymentRequestStatus = null; paymentRequestAmount = 0;
  } else if (hasDeposit) {
    paymentStatus = 'DP'; paymentPhase = 'pelunasan';
    paymentRequestStatus = 'requested'; paymentRequestAmount = sisa;
  } else {
    paymentStatus = 'belum bayar'; paymentPhase = 'deposit';
    paymentRequestStatus = null; paymentRequestAmount = 0;
  }

  const routeStr = Array.isArray(pnr.routes) ? pnr.routes.join(' / ') : (pnr.routes || '');
  const vendorName = pnr.airline || pnr.vendor || null;

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
    payment_phase: paymentPhase,
    payment_request_status: paymentRequestStatus,
    payment_request_amount: paymentRequestAmount,
    payment_requested_at: hasDeposit ? new Date().toISOString() : null,
    payment_requested_by: hasDeposit ? (userEmail || 'auto-sync') : null,
    notes: `Auto-sync dari PNR ${pnr.pnr}${routeStr ? ` (${routeStr})` : ''}`,
  };

  // DELETE-FIRST with timeout
  try {
    await withTimeout(
      supabase.from('trip_finance_items').delete().eq('pnr_id', pnrId).eq('trip_id', tripId),
      5000, 'delete pnr_id'
    );
  } catch {}
  try {
    await withTimeout(
      supabase.from('trip_finance_items').delete().eq('trip_id', tripId).eq('component', 'Tiket Maskapai').is('pnr_id', null),
      5000, 'delete legacy'
    );
  } catch {}

  try {
    await withTimeout(
      supabase.from('trip_finance_items').insert(payload),
      8000, 'insert hpp'
    );
  } catch (e) {
    console.error('[syncPnrToHPP] insert error:', e?.message);
  }
}

async function unlinkPnrFromHPP(supabase, pnrId, tripId) {
  if (!pnrId || !tripId) return;
  try { await supabase.from('trip_finance_items').delete().eq('pnr_id', pnrId).eq('trip_id', tripId); } catch {}
  try { await supabase.from('trip_finance_items').delete().eq('trip_id', tripId).eq('component', 'Tiket Maskapai').is('pnr_id', null); } catch {}
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
// CREATE PNR — R195f: SERVICE ROLE + TIMEOUT
// ============================================================
export async function createPnr(formData) {
  // Auth check via regular client
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const pnr = (formData.get('pnr') || '').trim();
  if (!pnr) return { error: 'PNR code wajib diisi' };

  // R195f: pakai service role buat bypass RLS
  let supabase;
  try {
    supabase = getServiceClient();
  } catch (e) {
    return { error: 'Service role gak ke-set di env: ' + e.message };
  }

  const payload = {
    pnr,
    airline: formData.get('airline') || null,
    vendor: formData.get('vendor') || null,
    pax: parseInt(formData.get('pax')) || 0,
    price_per_pax: parseInt(formData.get('price_per_pax')) || 0,
    deposit_total: parseInt(formData.get('deposit_total')) || 0,
    routes: (formData.get('routes') || '').split('\n').map((r) => r.trim()).filter(Boolean),
    departure_date: formData.get('departure_date') || null,
    payoff_deadline: formData.get('payoff_deadline') || null,
    payoff_due_date: formData.get('payoff_due_date') || null,
    notes: formData.get('notes') || null,
  };

  try {
    const result = await withTimeout(
      supabase.from('flight_inventory').insert(payload).select('id, trip_id').single(),
      10000, 'create pnr'
    );

    if (result.error) {
      return { error: 'INSERT failed: ' + result.error.message + ' — Cek SQL R195e udah di-run' };
    }
    const data = result.data;

    if (data?.trip_id) {
      await syncPnrToHPP(supabase, data.id, data.trip_id, user.email);
    }

    revalidatePnrAndFinance(data?.trip_id);
    return { ok: true, id: data?.id };
  } catch (e) {
    return { error: 'TIMEOUT/Error: ' + (e?.message || 'unknown') };
  }
}

export async function updatePnr(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); } catch (e) { return { error: 'Service role gak ke-set' }; }

  const updates = {
    pnr: (formData.get('pnr') || '').trim() || null,
    airline: formData.get('airline') || null,
    vendor: formData.get('vendor') || null,
    pax: parseInt(formData.get('pax')) || 0,
    price_per_pax: parseInt(formData.get('price_per_pax')) || 0,
    deposit_total: parseInt(formData.get('deposit_total')) || 0,
    routes: (formData.get('routes') || '').split('\n').map((r) => r.trim()).filter(Boolean),
    departure_date: formData.get('departure_date') || null,
    payoff_deadline: formData.get('payoff_deadline') || null,
    payoff_due_date: formData.get('payoff_due_date') || null,
    notes: formData.get('notes') || null,
  };

  try {
    const r = await withTimeout(
      supabase.from('flight_inventory').update(updates).eq('id', id),
      10000, 'update pnr'
    );
    if (r.error) return { error: 'UPDATE failed: ' + r.error.message };

    const { data: pnr } = await supabase.from('flight_inventory').select('trip_id').eq('id', id).maybeSingle();
    if (pnr?.trip_id) {
      await syncPnrToHPP(supabase, id, pnr.trip_id, user.email);
    }

    revalidatePnrAndFinance(pnr?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'TIMEOUT/Error: ' + (e?.message || 'unknown') };
  }
}

export async function deletePnr(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); } catch (e) { return { error: 'Service role gak ke-set' }; }

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
  try { supabase = getServiceClient(); } catch (e) { return { error: 'Service role gak ke-set' }; }

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
  await syncPnrToHPP(supabase, id, trip_id, user.email);

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
  try { supabase = getServiceClient(); } catch (e) { return { error: 'Service role gak ke-set' }; }

  const { error } = await supabase.from('flight_inventory').update({ trip_id: tripId }).eq('id', pnrId);
  if (error) return { error: error.message };

  await syncPnrToHPP(supabase, pnrId, tripId, user.email);

  revalidatePnrAndFinance(tripId);
  return { ok: true };
}

export async function unlinkPnrFromTrip(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  let supabase;
  try { supabase = getServiceClient(); } catch (e) { return { error: 'Service role gak ke-set' }; }

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
  try { supabase = getServiceClient(); } catch (e) { return { error: 'Service role gak ke-set' }; }

  const { data: linkedPnrs } = await supabase
    .from('flight_inventory').select('id, trip_id').not('trip_id', 'is', null);

  if (!Array.isArray(linkedPnrs) || linkedPnrs.length === 0) {
    return { ok: true, count: 0, message: 'Tidak ada PNR yang linked ke trip' };
  }

  let synced = 0;
  for (const p of linkedPnrs) {
    try {
      await syncPnrToHPP(supabase, p.id, p.trip_id, user.email);
      synced++;
    } catch {}
  }

  revalidatePnrAndFinance(null);
  return { ok: true, count: synced, message: `${synced} PNR resynced` };
}
