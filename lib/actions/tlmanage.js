'use server';

// Round 129: Server actions untuk TL Portal management
// Path: lib/actions/tlmanage.js

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

// ═══════════════════════════════════════════════════════════════
// PETTY CASH
// ═══════════════════════════════════════════════════════════════

export async function setPettyCashAmount(tripId, allocatedAmount, notes = '', userEmail = '') {
  if (!tripId) return { error: 'tripId wajib' };
  if (allocatedAmount == null || Number(allocatedAmount) < 0) return { error: 'amount invalid' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    // Upsert: cek udah ada atau belum
    const { data: existing } = await supabase
      .from('trip_petty_cash').select('id').eq('trip_id', tripId).maybeSingle();

    if (existing) {
      const { error } = await supabase.from('trip_petty_cash').update({
        allocated_amount: Number(allocatedAmount),
        notes,
        set_by: userEmail,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from('trip_petty_cash').insert({
        trip_id: tripId,
        allocated_amount: Number(allocatedAmount),
        spent_amount: 0,
        notes,
        set_by: userEmail,
      });
      if (error) return { error: error.message };
    }

    revalidatePath(`/tl/${tripId}`);
    revalidatePath('/tl');
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function getPettyCash(tripId) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set', data: null };
  try {
    const { data } = await supabase
      .from('trip_petty_cash').select('*').eq('trip_id', tripId).maybeSingle();
    return { ok: true, data };
  } catch (e) {
    return { error: e?.message, data: null };
  }
}

// ═══════════════════════════════════════════════════════════════
// REIMBURSEMENT REQUESTS
// ═══════════════════════════════════════════════════════════════

export async function createReimbursement({
  tripId, requesterName, requesterEmail, requesterRole = 'tour_leader',
  category, description, amount, receiptUrl = '', spentAt, notes = '',
}) {
  if (!tripId) return { error: 'tripId wajib' };
  if (!description) return { error: 'description wajib' };
  if (!amount || Number(amount) <= 0) return { error: 'amount wajib > 0' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data, error } = await supabase.from('reimbursement_requests').insert({
      trip_id: tripId,
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_role: requesterRole,
      category,
      description,
      amount: Number(amount),
      receipt_url: receiptUrl,
      spent_at: spentAt || null,
      notes,
      status: 'pending',
    }).select().single();
    if (error) return { error: error.message };

    revalidatePath('/tl');
    revalidatePath(`/tl/${tripId}`);
    return { ok: true, request: data };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function approveReimbursement(requestId, userEmail = '') {
  if (!requestId) return { error: 'requestId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: req } = await supabase
      .from('reimbursement_requests').select('*').eq('id', requestId).maybeSingle();
    if (!req) return { error: 'Request tidak ditemukan' };
    if (req.status !== 'pending') return { error: `Sudah di-${req.status}` };

    const { error } = await supabase.from('reimbursement_requests').update({
      status: 'approved',
      approved_by: userEmail,
      approved_at: new Date().toISOString(),
    }).eq('id', requestId);
    if (error) return { error: error.message };

    // Auto-add to petty_cash spent
    if (req.trip_id) {
      try {
        const { data: petty } = await supabase
          .from('trip_petty_cash').select('id, spent_amount')
          .eq('trip_id', req.trip_id).maybeSingle();
        if (petty) {
          await supabase.from('trip_petty_cash').update({
            spent_amount: Number(petty.spent_amount || 0) + Number(req.amount || 0),
            updated_at: new Date().toISOString(),
          }).eq('id', petty.id);
        }
      } catch {}
    }

    revalidatePath('/tl');
    if (req.trip_id) revalidatePath(`/tl/${req.trip_id}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function rejectReimbursement(requestId, rejectReason = '', userEmail = '') {
  if (!requestId) return { error: 'requestId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: req } = await supabase
      .from('reimbursement_requests').select('trip_id').eq('id', requestId).maybeSingle();
    if (!req) return { error: 'Request tidak ditemukan' };

    const { error } = await supabase.from('reimbursement_requests').update({
      status: 'rejected',
      rejected_by: userEmail,
      rejected_at: new Date().toISOString(),
      reject_reason: rejectReason,
    }).eq('id', requestId);
    if (error) return { error: error.message };

    revalidatePath('/tl');
    if (req.trip_id) revalidatePath(`/tl/${req.trip_id}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function markReimbursementPaid(requestId, userEmail = '') {
  if (!requestId) return { error: 'requestId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: req } = await supabase
      .from('reimbursement_requests').select('trip_id, status').eq('id', requestId).maybeSingle();
    if (!req) return { error: 'Request tidak ditemukan' };
    if (req.status !== 'approved') return { error: 'Hanya approved yang bisa di-mark paid' };

    const { error } = await supabase.from('reimbursement_requests').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', requestId);
    if (error) return { error: error.message };

    revalidatePath('/tl');
    if (req.trip_id) revalidatePath(`/tl/${req.trip_id}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function getReimbursements({ tripId = null, status = null } = {}) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set', data: [] };

  try {
    let query = supabase.from('reimbursement_requests').select('*');
    if (tripId) query = query.eq('trip_id', tripId);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) return { error: error.message, data: [] };
    return { ok: true, data: data || [] };
  } catch (e) {
    return { error: e?.message, data: [] };
  }
}

// ═══════════════════════════════════════════════════════════════
// TRIP DOCUMENTS (basic upload metadata — file di-upload via Supabase Storage di luar)
// ═══════════════════════════════════════════════════════════════

export async function addTripDocument({ tripId, category, title, fileUrl, fileSizeBytes, notes, userEmail = '' }) {
  if (!tripId || !title) return { error: 'tripId & title wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data, error } = await supabase.from('trip_documents').insert({
      trip_id: tripId,
      category,
      title,
      file_url: fileUrl,
      file_size_bytes: fileSizeBytes,
      uploaded_by: userEmail,
      notes,
    }).select().single();
    if (error) return { error: error.message };

    revalidatePath(`/tl/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
    return { ok: true, doc: data };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function deleteTripDocument(docId, tripId) {
  if (!docId) return { error: 'docId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { error } = await supabase.from('trip_documents').delete().eq('id', docId);
    if (error) return { error: error.message };

    if (tripId) {
      revalidatePath(`/tl/${tripId}`);
      revalidatePath(`/trips/${tripId}`);
    }
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}
