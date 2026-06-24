'use server';

// Participant payment milestones — CRUD + group template management
// + auto-sync ke accounting saat toggle ON/OFF

import { revalidatePath } from 'next/cache';
import { assertStaff } from '@/lib/auth/require-staff';
import { createClient } from '@/lib/supabase/server';
import { autoCreateCashInFromPayment, autoDeleteCashInFromPayment } from '@/lib/actions/accounting';
import { mainExpectedPerPassenger, isPokokMilestone } from '@/lib/utils/price-breakdown';

const STANDARD_TYPES = ['DP', 'P1', 'P2', 'P3', 'Pelunasan', 'Visa', 'Asuransi'];

export async function addPayment(passengerId, tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const type = formData.get('type');
  const label = (formData.get('label') || '').trim() || null;
  const amount = parseInt(formData.get('amount')) || 0;
  const paid_at = formData.get('paid_at') || null;
  const due_at = formData.get('due_at') || null;
  const notes = (formData.get('notes') || '').trim() || null;

  if (!type) return { error: 'Type payment wajib dipilih' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: inserted, error } = await supabase.from('participant_payments').insert({
    passenger_id: passengerId, type, label, amount, paid_at, due_at, notes, created_by,
  }).select().maybeSingle();

  if (error) return { error: error.message };

  // Kalau punya paid_at (= sudah lunas), auto-create cash_in
  if (inserted && paid_at && amount > 0) {
    await autoCreateCashInFromPayment({
      paymentId: inserted.id,
      tripId,
      passengerId,
      type,
      amount,
    });
  }

  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  return { ok: true };
}

export async function deletePayment(paymentId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  // Hapus accounting_entry yang linked dulu (kalau ada)
  await autoDeleteCashInFromPayment(paymentId);

  const { error } = await supabase.from('participant_payments').delete().eq('id', paymentId);
  if (error) return { error: error.message };

  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/accounting');
  return { ok: true };
}

// Toggle a milestone for a passenger — if already exists, delete it; else insert with template amount
// + auto-sync ke accounting_entries
export async function toggleMilestone(passengerId, tripId, type, templateAmount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  // Check if a payment of this type already exists for this passenger
  const { data: existing } = await supabase
    .from('participant_payments')
    .select('id, amount')
    .eq('passenger_id', passengerId)
    .eq('type', type)
    .maybeSingle();

  if (existing) {
    // Toggle OFF — hapus accounting_entry dulu, lalu hapus payment
    await autoDeleteCashInFromPayment(existing.id);
    const { error } = await supabase.from('participant_payments').delete().eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    // Toggle ON — insert with template amount + auto-create cash_in
    const created_by = user.user_metadata?.full_name || user.email || 'unknown';
    const today = new Date().toISOString().slice(0, 10);
    const amount = parseInt(templateAmount) || 0;

    const { data: inserted, error } = await supabase.from('participant_payments').insert({
      passenger_id: passengerId,
      type,
      amount,
      paid_at: today,
      created_by,
    }).select().maybeSingle();
    if (error) return { error: error.message };

    if (inserted && amount > 0) {
      await autoCreateCashInFromPayment({
        paymentId: inserted.id,
        tripId,
        passengerId,
        type,
        amount,
      });
    }
  }

  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  return { ok: true };
}

// Update the group payment template — accepts any key prefixed with tpl_
export async function updatePaymentTemplate(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const template = {};
  const dues = {};
  // Iterate over ALL form entries: tpl_* = nominal, due_* = tanggal deadline
  for (const [name, value] of formData.entries()) {
    if (name.startsWith('tpl_')) {
      const key = name.slice(4);
      const v = parseInt(value);
      if (Number.isFinite(v) && v >= 0 && key) template[key] = v;
    } else if (name.startsWith('due_')) {
      const k = name.slice(4);
      const d = String(value || '').trim();
      if (k && d) dues[k] = d;
    }
  }

  // Sinkron ke jadwal web (web_payment_schedule) + DP — agar tampil & konsisten di web.
  const ORDER = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'Pelunasan'];
  const webSched = [];
  for (const k of ORDER) {
    const amt = Number(template[k]) || 0;
    const due = dues[k] || '';
    if (k === 'Pelunasan') { if (amt > 0 || due) webSched.push({ type: 'Pelunasan', amount: 0, due }); }
    else if (amt > 0 || due) webSched.push({ type: k, amount: amt, due });
  }

  const upd = { payment_template: template, web_payment_schedule: webSched };
  if (Object.prototype.hasOwnProperty.call(template, 'DP')) upd.dp_amount = Number(template.DP) || 0;

  const { error } = await supabase.from('trips').update(upd).eq('id', tripId);
  if (error) return { error: error.message };

  revalidatePath(`/finance/payments/${tripId}`);
  return { ok: true };
}

