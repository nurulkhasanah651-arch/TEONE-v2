'use server';

// Round 116: Refund workflow dengan APPROVAL — status pending_approval → approved/rejected
// Approve → auto-create HPP item kategori 'Refund' di trip → sync ke accounting cash out (R104)

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

export async function getPassengerTotalPaid(passengerId) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set', total: 0 };

  try {
    const { data } = await supabase
      .from('participant_payments')
      .select('amount')
      .eq('passenger_id', passengerId)
      .eq('is_transferred', false);
    const total = (data || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return { ok: true, total };
  } catch (e) {
    return { error: e?.message, total: 0 };
  }
}

/**
 * REQUEST refund — status='pending_approval', tunggu approve di /refunds page
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
  if (!reason) return { error: 'reason wajib' };
  if (refundAmount == null || Number(refundAmount) < 0) {
    return { error: 'refundAmount wajib' };
  }

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: pax, error: paxErr } = await supabase
      .from('trip_passengers').select('*').eq('id', passengerId).maybeSingle();
    if (paxErr || !pax) return { error: 'Peserta tidak ditemukan' };
    if (pax.refund_status === 'refunded') {
      return { error: 'Peserta sudah di-refund sebelumnya' };
    }

    const { data: trip } = await supabase
      .from('trips').select('id, name, kode_trip').eq('id', pax.trip_id).maybeSingle();

    let actualTotalPaid = Number(totalPaid || 0);
    if (!totalPaid) {
      const { data: payments } = await supabase
        .from('participant_payments').select('amount')
        .eq('passenger_id', passengerId).eq('is_transferred', false);
      actualTotalPaid = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    }

    const refundAmt = Number(refundAmount);
    const adminFee = Math.max(actualTotalPaid - refundAmt, 0);

    // ROUND 116: Status default 'pending_approval'
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
      status: 'pending_approval', // ← TUNGGU APPROVE
      notes,
    };

    const { data: refund, error: insertErr } = await supabase
      .from('refunds').insert(refundData).select().single();
    if (insertErr) return { error: 'Insert refund gagal: ' + insertErr.message };

    // ROUND 116: BELUM update passenger status — masih nunggu approve
    // Setelah approved baru passenger jadi 'refunded'

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    revalidatePath(`/trips/${pax.trip_id}`);

    return {
      ok: true,
      refund,
      summary: {
        passenger: pax.name,
        totalPaid: actualTotalPaid,
        refundAmount: refundAmt,
        adminFee,
        status: 'pending_approval',
      },
    };
  } catch (e) {
    return { error: 'Create refund gagal: ' + (e?.message || 'unknown') };
  }
}

/**
 * APPROVE refund — buat HPP item kategori 'Refund' → auto-sync ke accounting cash out
 */
