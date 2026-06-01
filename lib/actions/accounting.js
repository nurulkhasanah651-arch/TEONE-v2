'use server';

// Round 180c: Accounting actions — approvePaymentRequest pakai payment_request_amount (DP/Pelunasan), bukan total_amount
// Auto-update payment_status berdasarkan cumulative dp_paid vs total_amount
// Path: lib/actions/accounting.js

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============ MANUAL ENTRY ============
export async function createAccountingEntry(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

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
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase.from('accounting_entries').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/accounting');
  return { ok: true };
}

// ============ AUTO CASH IN FROM PAYMENT ============
export async function autoCreateCashInFromPayment({ paymentId, tripId, passengerId, type, amount }) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated', skipped: true };
  if (!amount || amount <= 0) return { skipped: true };

  const supabase = getServiceClient() || authClient;

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
  const supabase = getServiceClient() || createClient();
  await supabase.from('accounting_entries').delete().eq('linked_payment_id', paymentId);
  return { ok: true };
}

// ============ R180c: APPROVE PAYMENT REQUEST — pakai payment_request_amount ============
export async function approvePaymentRequest(itemId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const transfer_date = formData.get('transfer_date');
  const account_id = parseInt(formData.get('account_id')) || null;

  if (!transfer_date) return { error: 'Tanggal transfer wajib' };
  if (!account_id) return { error: 'Pilih akun bank/kas untuk cash out' };

  // Fetch item
  const { data: item, error: fetchErr } = await supabase
    .from('trip_finance_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchErr || !item) return { error: 'Item tidak ditemukan' };
  if (item.payment_request_status === 'approved') return { error: 'Request sudah pernah di-approve' };

  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  // R180c: pakai payment_request_amount, bukan total_amount
  const total = Number(item.total_amount) || 0;
  const currentDp = Number(item.dp_paid) || 0;
  const reqAmt = Number(item.payment_request_amount) || 0;

  if (reqAmt <= 0) {
    return { error: 'Tidak ada nominal request — kemungkinan data lama. Coba Cancel request di Finance lalu Request ulang.' };
  }

  const newDp = Math.min(currentDp + reqAmt, total);
  const isLunas = newDp >= total;
  const newStatus = isLunas
    ? 'lunas'
    : (item.skip_deposit ? 'DP (langsung pelunasan)' : 'DP');
  const nextPhase = isLunas ? 'pelunasan' : 'pelunasan'; // setelah DP → siap pelunasan

  const trip_id = item.trip_id;

  // Update finance item: apply request_amount ke dp_paid
  const updPayload = {
    payment_request_status: null,
    payment_request_amount: 0,
    payment_status: newStatus,
    payment_phase: nextPhase,
    dp_paid: newDp,
    transfer_date,
    approved_at: new Date().toISOString(),
    approved_by,
    approved_account_id: account_id,
  };
  // Set payoff_date kalau lunas
  if (isLunas) updPayload.payoff_date = transfer_date;

  let { error: updateErr } = await supabase
    .from('trip_finance_items')
    .update(updPayload)
    .eq('id', itemId);

  // Defensive: kalau ada kolom yg gak ada, retry tanpa optional fields
  if (updateErr && /payoff_date|approved_account_id|column/i.test(updateErr.message)) {
    delete updPayload.payoff_date;
    delete updPayload.approved_account_id;
    const retry = await supabase.from('trip_finance_items').update(updPayload).eq('id', itemId);
    updateErr = retry.error;
  }
  if (updateErr) return { error: 'Update item gagal: ' + updateErr.message };

  // Get trip label
  const { data: trip } = await supabase.from('trips').select('kode_trip, name').eq('id', trip_id).maybeSingle();
  const tripLabel = trip?.kode_trip || trip?.name || `#${trip_id}`;

  // Determine phase label untuk description
  const phaseLabel = item.payment_phase === 'deposit' ? 'DP' : 'Pelunasan';
  const description = `${item.category} - ${item.component}${item.vendor_name ? ' (' + item.vendor_name + ')' : ''} [${tripLabel}] · ${phaseLabel}`;

  // Insert accounting_entry — pakai reqAmt (yg di-request), BUKAN total_amount
  const { error: entryErr } = await supabase.from('accounting_entries').insert({
    type: 'out',
    amount: reqAmt,  // R180c: nominal yg di-request
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
  return { ok: true, amount_paid: reqAmt, new_dp: newDp, is_lunas: isLunas, status: newStatus };
}

export async function rejectPaymentRequest(itemId, reason) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const rejected_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: item } = await supabase.from('trip_finance_items').select('trip_id').eq('id', itemId).maybeSingle();

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'rejected',
      payment_request_amount: 0,
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