// Update payment notes for a participant payment
export async function updatePaymentNotes(paymentId, tripId, notes) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const { error } = await supabase
    .from('participant_payments')
    .update({ notes: notes || null })
    .eq('id', paymentId);

  if (error) return { error: error.message };

  revalidatePath(`/finance/payments/${tripId}`);
  return { ok: true };
}

// Update amount of a specific payment row (override template for this peserta)
// Juga update amount di accounting_entry yang linked (kalau ada)
export async function updatePaymentAmount(paymentId, tripId, newAmount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const amt = parseInt(newAmount) || 0;

  const { error } = await supabase
    .from('participant_payments')
    .update({ amount: amt })
    .eq('id', paymentId);

  if (error) return { error: error.message };

  // Sync amount ke accounting_entry yang linked
  await supabase
    .from('accounting_entries')
    .update({ amount: amt })
    .eq('linked_payment_id', paymentId);

  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/accounting');
  return { ok: true };
}


// Pelunasan ALL: lunasi sisa pokok + Visa + Asuransi (yang di-include & belum dibayar) sekaligus.
export async function settlePelunasanAll(passengerId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }
  const created_by = user.user_metadata?.full_name || user.email || 'unknown';
  const today = new Date().toISOString().slice(0, 10);

  const { data: pax } = await supabase.from('trip_passengers').select('id, room_type, age_type, price_paid, discount_amount, include_visa, include_asuransi, visa_ready').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };
  const { data: trip } = await supabase.from('trips').select('price_breakdown, payment_template').eq('id', tripId).maybeSingle();
  const bd = trip?.price_breakdown || {};
  const tpl = (trip?.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};
  const vPrice = Number(tpl.Visa ?? tpl.visa) || Number(bd.visa) || 0;
  const aPrice = Number(tpl.Asuransi ?? tpl.asuransi) || Number(bd.asuransi) || 0;
  const { data: pays } = await supabase.from('participant_payments').select('type, amount').eq('passenger_id', passengerId);

  const mainExp = mainExpectedPerPassenger(pax, bd);
  const disc = Number(pax.discount_amount) || 0;
  const pokokExp = Math.max(mainExp - disc, 0);
  const pokokPaid = (pays || []).filter((x) => isPokokMilestone(x.type)).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pokok = Math.max(pokokExp - pokokPaid, 0);
  const hasVisa = (pays || []).some((x) => String(x.type).toLowerCase() === 'visa');
  const hasAsr = (pays || []).some((x) => String(x.type).toLowerCase() === 'asuransi');
  const visa = (pax.include_visa && !pax.visa_ready && !hasVisa) ? vPrice : 0;
  const asuransi = (pax.include_asuransi && !hasAsr) ? aPrice : 0;

  if (pokok <= 0 && visa <= 0 && asuransi <= 0) return { error: 'Tidak ada sisa untuk dilunasi.' };

  const ins = async (type, amt) => {
    if (amt <= 0) return;
    const { data: ex } = await supabase.from('participant_payments').select('id, amount').eq('passenger_id', passengerId).eq('type', type).maybeSingle();
    let pid;
    if (ex) { const newAmt = (Number(ex.amount) || 0) + amt; await supabase.from('participant_payments').update({ amount: newAmt, paid_at: today, created_by }).eq('id', ex.id); pid = ex.id; }
    else { const { data: nu } = await supabase.from('participant_payments').insert({ passenger_id: passengerId, type, amount: amt, paid_at: today, created_by }).select().maybeSingle(); pid = nu?.id; }
    if (pid) { try { await autoCreateCashInFromPayment({ paymentId: pid, tripId, passengerId, type, amount: amt }); } catch {} }
  };
  await ins('Pelunasan', pokok);
  await ins('Visa', visa);
  await ins('Asuransi', asuransi);

  try { const { sendPaymentReceivedWA } = await import('@/lib/actions/wa-payment-notif'); await sendPaymentReceivedWA(passengerId); } catch {}

  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  return { ok: true, settled: { pokok, visa, asuransi } };
}
