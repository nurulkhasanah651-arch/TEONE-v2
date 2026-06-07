'use server';

// Round 179: Finance actions — extended dengan basic_fare/qty/deposit/deadline + skip_deposit
// 2-step flow: Request Deposit → Approve → Request Pelunasan → Approve → Lunas
// (Plus skip_deposit: langsung Request Pelunasan = full amount)
// Path: lib/actions/finance.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function revalidateAll(tripId) {
  if (tripId) {
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/finance/payments/${tripId}`);
    revalidatePath(`/accounting/groups/${tripId}`);
  }
  revalidatePath('/finance');
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  revalidatePath('/dashboard');
}

function n(v) { const x = Number(String(v ?? '').replace(/[^0-9]/g, '')); return isNaN(x) ? 0 : x; }

export async function createFinanceItem(tripId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const item_type    = (formData.get('type') || '').toString();
  const category     = (formData.get('category') || '').toString();
  const component    = (formData.get('component') || '').toString();
  const basic_fare   = n(formData.get('basic_fare'));
  const qty          = n(formData.get('qty')) || 1;
  const total_amount = n(formData.get('total_amount')) || (basic_fare * qty);
  const deposit_planned    = n(formData.get('deposit_planned'));
  const skip_deposit       = formData.get('skip_deposit') === '1';
  const deadline_deposit   = formData.get('deadline_deposit') || null;
  const deadline_pelunasan = formData.get('deadline_pelunasan') || null;
  const notes        = (formData.get('notes') || '').toString().trim() || null;
  const vendor_name  = (formData.get('vendor_name') || '').toString().trim() || null;
  const payment_status_init = (formData.get('payment_status') || 'belum bayar').toString();

  if (!item_type || !category || !component) return { error: 'Category & component wajib' };
  if (total_amount <= 0) return { error: 'Total harga harus > 0' };

  const initialPhase = skip_deposit ? 'pelunasan' : 'deposit';

  const payload = {
    trip_id: tripId,
    item_type,
    category,
    component,
    basic_fare,
    qty,
    total_amount,
    dp_paid: 0,
    deposit_planned: skip_deposit ? 0 : deposit_planned,
    deadline_deposit: skip_deposit ? null : (deadline_deposit || null),
    deadline_pelunasan: deadline_pelunasan || null,
    payment_phase: initialPhase,
    payment_request_status: null,
    payment_request_amount: 0,
    payment_status: payment_status_init,
    skip_deposit,
    notes,
    vendor_name: item_type === 'hpp' ? vendor_name : null,
  };

  // Try full insert, defensive strip kalau column missing
  let { error } = await supabase.from('trip_finance_items').insert(payload);

  if (error) {
    // Strip optional columns satu-satu
    const tryStripFields = ['skip_deposit', 'deadline_deposit', 'basic_fare', 'qty', 'deposit_planned', 'deadline_pelunasan', 'payment_phase', 'payment_request_status', 'payment_request_amount', 'dp_paid', 'vendor_name'];
    for (const field of tryStripFields) {
      if (error && new RegExp(field, 'i').test(error.message)) {
        const stripped = { ...payload };
        for (const f of tryStripFields) delete stripped[f];
        // re-add basic ones (gunakan basic_fare jadi total kalau perlu)
        const r = await supabase.from('trip_finance_items').insert(stripped);
        error = r.error;
        if (!error) break;
      }
    }
  }

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

export async function deleteFinanceItem(itemId, tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase.from('trip_finance_items').delete().eq('id', itemId);
  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

// ============ REQUEST PAYMENT ============
/**
 * @param phase 'deposit' | 'pelunasan'
 * @param amount nominal. Kalau gak di-set, default = deposit_planned (untuk DP) atau sisa (untuk pelunasan)
 */
export async function requestPaymentToAccounting(itemId, tripId, note, amount, phase = 'deposit') {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  let requestAmt = n(amount);
  // Auto-fill kalau gak di-input
  if (requestAmt <= 0) {
    const { data: item } = await supabase
      .from('trip_finance_items')
      .select('total_amount, deposit_planned, dp_paid, skip_deposit')
      .eq('id', itemId)
      .maybeSingle();
    if (item) {
      const total = Number(item.total_amount) || 0;
      const planned = Number(item.deposit_planned) || 0;
      const paid = Number(item.dp_paid) || 0;
      if (phase === 'deposit') {
        requestAmt = planned > 0 ? planned : total;
      } else {
        requestAmt = item.skip_deposit ? total : Math.max(total - paid, 0);
      }
    }
  }
  if (requestAmt <= 0) return { error: 'Jumlah harus > 0' };

  const requested_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'requested',
      payment_request_amount: requestAmt,
      payment_phase: phase,
      payment_requested_at: new Date().toISOString(),
      payment_requested_by: requested_by,
      payment_requested_note: (note || '').toString().trim() || null,
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true, amount: requestAmt, phase };
}

export async function cancelPaymentRequest(itemId, tripId) {
  const supabase = getServiceClient() || createClient();
  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: null,
      payment_request_amount: 0,
      payment_requested_at: null,
      payment_requested_by: null,
      payment_requested_note: null,
    })
    .eq('id', itemId)
    .eq('payment_request_status', 'requested');

  if (error) return { error: error.message };
  revalidateAll(tripId);
  return { ok: true };
}

// ============ APPROVE — apply request_amount ke dp_paid + update payment_status ============
export async function approvePayment(itemId, tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: item } = await supabase
    .from('trip_finance_items')
    .select('total_amount, dp_paid, payment_request_amount, payment_phase, skip_deposit')
    .eq('id', itemId)
    .maybeSingle();

  if (!item) return { error: 'Item tidak ditemukan' };

  const total = Number(item.total_amount) || 0;
  const currentDp = Number(item.dp_paid) || 0;
  const reqAmt = Number(item.payment_request_amount) || 0;
  if (reqAmt <= 0) return { error: 'Tidak ada request payment pending' };

  const newDp = Math.min(currentDp + reqAmt, total);
  const isLunas = newDp >= total;

  const newStatus = isLunas
    ? 'lunas'
    : (item.skip_deposit ? 'DP (langsung pelunasan)' : 'DP');

  const todayStr = new Date().toISOString().slice(0, 10);
  const updPayload = {
    dp_paid: newDp,
    payment_status: newStatus,
    payment_request_status: null,
    payment_request_amount: 0,
    payment_phase: isLunas ? 'pelunasan' : (item.skip_deposit ? 'pelunasan' : 'pelunasan'),
    payment_approved_at: new Date().toISOString(),
    payment_approved_by: approved_by,
    transfer_date: todayStr,
    payoff_date: isLunas ? todayStr : null,
  };

  let { error } = await supabase.from('trip_finance_items').update(updPayload).eq('id', itemId);
  if (error && /transfer_date|payoff_date|column/i.test(error.message)) {
    delete updPayload.transfer_date;
    delete updPayload.payoff_date;
    const retry = await supabase.from('trip_finance_items').update(updPayload).eq('id', itemId);
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true, new_dp: newDp, is_lunas: isLunas, new_status: newStatus };
}

export async function rejectPayment(itemId, tripId, reason) {
  const supabase = getServiceClient() || createClient();
  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'rejected',
      payment_request_amount: 0,
      payment_requested_note: (reason || 'Rejected by finance').toString(),
    })
    .eq('id', itemId);

  if (error) return { error: error.message };
  revalidateAll(tripId);
  return { ok: true };
}

export async function updatePaymentStatus(itemId, tripId, payment_status) {
  const supabase = getServiceClient() || createClient();
  const { error } = await supabase
    .from('trip_finance_items')
    .update({ payment_status })
    .eq('id', itemId);

  if (error) return { error: error.message };
  revalidateAll(tripId);
  return { ok: true };
}
