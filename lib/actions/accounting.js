'use server';

// Accounting entries — manual cash in/out

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createAccountingEntry(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const type = formData.get('type');
  const amount = parseInt(formData.get('amount')) || 0;
  const category = (formData.get('category') || '').trim() || null;
  const description = (formData.get('description') || '').trim() || null;
  const trip_id = formData.get('trip_id') || null;
  const date = formData.get('date') || new Date().toISOString().slice(0, 10);

  if (!type || !['in', 'out'].includes(type)) return { error: 'Type harus "in" atau "out"' };
  if (amount <= 0) return { error: 'Amount harus > 0' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('accounting_entries').insert({
    type, amount, category, description, trip_id: trip_id || null, date, created_by,
  });

  if (error) return { error: error.message };

  revalidatePath('/accounting');
  redirect('/accounting');
}

export async function deleteAccountingEntry(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('accounting_entries').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/accounting');
  return { ok: true };
}
