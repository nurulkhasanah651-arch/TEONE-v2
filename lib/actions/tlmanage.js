'use server';

// Round 145 v3: tlmanage actions — masuk ke trip_finance_items (Proyeksi Income / HPP table)
// - approveReimbursement → insert ke trip_finance_items, category 'TL Expenses' (POSITIVE)
// - recordPettyCashRefund → insert ke trip_finance_items, NEGATIVE amount = income
// Path: lib/actions/tlmanage.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
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
  revalidatePath('/tl');
  revalidatePath('/dashboard');
  revalidatePath('/accounting');
  revalidatePath('/finance');
  if (tripId) {
    revalidatePath(`/tl/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/accounting/groups/${tripId}`);
  }
}

// ============================================================
// PETTY CASH
// ============================================================
export async function savePettyCash({ tripId, allocatedAmount, notes, userEmail }) {
  if (!tripId) return { error: 'tripId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: existing } = await supabase
      .from('trip_petty_cash').select('id').eq('trip_id', tripId).maybeSingle();

    const payload = {
      allocated_amount: Number(allocatedAmount) || 0,
      notes: notes || null,
      updated_at: new Date().toISOString(),
      set_by: userEmail,
      set_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from('trip_petty_cash').update(payload).eq('id', existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from('trip_petty_cash').insert({
        trip_id: tripId,
        ...payload,
        spent_amount: 0,
        status: 'active',
      });
      if (error) return { error: error.message };
    }

    revalidateAll(tripId);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

// ============================================================
// ROUND 145 v3: PETTY CASH REFUND → trip_finance_items dengan amount NEGATIF
// (NEGATIF = income/refund → mengurangi total HPP → naik margin group)
// ============================================================
export async function recordPettyCashRefund({ tripId, refundAmount, refundProofUrl, notes, userEmail }) {
  if (!tripId) return { error: 'tripId wajib' };
  const amount = Number(refundAmount) || 0;
  if (amount <= 0) return { error: 'Nominal refund wajib > 0' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: pc } = await supabase
      .from('trip_petty_cash').select('*').eq('trip_id', tripId).maybeSingle();
    if (!pc) return { error: 'Petty cash belum di-setup untuk trip ini' };

    const remaining = Math.max(Number(pc.allocated_amount || 0) - Number(pc.spent_amount || 0), 0);
    if (amount > remaining) {
      return { error: `Refund (${amount}) > sisa petty cash (${remaining}). Refund max = sisa.` };
    }

    // Update petty cash → settled
    await supabase.from('trip_petty_cash').update({
      refund_amount: amount,
      refund_at: new Date().toISOString(),
      refund_by: userEmail,
      refund_proof_url: refundProofUrl || null,
      status: 'settled',
      settle_notes: notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', pc.id);

    // Insert NEGATIVE entry di trip_finance_items → mengurangi HPP, naik margin
    const hppPayload = {
      trip_id: tripId,
      item_type: 'hpp',
      category: 'TL Expenses',
      component: 'Refund sisa petty cash dari TL',
      vendor_name: 'TL Refund',
      basic_fare: -amount, // NEGATIF
      qty: 1,
      total_amount: -amount,
      payment_status: 'lunas',
    };

    const { error: insErr } = await supabase
      .from('trip_finance_items').insert(hppPayload);
    if (insErr) console.warn('[refund HPP insert]', insErr.message);

    revalidateAll(tripId);
    return { ok: true, refund_amount: amount };
  } catch (e) {
    return { error: e?.message };
  }
}

// ============================================================
// REIMBURSEMENT
// ============================================================
export async function createReimbursement({
  tripId, requesterName, requesterEmail, requesterRole,
  category, description, amount, receiptUrl, spentAt, notes,
}) {
  if (!tripId || !description || !amount) return { error: 'tripId/description/amount wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data, error } = await supabase.from('reimbursement_requests').insert({
      trip_id: tripId,
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_role: requesterRole || 'tour_leader',
      category: category || 'Other',
      description,
      amount: Number(amount) || 0,
      receipt_url: receiptUrl || null,
      spent_at: spentAt || new Date().toISOString().slice(0, 10),
      notes: notes || null,
      status: 'pending',
    }).select().single();

    if (error) return { error: error.message };

    revalidateAll(tripId);
    return { ok: true, request: data };
  } catch (e) {
    return { error: e?.message };
  }
}

// ROUND 145 v3: Approve → insert ke trip_finance_items, masuk Proyeksi Income / HPP
export async function approveReimbursement(id, userEmail) {
  if (!id) return { error: 'id wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: req, error: getErr } = await supabase
      .from('reimbursement_requests').select('*').eq('id', id).single();
    if (getErr || !req) return { error: 'Reimbursement gak ketemu' };
    if (req.status === 'approved') return { error: 'Sudah di-approve' };
    if (req.status === 'rejected') return { error: 'Sudah di-reject, tidak bisa approve' };

    const amount = Number(req.amount) || 0;
    const approvedAt = new Date().toISOString();

    // Auto-insert ke trip_finance_items → muncul di Proyeksi Income / HPP
    const hppPayload = {
      trip_id: req.trip_id,
      item_type: 'hpp',
      category: 'TL Expenses',
      component: `Reimbursement: ${req.description}${req.category ? ` (${req.category})` : ''}`,
      vendor_name: req.requester_name || 'TL',
      basic_fare: amount,
      qty: 1,
      total_amount: amount,
      payment_status: 'belum', // belum lunas — akan jadi lunas setelah Mark Paid
    };

    let hppItemId = null;
    const { data: hppItem, error: hppErr } = await supabase
      .from('trip_finance_items').insert(hppPayload).select().single();
    if (hppErr) {
      console.warn('[reimburse HPP insert]', hppErr.message);
    } else {
      hppItemId = hppItem?.id;
    }

    // Update reimbursement status + link to HPP item
    const { error: updErr } = await supabase.from('reimbursement_requests').update({
      status: 'approved',
      approved_by: userEmail,
      approved_at: approvedAt,
      hpp_item_id: hppItemId, // store reference
    }).eq('id', id);
    if (updErr) {
      // retry tanpa hpp_item_id kalau column gak ada
      await supabase.from('reimbursement_requests').update({
        status: 'approved',
        approved_by: userEmail,
        approved_at: approvedAt,
      }).eq('id', id);
    }

    // Update petty cash spent (kalau ada)
    try {
      const { data: pc } = await supabase
        .from('trip_petty_cash').select('*').eq('trip_id', req.trip_id).maybeSingle();
      if (pc) {
        await supabase.from('trip_petty_cash').update({
          spent_amount: Number(pc.spent_amount || 0) + amount,
          updated_at: new Date().toISOString(),
        }).eq('id', pc.id);
      }
    } catch {}

    revalidateAll(req.trip_id);
    return { ok: true, hpp_item_id: hppItemId };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function rejectReimbursement(id, reason, userEmail) {
  if (!id) return { error: 'id wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: req } = await supabase
      .from('reimbursement_requests').select('trip_id').eq('id', id).maybeSingle();

    const { error } = await supabase.from('reimbursement_requests').update({
      status: 'rejected',
      reject_reason: reason || null,
      rejected_by: userEmail,
      rejected_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) return { error: error.message };

    revalidateAll(req?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

// Mark Paid → update HPP item-nya jadi 'lunas'
export async function markReimbursementPaid(id, userEmail) {
  if (!id) return { error: 'id wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: req } = await supabase
      .from('reimbursement_requests').select('*').eq('id', id).single();
    if (!req) return { error: 'Request gak ketemu' };

    const paidAt = new Date().toISOString();

    const { error } = await supabase.from('reimbursement_requests').update({
      status: 'paid',
      paid_by: userEmail,
      paid_at: paidAt,
    }).eq('id', id);
    if (error) return { error: error.message };

    // Update HPP item jadi lunas
    if (req.hpp_item_id) {
      try {
        await supabase.from('trip_finance_items').update({
          payment_status: 'lunas',
        }).eq('id', req.hpp_item_id);
      } catch {}
    }

    revalidateAll(req.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

// ============================================================
// TRIP DOCS (existing)
// ============================================================
export async function addTripDocument({ tripId, category, title, fileUrl, notes, userEmail }) {
  if (!tripId || !title || !fileUrl) return { error: 'tripId/title/fileUrl wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const payload = {
      trip_id: tripId,
      category: category || 'other',
      title,
      file_url: fileUrl,
      notes: notes || null,
      uploaded_by: userEmail,
    };
    let r = await supabase.from('trip_documents').insert(payload).select().single();
    if (r.error && /notes|category/i.test(r.error.message)) {
      const stripped = { trip_id: tripId, title, file_url: fileUrl, uploaded_by: userEmail };
      r = await supabase.from('trip_documents').insert(stripped).select().single();
    }
    if (r.error) return { error: r.error.message };

    revalidateAll(tripId);
    return { ok: true, doc: r.data };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function deleteTripDocument(docId, tripId) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };
  try {
    const { error } = await supabase.from('trip_documents').delete().eq('id', docId);
    if (error) return { error: error.message };
    if (tripId) revalidateAll(tripId);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

// ============================================================
// DOWNLOAD DOKUMEN TRIP — signed URL (service role) + paksa download
// TL tidak perlu akses Supabase: tombol ambil URL bertanda tangan lalu unduh.
// Jalan untuk bucket public maupun private.
// ============================================================
function parseStorageUrl(fileUrl) {
  if (!fileUrl) return null;
  // Format public:  /storage/v1/object/public/<bucket>/<path>
  // Format signed:  /storage/v1/object/sign/<bucket>/<path>?token=...
  const m = String(fileUrl).match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

export async function getTripDocDownloadUrl(docId) {
  if (!docId) return { error: 'docId kosong' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };
  try {
    const { data: doc } = await supabase
      .from('trip_documents').select('file_url, file_path, title').eq('id', docId).maybeSingle();
    if (!doc) return { error: 'Dokumen tidak ditemukan' };

    // Tentukan bucket + path
    let bucket = null, path = doc.file_path || null;
    const parsed = parseStorageUrl(doc.file_url);
    if (parsed) { bucket = parsed.bucket; path = path || parsed.path; }
    // Fallback bucket umum bila hanya ada file_path
    const candidates = bucket ? [bucket] : ['trip-docs', 'tl-uploads'];

    const fname = (doc.title || 'dokumen').replace(/[^a-zA-Z0-9.\- ]/g, '_').slice(0, 80);
    if (path) {
      for (const b of candidates) {
        const { data, error } = await supabase.storage.from(b).createSignedUrl(path, 60 * 60, { download: fname });
        if (!error && data?.signedUrl) return { ok: true, url: data.signedUrl };
      }
    }
    // Fallback terakhir: kembalikan file_url apa adanya
    if (doc.file_url) return { ok: true, url: doc.file_url };
    return { error: 'File tidak tersedia' };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}
