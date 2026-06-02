'use server';

// R91 + R195: PNR actions — fix double HPP entry pas convert ke trip
// R195: dedup pakai DELETE-FIRST pattern (lebih aman dari upsert)
//       + handle case pnr_id column gak ada (legacy)
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
// R195: SYNC PNR → HPP (dengan DEDUP STRONG)
// ============================================================
async function syncPnrToHPP(supabase, pnrId, tripId) {
  if (!pnrId || !tripId) return;

  const { data: pnr } = await supabase.from('flight_inventory').select('*').eq('id', pnrId).maybeSingle();
  if (!pnr) return;

  const pax = Number(pnr.pax) || 0;
  const pricePerPax = Number(pnr.price_per_pax) || 0;
  const totalCost = pax * pricePerPax;
  const dpPaid = Number(pnr.deposit_total) || 0;

  const isLunas = dpPaid >= totalCost && totalCost > 0;
  const paymentStatus = isLunas ? 'lunas' : (dpPaid > 0 ? 'DP' : 'belum bayar');

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

  // R195: DELETE-FIRST strategy — hapus SEMUA existing match dulu, baru insert baru
  // Ini lebih aman drpd upsert karena handle case:
  //   - row dgn pnr_id sama (normal case)
  //   - row historis tanpa pnr_id tapi component "Tiket Maskapai" untuk trip yg sama
  //   - row duplicate karena bug lama

  // Hapus matching by pnr_id (kalau column ada)
  try {
    await supabase
      .from('trip_finance_items')
      .delete()
      .eq('pnr_id', pnrId)
      .eq('trip_id', tripId);
  } catch {} // ignore kalau column gak ada

  // Hapus juga matching by trip_id + component "Tiket Maskapai" (yg pnr_id NULL)
  try {
    await supabase
      .from('trip_finance_items')
      .delete()
      .eq('trip_id', tripId)
      .eq('component', 'Tiket Maskapai')
      .is('pnr_id', null);
  } catch {}

  // R195: Insert single row
  let { error } = await supabase.from('trip_finance_items').insert(payload);

  // Fallback: kalau column gak ada (legacy schema), strip dan retry
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

async function unlinkPnrFromHPP(supabase, pnrId, tripId) {
  if (!pnrId) return;
  try {
    await supabase
      .from('trip_finance_items')
      .delete()
      .eq('pnr_id', pnrId)
      .eq('trip_id', tripId);
  } catch {}
  // Plus hapus orphan by component (kalau ada)
  try {
    await supabase
      .from('trip_finance_items')
      .delete()
      .eq('trip_id', tripId)
      .eq('component', 'Tiket Maskapai')
      .is('pnr_id', null);
  } catch {}
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
    .insert({
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
    })
    .select('id, trip_id')
    .single();

  if (error) return { error: error.message };

  if (data?.trip_id) {
    await syncPnrToHPP(supabase, data.id, data.trip_id);
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
  if (error) return { error: error.message };

  const { data: pnr } = await supabase.from('flight_inventory').select('trip_id').eq('id', id).maybeSingle();
  if (pnr?.trip_id) {
    await syncPnrToHPP(supabase, id, pnr.trip_id);
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

// MANUAL RESYNC — trigger sync ulang untuk PNR yang sudah linked
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
    } catch {}
  }

  revalidatePnrAndFinance(null);
  return { ok: true, count: synced, message: `${synced} PNR resynced` };
}
