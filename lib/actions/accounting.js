'use server';

// Accounting entries — manual cash in/out + auto from payment + linked HPP

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
  const account_id = parseInt(formData.get('account_id')) || null;
  const date = formData.get('date') || new Date().toISOString().slice(0, 10);
  const linked_finance_item_id = parseInt(formData.get('linked_finance_item_id')) || null;

  if (!type || !['in', 'out'].includes(type)) return { error: 'Type harus "in" atau "out"' };
  if (amount <= 0) return { error: 'Amount harus > 0' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    type, amount, category, description, trip_id: trip_id || null, date, created_by,
  };
  if (account_id) payload.account_id = account_id;
  if (linked_finance_item_id) payload.linked_finance_item_id = linked_finance_item_id;

  const { error } = await supabase.from('accounting_entries').insert(payload);

  if (error) return { error: error.message };

  // Kalau cash OUT di-link ke HPP item, auto-mark item itu lunas di finance
  if (type === 'out' && linked_finance_item_id) {
    await supabase
      .from('trip_finance_items')
      .update({ payment_status: 'lunas' })
      .eq('id', linked_finance_item_id);

    if (trip_id) {
      revalidatePath(`/finance/cashflow/${trip_id}`);
      revalidatePath(`/accounting/groups/${trip_id}`);
    }
    revalidatePath('/finance/cashflow');
    revalidatePath('/finance');
  }

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

// Helper: dipanggil dari payments.js saat toggle milestone ON
// Auto-create cash_in entry pakai default account (first active bank/cash)
export async function autoCreateCashInFromPayment({ paymentId, tripId, passengerId, type, amount }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', skipped: true };
  if (!amount || amount <= 0) return { skipped: true };

  // Cari default account — first active bank/cash
  const { data: accounts } = await supabase.from('accounts').select('id, name, type, active').order('name');
  const activeAccts = (accounts || []).filter((a) => a.active !== false);
  const defaultAcct = activeAccts.find((a) => a.type === 'bank') || activeAccts[0];
  if (!defaultAcct) return { skipped: true, reason: 'no_account' };

  // Cari nama peserta + kode trip buat description
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('customer_id, trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  const customer_id = pax?.customer_id;

  let custName = '';
  if (customer_id) {
    const { data: cust } = await supabase.from('customers').select('name').eq('id', customer_id).maybeSingle();
    custName = cust?.name || '';
  }

  const { data: trip } = await supabase.from('trips').select('kode_trip, name').eq('id', tripId).maybeSingle();
  const tripLabel = trip?.kode_trip || trip?.name || '';

  const created_by = user.user_metadata?.full_name || user.email || 'auto';

  const payload = {
    type: 'in',
    amount,
    category: 'Payment Peserta',
    description: `${type} - ${custName || 'peserta'}${tripLabel ? ' - ' + tripLabel : ''}`,
    trip_id: tripId,
    account_id: defaultAcct.id,
    date: new Date().toISOString().slice(0, 10),
    created_by,
    linked_payment_id: paymentId,
  };

  const { error } = await supabase.from('accounting_entries').insert(payload);
  if (error) return { error: error.message };
  return { ok: true };
}

// Helper: dipanggil saat toggle milestone OFF — hapus accounting_entry yg linked
export async function autoDeleteCashInFromPayment(paymentId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { skipped: true };

  await supabase.from('accounting_entries').delete().eq('linked_payment_id', paymentId);
  return { ok: true };
}
