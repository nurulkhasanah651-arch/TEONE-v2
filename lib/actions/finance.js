'use server';

// Finance items server actions

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createFinanceItem(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const item_type = formData.get('type'); // 'hpp' or 'income' — column is item_type
  const category = formData.get('category');
  const component = formData.get('component');
  const basic_fare = parseInt(formData.get('basic_fare')) || 0;
  const qty = parseInt(formData.get('qty')) || 0;
  const total_amount = parseInt(formData.get('total_amount')) || basic_fare * qty;
  const notes = formData.get('notes') || null;
  const vendor_name = formData.get('vendor_name') || null;
  const payment_status = formData.get('payment_status') || 'belum bayar';

  if (!item_type || !category || !component) return { error: 'Category & component wajib' };

  const payload = {
    trip_id: tripId,
    item_type,
    category,
    component,
    basic_fare,
    qty,
    total_amount,
    notes,
    ...(item_type === 'hpp' ? { vendor_name, payment_status } : {}),
  };

  const { error } = await supabase.from('trip_finance_items').insert(payload);
  if (error) return { error: error.message };

  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance');
  return { ok: true };
}

export async function deleteFinanceItem(itemId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('trip_finance_items').delete().eq('id', itemId);
  if (error) return { error: error.message };

  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath('/finance/cashflow');
  return { ok: true };
}

export async function updatePaymentStatus(itemId, tripId, payment_status) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_finance_items')
    .update({ payment_status })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidatePath(`/finance/cashflow/${tripId}`);
  return { ok: true };
}
