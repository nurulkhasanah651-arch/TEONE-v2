'use server';

// Round 125: Refund actions + auto-recalculate trip.sold setelah approve/undo
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

// Helper: recalculate trip.sold (exclude transferred + refunded)
async function recalculateTripStats(supabase, tripId) {
  if (!tripId) return;
  try {
    const { data: paxList } = await supabase
      .from('trip_passengers')
      .select('id, transfer_status, refund_status')
      .eq('trip_id', tripId);

    const activeCount = (paxList || []).filter((p) => {
      const isTransferred = p.transfer_status === 'transferred';
      const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
      return !isTransferred && !isRefunded;
    }).length;

    const { data: trip } = await supabase
      .from('trips').select('quota').eq('id', tripId).maybeSingle();
    const quota = trip?.quota || 0;
    const seatLeft = Math.max(quota - activeCount, 0);

    await supabase.from('trips').update({
      sold: activeCount,
      seat_left: seatLeft,
    }).eq('id', tripId);
  } catch (e) {
    // Defensive
  }
}

export async function getPassengerTotalPaid(passengerId) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set', total: 0 };
  try {
    let query = supabase.from('participant_payments').select('amount').eq('passenger_id', passengerId);
    let data = null;
    try {
      const r = await query.eq('is_transferred', false);
      data = r.data;
    } catch {
      const r = await query;
      data = r.data;
    }
    const total = (data || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    return { ok: true, total };
  } catch (e) {
    return { error: e?.message, total: 0 };
  }
}

export async function createRefund({
  passengerId, reason, reasonDetail = '', refundAmount, totalPaid,
  refundMethod = 'transfer', bankName = '', accountNo = '', accountName = '', notes = '',
}) {
  if (!passengerId) return { error: 'passengerId wajib' };
  if (!reason) return { error: 'reason wajib' };
  if (refundAmount == null || Number(refundAmount) < 0) return { error: 'refundAmount wajib' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: pax, error: paxErr } = await supabase
      .from('trip_passengers').select('*').eq('id', passengerId).maybeSingle();
    if (paxErr || !pax) return { error: 'Peserta tidak ditemukan' };
    if (pax.refund_status === 'refunded') return { error: 'Peserta sudah di-refund sebelumnya' };

    const { data: trip } = await supabase
      .from('trips').select('id, name, kode_trip').eq('id', pax.trip_id).maybeSingle();

    let paxName = null;
    let paxPhone = null;
    if (pax.customer_id) {
      const { data: customer } = await supabase
        .from('customers').select('name, phone').eq('id', pax.customer_id).maybeSingle();
      paxName = customer?.name;
      paxPhone = customer?.phone;
    }

    let actualTotalPaid = Number(totalPaid || 0);
    if (!totalPaid) {
      const r = await getPassengerTotalPaid(passengerId);
      actualTotalPaid = r?.total || 0;
    }

    const refundAmt = Number(refundAmount);
    const adminFee = Math.max(actualTotalPaid - refundAmt, 0);

    const refundData = {
      passenger_id: passengerId,
      trip_id: pax.trip_id,
      passenger_name: paxName,
      passenger_phone: paxPhone,
      trip_name: trip?.name,
      trip_kode: trip?.kode_trip,
      reason, reason_detail: reasonDetail,
      total_paid: actualTotalPaid,
      refund_amount: refundAmt,
      admin_fee: adminFee,
      refund_method: refundMethod,
      refund_bank_name: bankName,
      refund_account_no: accountNo,
      refund_account_name: accountName,
      status: 'pending_approval',
      notes,
    };

    const { data: refund, error: insertErr } = await supabase
      .from('refunds').insert(refundData).select().single();
    if (insertErr) return { error: 'Insert refund gagal: ' + insertErr.message };

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    revalidatePath(`/trips/${pax.trip_id}`);

    return {
      ok: true, refund,
      summary: { passenger: paxName || '—', totalPaid: actualTotalPaid, refundAmount: refundAmt, adminFee, status: 'pending_approval' },
    };
  } catch (e) {
    return { error: 'Create refund gagal: ' + (e?.message || 'unknown') };
  }
}

