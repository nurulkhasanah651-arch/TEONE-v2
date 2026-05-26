'use server';

// Round 115: Refund peserta — cancel / visa rejected / other
// File: lib/actions/refunds.js

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Get total paid by passenger (sum dari participant_payments)
 */
export async function getPassengerTotalPaid(passengerId) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set', total: 0 };

  try {
    const { data } = await supabase
      .from('participant_payments')
      .select('amount')
      .eq('passenger_id', passengerId);
    const total = (data || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return { ok: true, total };
  } catch (e) {
    return { error: e?.message, total: 0 };
  }
}

/**
 * Create refund record + update passenger status + sync to accounting
 *
 * @param {Object} params
 * @param {string} params.passengerId
 * @param {string} params.reason - 'cancel' | 'visa_rejected' | 'medical' | 'other'
 * @param {string} params.reasonDetail - text bebas
 * @param {number} params.refundAmount - nominal yang di-refund (bisa < total)
 * @param {number} params.totalPaid - total yang udah dibayar (untuk hitung admin fee)
 * @param {string} params.refundMethod - 'transfer' | 'cash' | 'other'
 * @param {string} params.bankName - bank tujuan refund
 * @param {string} params.accountNo - rekening tujuan
 * @param {string} params.accountName - nama pemilik rekening
 * @param {string} params.notes - catatan tambahan
 */
export async function createRefund({
  passengerId,
  reason,
  reasonDetail = '',
  refundAmount,
  totalPaid,
  refundMethod = 'transfer',
  bankName = '',
  accountNo = '',
  accountName = '',
  notes = '',
}) {
  if (!passengerId) return { error: 'passengerId wajib' };
  if (!reason) return { error: 'reason wajib (cancel/visa_rejected/medical/other)' };
  if (refundAmount == null || Number(refundAmount) < 0) {
    return { error: 'refundAmount wajib (boleh 0 kalau full admin fee)' };
  }

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    // 1. Fetch passenger detail
    const { data: pax, error: paxErr } = await supabase
      .from('trip_passengers').select('*').eq('id', passengerId).maybeSingle();
    if (paxErr || !pax) return { error: 'Peserta tidak ditemukan' };
    if (pax.refund_status === 'refunded') {
      return { error: 'Peserta sudah di-refund sebelumnya' };
    }

    // 2. Fetch trip detail (untuk snapshot)
    const { data: trip } = await supabase
      .from('trips').select('id, name, kode_trip').eq('id', pax.trip_id).maybeSingle();

    // 3. Auto-calculate total_paid kalau gak di-pass
    let actualTotalPaid = Number(totalPaid || 0);
    if (!totalPaid) {
      const { data: payments } = await supabase
        .from('participant_payments').select('amount').eq('passenger_id', passengerId);
      actualTotalPaid = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    }

    const refundAmt = Number(refundAmount);
    const adminFee = Math.max(actualTotalPaid - refundAmt, 0);
    const isPartialRefund = refundAmt > 0 && refundAmt < actualTotalPaid;

    // 4. Insert refund record
    const refundData = {
      passenger_id: passengerId,
      trip_id: pax.trip_id,
      passenger_name: pax.name,
      passenger_phone: pax.phone,
      trip_name: trip?.name,
      trip_kode: trip?.kode_trip,
      reason,
      reason_detail: reasonDetail,
      total_paid: actualTotalPaid,
      refund_amount: refundAmt,
      admin_fee: adminFee,
      refund_method: refundMethod,
      refund_bank_name: bankName,
      refund_account_no: accountNo,
      refund_account_name: accountName,
      status: 'pending',
      notes,
    };

    const { data: refund, error: insertErr } = await supabase
      .from('refunds').insert(refundData).select().single();

    if (insertErr) return { error: 'Insert refund gagal: ' + insertErr.message };

    // 5. Update passenger status (soft delete)
    const newStatus = isPartialRefund ? 'partial_refund' : 'refunded';
    await supabase.from('trip_passengers').update({
      refund_status: newStatus,
      refunded_at: new Date().toISOString(),
      refund_amount: refundAmt,
      refund_reason: reason,
      refund_reason_detail: reasonDetail,
    }).eq('id', passengerId);

    // 6. Cancel unpaid invoices (kalau ada)
    try {
      const { data: invoices } = await supabase
        .from('invoices').select('*').eq('passenger_id', passengerId);
      for (const inv of (invoices || [])) {
        if (['sent', 'draft', 'overdue'].includes(inv.status)) {
          await supabase.from('invoices').update({
            status: 'cancelled',
            notes: (inv.notes || '') + `\n[Cancelled karena peserta refund: ${reason}]`,
          }).eq('id', inv.id);
        }
      }
    } catch (e) {
      // log but don't fail
    }

    // 7. Revalidate
    revalidatePath('/trips');
    revalidatePath(`/trips/${pax.trip_id}`);
    revalidatePath('/finance/payments');
    revalidatePath(`/finance/payments/${pax.trip_id}`);
    revalidatePath('/accounting');
    revalidatePath('/refunds');

    return {
      ok: true,
      refund,
      summary: {
        passenger: pax.name,
        totalPaid: actualTotalPaid,
        refundAmount: refundAmt,
        adminFee,
        status: newStatus,
      },
    };
  } catch (e) {
    return { error: 'Create refund gagal: ' + (e?.message || 'unknown') };
  }
}

/**
 * Update refund status (mark as processed / completed)
 */
export async function updateRefundStatus(refundId, status, userEmail = '') {
  if (!refundId) return { error: 'refundId wajib' };
  if (!['pending', 'processed', 'completed', 'cancelled'].includes(status)) {
    return { error: 'status invalid' };
  }

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const updateData = { status, updated_at: new Date().toISOString() };
    if (status === 'processed' || status === 'completed') {
      updateData.processed_at = new Date().toISOString();
      if (userEmail) updateData.processed_by = userEmail;
    }

    const { data, error } = await supabase
      .from('refunds').update(updateData).eq('id', refundId).select().single();
    if (error) return { error: error.message };

    revalidatePath('/refunds');
    revalidatePath('/accounting');

    return { ok: true, refund: data };
  } catch (e) {
    return { error: e?.message };
  }
}

/**
 * Undo refund — revert peserta jadi active, hapus refund record
 */
export async function undoRefund(refundId) {
  if (!refundId) return { error: 'refundId wajib' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: refund } = await supabase
      .from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (!refund) return { error: 'Refund tidak ditemukan' };

    // Restore peserta jadi active
    if (refund.passenger_id) {
      await supabase.from('trip_passengers').update({
        refund_status: 'active',
        refunded_at: null,
        refund_amount: null,
        refund_reason: null,
        refund_reason_detail: null,
      }).eq('id', refund.passenger_id);
    }

    // Hapus refund record
    await supabase.from('refunds').delete().eq('id', refundId);

    revalidatePath('/trips');
    if (refund.trip_id) revalidatePath(`/trips/${refund.trip_id}`);
    revalidatePath('/refunds');
    revalidatePath('/accounting');

    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

/**
 * Get refund list (untuk page /refunds)
 */
export async function getRefunds({ tripId = null, status = null, limit = 100 } = {}) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set', data: [] };

  try {
    let query = supabase.from('refunds').select('*');
    if (tripId) query = query.eq('trip_id', tripId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) return { error: error.message, data: [] };

    return { ok: true, data: data || [] };
  } catch (e) {
    return { error: e?.message, data: [] };
  }
}
