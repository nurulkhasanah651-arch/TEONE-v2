'use server';

// Round 85: Payment workflow refactor
// - Status awal: dp_paid=0 (Belum Dibayar)
// - Request Payment input AMOUNT → status=requested + payment_request_amount
// - Approve → dp_paid += request_amount → status auto-update (DP/Lunas)

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function revalidateAll(tripId) {
  if (tripId) {
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/finance/payments/${tripId}`);
  }
  revalidatePath('/finance');
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  revalidatePath('/dashboard');
}

export async function createFinanceItem(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const item_type = formData.get('type');
  const category = formData.get('category');
  const component = formData.get('component');
  const total_amount = parseInt(formData.get('total_amount')) || 0;
  const notes = formData.get('notes') || null;
  const vendor_name = formData.get('vendor_name') || null;

  if (!item_type || !category || !component) return { error: 'Category & component wajib' };
  if (total_amount <= 0) return { error: 'Total harga harus > 0' };

  // Status awal: pending (Belum Dibayar)
  const payload = {
    trip_id: tripId,
    item_type,
    category,
    component,
    total_amount,
    dp_paid: 0,
    payment_request_status: null,
    payment_request_amount: 0,
    notes,
    vendor_name: item_type === 'hpp' ? vendor_name : null,
    payment_status: 'belum bayar',
  };

  let { error } = await supabase.from('trip_finance_items').insert(payload);

  if (error && /dp_paid|payment_request_status|vendor_name|payment_request_amount/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.dp_paid;
    delete stripped.payment_request_status;
    delete stripped.payment_request_amount;
    delete stripped.vendor_name;
    const retry = await supabase.from('trip_finance_items').insert(stripped);
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

export async function deleteFinanceItem(itemId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('trip_finance_items').delete().eq('id', itemId);
  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

// ============================================================
// REQUEST PAYMENT — input AMOUNT yang mau dibayar (DP atau pelunasan)
// ============================================================
export async function requestPaymentToAccounting(itemId, tripId, note, amount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const requestAmt = parseInt(amount) || 0;
  if (requestAmt <= 0) return { error: 'Jumlah harus > 0' };

  const requested_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'requested',
      payment_request_amount: requestAmt,
      payment_requested_at: new Date().toISOString(),
      payment_requested_by: requested_by,
      payment_requested_note: (note || '').trim() || null,
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

export async function cancelPaymentRequest(itemId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

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

// ============================================================
// APPROVE — apply payment_request_amount ke dp_paid
// ============================================================
export async function approvePayment(itemId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Get current state
  const { data: item } = await supabase
    .from('trip_finance_items')
    .select('total_amount, dp_paid, payment_request_amount')
    .eq('id', itemId)
    .maybeSingle();

  if (!item) return { error: 'Item tidak ditemukan' };

  const total = Number(item.total_amount) || 0;
  const currentDp = Number(item.dp_paid) || 0;
  const reqAmt = Number(item.payment_request_amount) || 0;

  if (reqAmt <= 0) return { error: 'Tidak ada request payment yang pending' };

  // Apply: dp_paid += request_amount (cap di total)
  const newDp = Math.min(currentDp + reqAmt, total);
  const isLunas = newDp >= total;

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      dp_paid: newDp,
      payment_status: isLunas ? 'lunas' : 'DP',
      payment_request_status: null, // clear request
      payment_request_amount: 0,
      payment_approved_at: new Date().toISOString(),
      payment_approved_by: approved_by,
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true, new_dp: newDp, is_lunas: isLunas };
}

export async function rejectPayment(itemId, tripId, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'rejected',
      payment_request_amount: 0,
      payment_requested_note: reason || 'Rejected by finance',
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

// Legacy update payment status (manual)
export async function updatePaymentStatus(itemId, tripId, payment_status) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_finance_items')
    .update({ payment_status })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}
