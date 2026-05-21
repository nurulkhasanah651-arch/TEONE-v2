'use server';

// Bank/cash accounts management

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createAccount(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = (formData.get('name') || '').trim();
  const type = formData.get('type') || 'bank';
  const account_number = (formData.get('account_number') || '').trim() || null;
  const starting_balance = parseInt(formData.get('starting_balance')) || 0;
  const notes = (formData.get('notes') || '').trim() || null;

  if (!name) return { error: 'Nama akun wajib diisi' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('accounts').insert({
    name, type, account_number, starting_balance, notes, created_by,
  });

  if (error) return { error: error.message };

  revalidatePath('/accounting/accounts');
  revalidatePath('/accounting');
  redirect('/accounting/accounts');
}

export async function updateAccount(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const updates = {
    name: (formData.get('name') || '').trim(),
    type: formData.get('type') || 'bank',
    account_number: (formData.get('account_number') || '').trim() || null,
    starting_balance: parseInt(formData.get('starting_balance')) || 0,
    notes: (formData.get('notes') || '').trim() || null,
  };

  if (!updates.name) return { error: 'Nama akun wajib diisi' };

  const { error } = await supabase.from('accounts').update(updates).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/accounting/accounts');
  revalidatePath('/accounting');
  redirect('/accounting/accounts');
}

export async function deleteAccount(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Don't allow delete if there are entries — soft delete via active=false instead
  const { count } = await supabase.from('accounting_entries').select('id', { count: 'exact', head: true }).eq('account_id', id);
  if (count && count > 0) {
    // Soft-delete: mark inactive
    await supabase.from('accounts').update({ active: false }).eq('id', id);
  } else {
    await supabase.from('accounts').delete().eq('id', id);
  }

  revalidatePath('/accounting/accounts');
  revalidatePath('/accounting');
  return { ok: true };
}
