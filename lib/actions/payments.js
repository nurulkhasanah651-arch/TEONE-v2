'use server';

// Participant payment milestones — CRUD

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
    passenger_id: passengerId,
    type,
    label,
    amount,
    paid_at,
    due_at,
    notes,
    created_by,
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
