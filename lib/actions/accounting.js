'use server';

// Accounting entries — manual cash in/out + auto from payment + linked HPP
// + Payment Request approval workflow (Round 34)

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

// Helper untuk payments.js
export async function autoCreateCashInFromPayment({ paymentId, tripId, passengerId, type, amount }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', skipped: true };
  if (!amount || amount <= 0) return { skipped: true };

  const { data: accounts } = await supabase.from('accounts').select('id, name, type, active').order('name');
  const activeAccts = (accounts || []).filter((a) => a.active !== false);
  const defaultAcct = activeAccts.find((a) => a.type === 'bank') || activeAccts[0];
  if (!defaultAcct) return { skipped: true, reason: 'no_account' };

  const { data: pax } = await supabase.from('trip_passengers').select('customer_id, trip_id').eq('id', passengerId).maybeSingle();
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

export async function autoDeleteCashInFromPayment(paymentId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { skipped: true };
  await supabase.from('accounting_entries').delete().eq('linked_payment_id', paymentId);
  return { ok: true };
}

// ============================================================
// APPROVE PAYMENT REQUEST (Round 34)
// ============================================================
// Accounting approve request HPP dari Finance:
//   1. Set payment_request_status='approved' + transfer_date + approved_by/account
//   2. Set payment_status='lunas'
//   3. Insert accounting_entries cash_out linked ke item
// ============================================================
export async function approvePaymentRequest(itemId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const transfer_date = formData.get('transfer_date');
  const account_id = parseInt(formData.get('account_id')) || null;

  if (!transfer_date) return { error: 'Tanggal transfer wajib' };
  if (!account_id) return { error: 'Pilih akun bank/kas untuk cash out' };

  // Fetch item dulu untuk dapat trip_id, amount, vendor, dll
  const { data: item, error: fetchErr } = await supabase
    .from('trip_finance_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchErr || !item) return { error: 'Item tidak ditemukan' };
  if (item.payment_request_status === 'approved') return { error: 'Request sudah pernah di-approve' };

  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';
  const amount = item.total_amount || 0;
  const trip_id = item.trip_id;

  // Update finance item: approve + lunas + transfer_date
  const { error: updateErr } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'approved',
      payment_status: 'lunas',
      transfer_date,
      approved_at: new Date().toISOString(),
      approved_by,
      approved_account_id: account_id,
    })
    .eq('id', itemId);

  if (updateErr) return { error: 'Update item gagal: ' + updateErr.message };

  // Get trip label untuk description
  const { data: trip } = await supabase.from('trips').select('kode_trip, name').eq('id', trip_id).maybeSingle();
  const tripLabel = trip?.kode_trip || trip?.name || `#${trip_id}`;

  const description = `${item.category} - ${item.component}${item.vendor_name ? ' (' + item.vendor_name + ')' : ''} [${tripLabel}]`;

  // Insert accounting_entry cash_out
  const { error: entryErr } = await supabase.from('accounting_entries').insert({
    type: 'out',
    amount,
    category: 'Vendor Trip (HPP)',
    description,
    trip_id,
    account_id,
    date: transfer_date,
    created_by: approved_by,
    linked_finance_item_id: itemId,
  });

  if (entryErr) return { error: 'Cash out entry gagal: ' + entryErr.message };

  revalidatePath('/accounting');
  revalidatePath(`/accounting/groups/${trip_id}`);
  revalidatePath(`/finance/cashflow/${trip_id}`);
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance');
  return { ok: true };
}

export async function rejectPaymentRequest(itemId, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const rejected_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Get trip_id untuk revalidate
  const { data: item } = await supabase.from('trip_finance_items').select('trip_id').eq('id', itemId).maybeSingle();

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'rejected',
      approved_at: new Date().toISOString(),
      approved_by: rejected_by,
      payment_requested_note: (reason || '').trim() || null,
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidatePath('/accounting');
  if (item?.trip_id) revalidatePath(`/finance/cashflow/${item.trip_id}`);
  return { ok: true };
}
