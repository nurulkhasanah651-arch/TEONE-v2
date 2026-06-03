'use server';

// R195e: PNR actions — SIMPLE & FAST (no retry, no defensive strip)
// Prerequisite: WAJIB run SQL R195e dulu biar semua column ada
// Plus: R195d HPP logic (DP done → auto request pelunasan)
// Plus: R195 DELETE-FIRST (prevent double HPP)
// Path: lib/actions/pnr.js

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function generateTripId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ============================================================
// SYNC PNR → HPP — smart logic + DELETE-FIRST
// ============================================================
async function syncPnrToHPP(supabase, pnrId, tripId, user) {
  if (!pnrId || !tripId) return;

  const { data: pnr } = await supabase.from('flight_inventory').select('*').eq('id', pnrId).maybeSingle();
  if (!pnr) return;

  const pax = Number(pnr.pax) || 0;
  const pricePerPax = Number(pnr.price_per_pax) || 0;
  const totalCost = pax * pricePerPax;
  const dpPaid = Number(pnr.deposit_total) || 0;
  const sisa = Math.max(0, totalCost - dpPaid);

  // 3 state logic
  const isLunas = dpPaid >= totalCost && totalCost > 0;
  const hasDeposit = dpPaid > 0 && !isLunas;

  let paymentStatus, paymentPhase, paymentRequestStatus, paymentRequestAmount;
  if (isLunas) {
    paymentStatus = 'lunas';
    paymentPhase = 'pelunasan';
    paymentRequestStatus = null;
    paymentRequestAmount = 0;
  } else if (hasDeposit) {
    paymentStatus = 'DP';
    paymentPhase = 'pelunasan';
    paymentRequestStatus = 'requested';
    paymentRequestAmount = sisa;
  } else {
    paymentStatus = 'belum bayar';
    paymentPhase = 'deposit';
    paymentRequestStatus = null;
    paymentRequestAmount = 0;
  }

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
    payment_phase: paymentPhase,
    payment_request_status: paymentRequestStatus,
    payment_request_amount: paymentRequestAmount,
    payment_requested_at: hasDeposit ? new Date().toISOString() : null,
    payment_requested_by: hasDeposit ? (user?.email || 'auto-sync') : null,
    notes: noteText,
  };

  // DELETE-FIRST: hapus matching dulu (prevent double)
  await supabase.from('trip_finance_items')
    .delete()
    .eq('pnr_id', pnrId)
    .eq('trip_id', tripId);
  await supabase.from('trip_finance_items')
    .delete()
    .eq('trip_id', tripId)
    .eq('component', 'Tiket Maskapai')
    .is('pnr_id', null);

  // Single insert — fast, no retry
  await supabase.from('trip_finance_items').insert(payload);
}

async function unlinkPnrFromHPP(supabase, pnrId, tripId) {
  if (!pnrId || !tripId) return;
  await supabase.from('trip_finance_items').delete().eq('pnr_id', pnrId).eq('trip_id', tripId);
  await supabase.from('trip_finance_items').delete()
    .eq('trip_id', tripId)
    .eq('component', 'Tiket Maskapai')
    .is('pnr_id', null);
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
// CREATE PNR — simple single insert
// ============================================================
export async function createPnr(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const pnr = (formData.get('pnr') || '').trim();
  if (!pnr) return { error: 'PNR code wajib diisi' };

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

  const { data, error } = await supabase
    .from('flight_inventory')
    .insert(payload)
    .select('id, trip_id')
    .single();

  if (error) {
    return { error: 'INSERT failed: ' + error.message + ' — WAJIB run SQL R195e dulu di Supabase' };
  }

  if (data?.trip_id) {
    await syncPnrToHPP(supabase, data.id, data.trip_id, user);
  }

  revalidatePnrAndFinance(data?.trip_id);
  return { ok: true, id: data?.id };
}

export async function updatePnr(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

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

  const { error } = await supabase.from('flight_inventory').update(updates).eq('id', id);
  if (error) return { error: 'UPDATE failed: ' + error.message + ' — Cek SQL R195e' };

  const { data: pnr } = await supabase.from('flight_inventory').select('trip_id').eq('id', id).maybeSingle();
  if (pnr?.trip_id) {
    await syncPnrToHPP(supabase, id, pnr.trip_id, user);
  }

  revalidatePnrAndFinance(pnr?.trip_id);
  return { ok: true };
}

export async function deletePnr(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

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
  await syncPnrToHPP(supabase, id, trip_id, user);

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

  await syncPnrToHPP(supabase, pnrId, tripId, user);

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
      await syncPnrToHPP(supabase, p.id, p.trip_id, user);
      synced++;
    } catch {}
  }

  revalidatePnrAndFinance(null);
  return { ok: true, count: synced, message: `${synced} PNR resynced` };
}
