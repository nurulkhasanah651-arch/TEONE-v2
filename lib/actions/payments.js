'use server';

// Participant payment milestones — CRUD + group template management
// + auto-sync ke accounting saat toggle ON/OFF

import { revalidatePath } from 'next/cache';
import { assertStaff } from '@/lib/auth/require-staff';
import { createClient } from '@/lib/supabase/server';
import { autoCreateCashInFromPayment, autoDeleteCashInFromPayment } from '@/lib/actions/accounting';

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
  // Iterate over ALL form entries to pick any tpl_* keys (supports custom items)
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith('tpl_')) continue;
    const key = name.slice(4); // remove 'tpl_' prefix
    const v = parseInt(value);
    if (Number.isFinite(v) && v >= 0 && key) template[key] = v;
  }

  const { error } = await supabase
    .from('trips')
    .update({ payment_template: template })
    .eq('id', tripId);

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