export async function approveRefund(refundId, userEmail = '') {
  if (!refundId) return { error: 'refundId wajib' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: refund } = await supabase
      .from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (!refund) return { error: 'Refund tidak ditemukan' };
    if (refund.status !== 'pending_approval') {
      return { error: `Refund sudah di-${refund.status}, gak bisa di-approve lagi` };
    }

    const approvedAt = new Date().toISOString();

    // 1. Create HPP item di trip — kategori 'Refund'
    let hppItemId = null;
    try {
      const hppPayload = {
        trip_id: refund.trip_id,
        item_type: 'hpp',
        category: 'Refund',
        component: `Refund: ${refund.passenger_name || 'Peserta'} · ${refund.reason || ''}`,
        vendor_name: refund.passenger_name || '',
        basic_fare: refund.refund_amount,
        qty: 1,
        total_amount: refund.refund_amount,
        payment_status: 'lunas', // langsung lunas karena ini cash out instant
      };
      const { data: hppItem, error: hppErr } = await supabase
        .from('trip_finance_items').insert(hppPayload).select().single();
      if (hppErr) {
        // log warning but continue — main refund approval tetap jalan
        console.warn('[approveRefund] HPP insert failed:', hppErr.message);
      } else {
        hppItemId = hppItem?.id;
      }
    } catch (e) {
      console.warn('[approveRefund] HPP create error:', e?.message);
    }

    // 2. Update refund: status approved + link HPP item
    await supabase.from('refunds').update({
      status: 'approved',
      approved_at: approvedAt,
      approved_by: userEmail || 'system',
      hpp_item_id: hppItemId,
      processed_at: approvedAt,
      processed_by: userEmail || 'system',
    }).eq('id', refundId);

    // 3. Update peserta — soft delete dengan refund status
    if (refund.passenger_id) {
      const isPartial = Number(refund.refund_amount) > 0 && Number(refund.refund_amount) < Number(refund.total_paid);
      await supabase.from('trip_passengers').update({
        refund_status: isPartial ? 'partial_refund' : 'refunded',
        refunded_at: approvedAt,
        refund_amount: refund.refund_amount,
        refund_reason: refund.reason,
        refund_reason_detail: refund.reason_detail,
      }).eq('id', refund.passenger_id);
    }

    // 4. Cancel unpaid invoices peserta
    if (refund.passenger_id) {
      try {
        const { data: invoices } = await supabase
          .from('invoices').select('*').eq('passenger_id', refund.passenger_id);
        for (const inv of (invoices || [])) {
          if (['sent', 'draft', 'overdue'].includes(inv.status)) {
            await supabase.from('invoices').update({
              status: 'cancelled',
              notes: (inv.notes || '') + `\n[Cancelled karena refund approved: ${refund.reason}]`,
            }).eq('id', inv.id);
          }
        }
      } catch (e) {
        // non-critical
      }
    }

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    revalidatePath('/trips');
    if (refund.trip_id) {
      revalidatePath(`/trips/${refund.trip_id}`);
      revalidatePath(`/finance/cashflow/${refund.trip_id}`);
      revalidatePath(`/finance/payments/${refund.trip_id}`);
    }
    revalidatePath('/accounting');
    revalidatePath('/accounting/groups');

    return { ok: true, hppItemId };
  } catch (e) {
    return { error: 'Approve gagal: ' + (e?.message || 'unknown') };
  }
}

/**
 * REJECT refund — kasih alasan, peserta tetep active (gak jadi refund)
 */
export async function rejectRefund(refundId, rejectReason = '', userEmail = '') {
  if (!refundId) return { error: 'refundId wajib' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: refund } = await supabase
      .from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (!refund) return { error: 'Refund tidak ditemukan' };
    if (refund.status !== 'pending_approval') {
      return { error: `Refund sudah di-${refund.status}, gak bisa di-reject lagi` };
    }

    await supabase.from('refunds').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: userEmail || 'system',
      reject_reason: rejectReason,
    }).eq('id', refundId);

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    if (refund.trip_id) revalidatePath(`/trips/${refund.trip_id}`);

    return { ok: true };
  } catch (e) {
    return { error: 'Reject gagal: ' + (e?.message || 'unknown') };
  }
}

/**
 * UNDO approved refund — hapus HPP item, kembalikan peserta jadi active
 */
export async function undoRefund(refundId) {
  if (!refundId) return { error: 'refundId wajib' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: refund } = await supabase
      .from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (!refund) return { error: 'Refund tidak ditemukan' };

    // Hapus HPP item kalau ada
    if (refund.hpp_item_id) {
      await supabase.from('trip_finance_items').delete().eq('id', refund.hpp_item_id);
    }

    // Restore peserta
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

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    if (refund.trip_id) {
      revalidatePath(`/trips/${refund.trip_id}`);
      revalidatePath(`/finance/cashflow/${refund.trip_id}`);
    }
    revalidatePath('/accounting');

    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function getRefunds({ tripId = null, status = null, limit = 200 } = {}) {
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