export async function approveRefund(refundId, userEmail = '') {
  if (!refundId) return { error: 'refundId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: refund, error: fetchErr } = await supabase
      .from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (fetchErr) return { error: 'Fetch refund gagal: ' + fetchErr.message };
    if (!refund) return { error: 'Refund tidak ditemukan' };
    if (refund.status !== 'pending_approval') {
      return { error: `Refund sudah di-${refund.status}` };
    }

    const approvedAt = new Date().toISOString();
    const errors = [];

    // 1. Create HPP item
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
        payment_status: 'lunas',
      };
      const { data: hppItem, error: hppErr } = await supabase
        .from('trip_finance_items').insert(hppPayload).select().single();
      if (hppErr) {
        errors.push(`HPP: ${hppErr.message}`);
      } else if (hppItem?.id != null) {
        hppItemId = String(hppItem.id);
      }
    } catch (e) {
      errors.push(`HPP exception: ${e?.message}`);
    }

    // 2. Update refund
    const refundUpdate = {
      status: 'approved',
      approved_at: approvedAt,
      approved_by: userEmail || 'system',
      processed_at: approvedAt,
      processed_by: userEmail || 'system',
    };
    if (hppItemId) refundUpdate.hpp_item_id = hppItemId;

    const { error: updErr } = await supabase
      .from('refunds').update(refundUpdate).eq('id', refundId);

    if (updErr) {
      delete refundUpdate.hpp_item_id;
      const retry = await supabase.from('refunds').update(refundUpdate).eq('id', refundId);
      if (retry.error) {
        return { error: 'Update refund: ' + updErr.message + ' / retry: ' + retry.error.message };
      }
      errors.push(`hpp_item_id skipped`);
    }

    // 3. Update passenger
    if (refund.passenger_id) {
      const isPartial = Number(refund.refund_amount) > 0 && Number(refund.refund_amount) < Number(refund.total_paid);
      try {
        await supabase.from('trip_passengers').update({
          refund_status: isPartial ? 'partial_refund' : 'refunded',
          refunded_at: approvedAt,
          refund_amount: refund.refund_amount,
          refund_reason: refund.reason,
          refund_reason_detail: refund.reason_detail,
        }).eq('id', refund.passenger_id);
      } catch (e) {
        errors.push(`pax update: ${e?.message}`);
      }
    }

    // 4. Cancel unpaid invoices
    if (refund.passenger_id) {
      try {
        const { data: invoices } = await supabase
          .from('invoices').select('*').eq('passenger_id', refund.passenger_id);
        for (const inv of (invoices || [])) {
          if (['sent', 'draft', 'overdue'].includes(inv.status)) {
            await supabase.from('invoices').update({
              status: 'cancelled',
              notes: (inv.notes || '') + `\n[Cancelled karena refund: ${refund.reason}]`,
            }).eq('id', inv.id);
          }
        }
      } catch {}
    }

    // ROUND 125: Recalculate trip.sold setelah refund approved
    if (refund.trip_id) {
      await recalculateTripStats(supabase, refund.trip_id);
    }

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    revalidatePath('/trips');
    if (refund.trip_id) {
      revalidatePath(`/trips/${refund.trip_id}`);
      revalidatePath(`/finance/cashflow/${refund.trip_id}`);
      revalidatePath(`/finance/payments/${refund.trip_id}`);
      revalidatePath(`/accounting/groups/${refund.trip_id}`);
    }
    revalidatePath('/accounting');
    revalidatePath('/accounting/groups');

    return { ok: true, hppItemId, warnings: errors.length > 0 ? errors : null };
  } catch (e) {
    return { error: 'Approve gagal: ' + (e?.message || 'unknown') };
  }
}

export async function rejectRefund(refundId, rejectReason = '', userEmail = '') {
  if (!refundId) return { error: 'refundId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: refund } = await supabase
      .from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (!refund) return { error: 'Refund tidak ditemukan' };
    if (refund.status !== 'pending_approval') {
      return { error: `Refund sudah di-${refund.status}` };
    }

    const { error: updErr } = await supabase.from('refunds').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: userEmail || 'system',
      reject_reason: rejectReason,
    }).eq('id', refundId);
    if (updErr) return { error: 'Reject gagal: ' + updErr.message };

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    if (refund.trip_id) revalidatePath(`/trips/${refund.trip_id}`);
    return { ok: true };
  } catch (e) {
    return { error: 'Reject gagal: ' + (e?.message || 'unknown') };
  }
}

export async function undoRefund(refundId) {
  if (!refundId) return { error: 'refundId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: refund } = await supabase
      .from('refunds').select('*').eq('id', refundId).maybeSingle();
    if (!refund) return { error: 'Refund tidak ditemukan' };

    if (refund.hpp_item_id) {
      try {
        await supabase.from('trip_finance_items').delete().eq('id', refund.hpp_item_id);
      } catch {}
    }

    if (refund.passenger_id) {
      try {
        await supabase.from('trip_passengers').update({
          refund_status: 'active',
          refunded_at: null,
          refund_amount: null,
          refund_reason: null,
          refund_reason_detail: null,
        }).eq('id', refund.passenger_id);
      } catch {}
    }

    await supabase.from('refunds').delete().eq('id', refundId);

    // ROUND 125: Recalc stats
    if (refund.trip_id) {
      await recalculateTripStats(supabase, refund.trip_id);
    }

    revalidatePath('/refunds');
    revalidatePath('/invoices');
    if (refund.trip_id) {
      revalidatePath(`/trips/${refund.trip_id}`);
      revalidatePath(`/finance/cashflow/${refund.trip_id}`);
      revalidatePath(`/accounting/groups/${refund.trip_id}`);
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
