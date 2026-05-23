'use server';

// Round 82: Finance actions — DP/Total/Sisa + request/approve workflow

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
  const dp_paid = parseInt(formData.get('dp_paid')) || 0;
  const notes = formData.get('notes') || null;
  const vendor_name = formData.get('vendor_name') || null;

  if (!item_type || !category || !component) return { error: 'Category & component wajib' };
  if (total_amount <= 0) return { error: 'Total harga harus > 0' };

  // Payment status awal: lunas kalau DP = total, DP kalau dp > 0, else belum bayar
  let payment_status = 'belum bayar';
  if (dp_paid >= total_amount) payment_status = 'lunas';
  else if (dp_paid > 0) payment_status = 'DP';

  const payload = {
    trip_id: tripId,
    item_type,
    category,
    component,
    total_amount,
    dp_paid,
    notes,
    vendor_name: item_type === 'hpp' ? vendor_name : null,
    payment_status,
    // Auto sync ke request status kalau dp = total (lunas dibayar langsung)
    payment_request_status: dp_paid >= total_amount && item_type === 'hpp' ? 'paid' : null,
  };

  let { error } = await supabase.from('trip_finance_items').insert(payload);

  // Defensive: retry kalau ada kolom yang belum migrate
  if (error && /dp_paid|payment_request_status|vendor_name/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.dp_paid;
    delete stripped.payment_request_status;
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

// ============================================================
// PAYMENT REQUEST WORKFLOW
// ============================================================

export async function requestPaymentToAccounting(itemId, tripId, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const requested_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'requested',
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

export async function approvePayment(itemId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Approve = set payment_status='lunas', dp_paid = total, payment_request_status='paid'
  const { data: item } = await supabase.from('trip_finance_items').select('total_amount').eq('id', itemId).maybeSingle();
  const total = Number(item?.total_amount) || 0;

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'paid',
      payment_status: 'lunas',
      dp_paid: total, // sisa lunas
      payment_approved_at: new Date().toISOString(),
      payment_approved_by: approved_by,
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}

export async function rejectPayment(itemId, tripId, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_finance_items')
    .update({
      payment_request_status: 'rejected',
      payment_requested_note: reason || 'Rejected by finance',
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidateAll(tripId);
  return { ok: true };
}
