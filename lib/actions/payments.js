'use server';

// Participant payment milestones — CRUD + group template management

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const STANDARD_TYPES = ['DP', 'P1', 'P2', 'P3', 'Pelunasan', 'Visa', 'Asuransi'];

export async function addPayment(passengerId, tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const type = formData.get('type');
  const label = (formData.get('label') || '').trim() || null;
  const amount = parseInt(formData.get('amount')) || 0;
  const paid_at = formData.get('paid_at') || null;
  const due_at = formData.get('due_at') || null;
  const notes = (formData.get('notes') || '').trim() || null;

  if (!type) return { error: 'Type payment wajib dipilih' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('participant_payments').insert({
    passenger_id: passengerId, type, label, amount, paid_at, due_at, notes, created_by,
  });

  if (error) return { error: error.message };

  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/finance/payments');
  return { ok: true };
}

export async function deletePayment(paymentId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('participant_payments').delete().eq('id', paymentId);
  if (error) return { error: error.message };

  revalidatePath(`/finance/payments/${tripId}`);
  return { ok: true };
}

// Toggle a milestone for a passenger — if already exists, delete it; else insert with template amount
export async function toggleMilestone(passengerId, tripId, type, templateAmount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Check if a payment of this type already exists for this passenger
  const { data: existing } = await supabase
    .from('participant_payments')
    .select('id')
    .eq('passenger_id', passengerId)
    .eq('type', type)
    .maybeSingle();

  if (existing) {
    // Toggle OFF — delete
    const { error } = await supabase.from('participant_payments').delete().eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    // Toggle ON — insert with template amount
    const created_by = user.user_metadata?.full_name || user.email || 'unknown';
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('participant_payments').insert({
      passenger_id: passengerId,
      type,
      amount: parseInt(templateAmount) || 0,
      paid_at: today,
      created_by,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath('/finance/payments');
  return { ok: true };
}

// Update the group payment template (nominal per milestone)
export async function updatePaymentTemplate(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const template = {};
  for (const t of STANDARD_TYPES) {
    const v = parseInt(formData.get(`tpl_${t}`));
    if (Number.isFinite(v) && v >= 0) template[t] = v;
  }

  const { error } = await supabase
    .from('trips')
    .update({ payment_template: template })
    .eq('id', tripId);

  if (error) return { error: error.message };

  revalidatePath(`/finance/payments/${tripId}`);
  return { ok: true };
}

// Update amount of a specific payment row (override template for this peserta)
export async function updatePaymentAmount(paymentId, tripId, newAmount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('participant_payments')
    .update({ amount: parseInt(newAmount) || 0 })
    .eq('id', paymentId);

  if (error) return { error: error.message };

  revalidatePath(`/finance/payments/${tripId}`);
  return { ok: true };
}
