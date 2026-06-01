'use server';

// Round 177: TL Payments — REQUEST → APPROVAL → PAID flow
// + auto-create hpp_items saat approved (cash out + proyeksi income)
// + flip hpp_items.is_paid saat marked paid (real cashflow)
// Path: lib/actions/tl-payments.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function revalidateAll(tripId) {
  revalidatePath('/hr');
  revalidatePath('/hr/tl-payments');
  revalidatePath('/tl-master');
  revalidatePath('/tl');
  revalidatePath('/accounting');
  revalidatePath('/accounting/cashflow');
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance/payments');
  if (tripId) {
    revalidatePath(`/tl/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
  }
}

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDateID(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============ HELPER: resolve TL employee dari auth user ============
async function resolveTLFromAuth(supabase, user) {
  if (!user) return null;

  // 1) Match employees.user_id
  if (user.id) {
    const { data: byUid } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', user.id)
      .eq('employment_type', 'tour_leader')
      .maybeSingle();
    if (byUid) return byUid;
  }

  // 2) Match by email
  if (user.email) {
    const { data: byEmail } = await supabase
      .from('employees')
      .select('*')
      .ilike('email', user.email)
      .eq('employment_type', 'tour_leader')
      .maybeSingle();
    if (byEmail) return byEmail;
  }

  return null;
}

// ============ TL REQUEST PAYMENT (dari Portal TL) ============
/**
 * TL klik "Request Gaji 70% / 30%" dari portal /tl/[tripId]
 * @param {string} tripId
 * @param {'dp_70'|'final_30'} paymentType
 * @param {object} options - { notes?: string }
 */
export async function requestTLPayment(tripId, paymentType, options = {}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Login dulu' };

  const supabase = getServiceClient() || authClient;

  if (!['dp_70', 'final_30'].includes(paymentType)) {
    return { error: 'paymentType harus dp_70 atau final_30' };
  }

  try {
    // 1) Resolve TL employee dari auth user
    const tl = await resolveTLFromAuth(supabase, user);
    if (!tl) {
      return { error: 'Akun login kamu belum ke-link sebagai TL di /hr/employees. Hubungi HR.' };
    }

    if (!tl.per_trip_fee || tl.per_trip_fee <= 0) {
      return { error: `Fee per trip kamu belum di-set oleh HR. Hubungi HR untuk konfirmasi.` };
    }

    // 2) Get trip
    const { data: trip } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };

    // 3) Validate: trip ini emang assigned ke TL ini?
    let isAssigned = false;
    if (trip.tl_id && String(trip.tl_id) === String(tl.id)) isAssigned = true;
    if (!isAssigned && trip.tl_name) {
      const tn = trip.tl_name.toLowerCase().trim();
      const fn = (tl.full_name || '').toLowerCase().trim();
      const nk = (tl.nickname || '').toLowerCase().trim();
      if ((fn && tn.includes(fn)) || (nk && tn.includes(nk))) isAssigned = true;
    }
    if (!isAssigned) {
      return { error: 'Trip ini belum di-assign ke kamu (cek di Master Trip)' };
    }

    // 4) Cek existing request untuk trip+payment_type ini
    const { data: existing } = await supabase
      .from('tl_payments')
      .select('id, status')
      .eq('trip_id', tripId)
      .eq('tl_employee_id', tl.id)
      .eq('payment_type', paymentType)
      .maybeSingle();

    if (existing) {
      const labels = {
        requested: 'sudah pernah request, menunggu approval HR',
        approved: 'sudah di-approve, tinggal nunggu transfer',
        paid: 'sudah dibayar',
        rejected: 'sebelumnya di-reject',
        pending: 'sudah ada (status pending)',
      };
      return {
        error: `Request ${paymentType === 'dp_70' ? '70% DP' : '30% Final'} ${labels[existing.status] || 'sudah ada'}.`,
        existingId: existing.id,
      };
    }

    // 5) Untuk Final 30% — warning kalau Final Report belum submitted
    let finalReportWarning = null;
    if (paymentType === 'final_30') {
      // Cek dari tl_payments DP 70 atau dari trip status
      const { data: dp } = await supabase
        .from('tl_payments')
        .select('id, status')
        .eq('trip_id', tripId)
        .eq('tl_employee_id', tl.id)
        .eq('payment_type', 'dp_70')
        .maybeSingle();
      if (!dp || dp.status !== 'paid') {
        finalReportWarning = 'DP 70% belum dibayar. Request 30% bisa tetep dikirim tapi HR akan tunggu DP selesai dulu.';
      }
    }

    // 6) Calculate amounts
    const fee = Number(tl.per_trip_fee || 0);
    const amount = paymentType === 'dp_70' ? Math.round(fee * 0.7) : fee - Math.round(fee * 0.7);
    const departure = trip.departure ? new Date(trip.departure) : null;
    const dueDate = paymentType === 'dp_70'
      ? (departure ? new Date(departure.getTime() - 7*24*60*60*1000).toISOString().slice(0,10) : null)
      : (trip.return_date || trip.departure || null);

    // 7) Insert request
    const { data: row, error: insErr } = await supabase
      .from('tl_payments')
      .insert({
        trip_id: trip.id,
        trip_kode: trip.kode_trip || null,
        trip_name: trip.name || null,
        trip_departure: trip.departure || null,
        trip_return: trip.return_date || null,
        tl_employee_id: tl.id,
        tl_name: tl.full_name || null,
        tl_phone: tl.whatsapp || tl.phone || null,
        tl_bank_name: tl.bank_name || null,
        tl_bank_account: tl.bank_account_number || null,
        tl_bank_holder: tl.bank_account_holder || null,
        payment_type: paymentType,
        total_fee: fee,
        amount,
        due_date: dueDate,
        status: 'requested',
        requested_at: new Date().toISOString(),
        requested_by: user.user_metadata?.full_name || tl.full_name || user.email,
        requested_by_email: user.email,
        request_notes: options.notes || null,
      })
      .select('id')
      .single();

    if (insErr) return { error: insErr.message };

    // Auto-update trips.tl_id kalau sebelumnya cuma tl_name
    if (!trip.tl_id) {
      try { await supabase.from('trips').update({ tl_id: tl.id }).eq('id', trip.id); } catch {}
    }

    revalidateAll(tripId);
    return {
      ok: true,
      id: row.id,
      amount,
      warning: finalReportWarning,
      message: `✓ Request ${paymentType === 'dp_70' ? '70% DP' : '30% Final'} ${fmtIDR(amount)} terkirim ke HR untuk approval.`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ HR APPROVE — auto-create hpp_items ============
export async function approveTLPayment(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const approvedBy = user.user_metadata?.full_name || user.email || 'unknown';
  const approvalNotes = formData?.get?.('approval_notes')?.toString().trim() || null;

  try {
    const { data: p, error: getErr } = await supabase
      .from('tl_payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (getErr) return { error: getErr.message };
    if (!p) return { error: 'Request gak ditemukan' };
    if (p.status === 'approved' || p.status === 'paid') return { error: 'Sudah di-approve sebelumnya' };
    if (p.status === 'rejected') return { error: 'Sebelumnya di-reject. Reset dulu ke pending kalau mau approve.' };

    // 1) Update status
    const { error: updErr } = await supabase
      .from('tl_payments')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approvedBy,
        approval_notes: approvalNotes,
      })
      .eq('id', id);
    if (updErr) return { error: updErr.message };

    // 2) AUTO-CREATE hpp_items entry (cash out + masuk proyeksi income/cashflow)
    const typeLabel = p.payment_type === 'dp_70' ? '70% DP' : '30% Final';
    const hppPayload = {
      trip_id: p.trip_id,
      category: 'tl_fee',
      description: `TL Fee — ${p.tl_name} — ${typeLabel}`,
      amount: Number(p.amount) || 0,
      qty: 1,
      is_paid: false, // booked tapi belum dibayar → muncul di proyeksi cashflow
      source: 'tl_payment',
      source_id: id,
      notes: `Auto-created dari TL payment approval. Trip: ${p.trip_kode || p.trip_id}. Approved by: ${approvedBy}`,
    };

    let hppId = null;
    try {
      const hppRes = await supabase.from('hpp_items').insert(hppPayload).select('id').single();
      if (hppRes.data) hppId = hppRes.data.id;
      else if (hppRes.error && /column|schema/i.test(hppRes.error.message)) {
        // Defensive: strip optional columns
        const stripped = {
          trip_id: p.trip_id,
          category: 'tl_fee',
          description: `TL Fee — ${p.tl_name} — ${typeLabel}`,
          amount: Number(p.amount) || 0,
        };
        const retry = await supabase.from('hpp_items').insert(stripped).select('id').single();
        if (retry.data) hppId = retry.data.id;
      }
    } catch (hppErr) {
      console.error('[approveTLPayment] hpp insert error:', hppErr?.message);
    }

    // 3) Link hpp_item_id ke tl_payments untuk future is_paid update
    if (hppId) {
      try {
        await supabase.from('tl_payments').update({ hpp_item_id: hppId }).eq('id', id);
      } catch {}
    }

    revalidateAll(p.trip_id);
    return { ok: true, hppId, message: `✓ Approved. Dibooking ${fmtIDR(p.amount)} sebagai TL fee di HPP/cashflow.` };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ HR REJECT ============
export async function rejectTLPayment(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const rejectedBy = user.user_metadata?.full_name || user.email || 'unknown';
  const reason = formData?.get?.('reject_reason')?.toString().trim() || null;

  if (!reason) return { error: 'Alasan reject wajib diisi' };

  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id, status')
      .eq('id', id)
      .maybeSingle();
    if (!p) return { error: 'Request gak ditemukan' };

    // Kalau sudah ada hpp_item linked (re-reject after approval), hapus hpp entry-nya
    if (p.hpp_item_id) {
      try { await supabase.from('hpp_items').delete().eq('id', p.hpp_item_id); } catch {}
    }

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_by: rejectedBy,
        reject_reason: reason,
        hpp_item_id: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    revalidateAll(p.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function resetTLPaymentToRequested(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id')
      .eq('id', id)
      .maybeSingle();

    // Kalau ada hpp_item linked, hapus dulu
    if (p?.hpp_item_id) {
      try { await supabase.from('hpp_items').delete().eq('id', p.hpp_item_id); } catch {}
    }

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'requested',
        approved_at: null,
        approved_by: null,
        approval_notes: null,
        rejected_at: null,
        rejected_by: null,
        reject_reason: null,
        hpp_item_id: null,
        paid_at: null,
        paid_by: null,
        paid_amount: null,
        payment_method: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ MARK PAID — flip hpp_items.is_paid = true (masuk real cashflow) ============
export async function markTLPaymentPaid(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const paidBy = user.user_metadata?.full_name || user.email || 'unknown';

  const paidAmountRaw = formData.get('paid_amount');
  const paidAmount = paidAmountRaw ? Number(String(paidAmountRaw).replace(/[^0-9]/g, '')) : null;
  const paymentMethod = (formData.get('payment_method') || 'transfer').toString();
  const notes = (formData.get('notes') || '').toString().trim() || null;

  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id, status, amount')
      .eq('id', id)
      .maybeSingle();
    if (!p) return { error: 'Payment gak ditemukan' };
    if (p.status !== 'approved' && p.status !== 'pending') {
      return { error: `Status saat ini "${p.status}" — harus 'approved' dulu sebelum Mark Paid` };
    }

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: paidAmount || p.amount,
        paid_by: paidBy,
        payment_method: paymentMethod,
        notes,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    // Flip hpp_items.is_paid = true → muncul di real cashflow
    if (p.hpp_item_id) {
      try {
        await supabase
          .from('hpp_items')
          .update({
            is_paid: true,
            paid_at: new Date().toISOString(),
            paid_by: paidBy,
          })
          .eq('id', p.hpp_item_id);
      } catch (e) {
        console.error('[markTLPaymentPaid] hpp update error:', e?.message);
      }
    }

    revalidateAll(p.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function unmarkTLPaymentPaid(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'approved',
        paid_at: null,
        paid_amount: null,
        paid_by: null,
        payment_method: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    if (p?.hpp_item_id) {
      try {
        await supabase.from('hpp_items').update({ is_paid: false, paid_at: null }).eq('id', p.hpp_item_id);
      } catch {}
    }

    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function markFinalReportSubmitted(id, formData) {
  const supabase = getServiceClient() || createClient();
  const reportNotes = formData?.get?.('final_report_notes')?.toString().trim() || null;
  try {
    const { data: p } = await supabase.from('tl_payments').select('trip_id').eq('id', id).maybeSingle();
    const { error } = await supabase
      .from('tl_payments')
      .update({
        final_report_submitted: true,
        final_report_submitted_at: new Date().toISOString(),
        final_report_notes: reportNotes,
      })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function unmarkFinalReportSubmitted(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase.from('tl_payments').select('trip_id').eq('id', id).maybeSingle();
    const { error } = await supabase
      .from('tl_payments')
      .update({
        final_report_submitted: false,
        final_report_submitted_at: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function deleteTLPayment(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id')
      .eq('id', id)
      .maybeSingle();

    // Hapus hpp link kalau ada
    if (p?.hpp_item_id) {
      try { await supabase.from('hpp_items').delete().eq('id', p.hpp_item_id); } catch {}
    }

    const { error } = await supabase.from('tl_payments').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ PAYMENT PROOF (sama dgn R176) ============
export async function uploadTLPaymentProof(id, formData) {
  const supabase = getServiceClient() || createClient();
  const file = formData.get('file');
  if (!file || typeof file === 'string') return { error: 'File wajib' };

  try {
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'bin';
    const key = `tl-${id}-${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from('payroll-proofs')
      .upload(key, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) return { error: 'Upload error: ' + upErr.message };

    const { error: dbErr } = await supabase
      .from('tl_payments')
      .update({ payment_proof_url: key })
      .eq('id', id);
    if (dbErr) return { error: dbErr.message };

    revalidateAll();
    return { ok: true, key };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function getTLPaymentProofSignedUrl(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('tl_payments')
      .select('payment_proof_url')
      .eq('id', id)
      .maybeSingle();
    if (!row?.payment_proof_url) return { error: 'Belum ada bukti' };

    const { data, error } = await supabase.storage
      .from('payroll-proofs')
      .createSignedUrl(row.payment_proof_url, 600);
    if (error) return { error: error.message };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function deleteTLPaymentProof(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('tl_payments')
      .select('payment_proof_url')
      .eq('id', id)
      .maybeSingle();
    if (row?.payment_proof_url) {
      await supabase.storage.from('payroll-proofs').remove([row.payment_proof_url]);
    }
    await supabase.from('tl_payments').update({ payment_proof_url: null }).eq('id', id);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ SEND SLIP TO WHATSAPP ============
export async function sendTLPaymentSlipToWA(id, options = {}) {
  const supabase = getServiceClient() || createClient();

  try {
    const { data: p, error } = await supabase
      .from('tl_payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!p) return { error: 'Payment gak ditemukan' };

    const phone = options.targetPhone || p.tl_phone;
    if (!phone) return { error: 'TL belum punya nomor HP/WA' };

    const isPaid = p.status === 'paid';
    const isApproved = p.status === 'approved';
    const typeLabel = p.payment_type === 'dp_70' ? '70% (DP)' : '30% (Final)';

    const message = [
      `🌟 *SLIP PEMBAYARAN TOUR LEADER* 🌟`,
      ``,
      `Hai *${p.tl_name || 'TL'}*,`,
      ``,
      `📌 *Trip:* ${p.trip_kode || ''} ${p.trip_name || ''}`.trim(),
      `📅 *Keberangkatan:* ${fmtDateID(p.trip_departure)}`,
      ``,
      `💰 *Total Fee Trip:* ${fmtIDR(p.total_fee)}`,
      `📊 *Termin:* ${typeLabel}`,
      `💵 *Nominal:* ${fmtIDR(p.amount)}`,
      `📆 *Jatuh Tempo:* ${fmtDateID(p.due_date)}`,
      ``,
      isPaid ? `✅ *STATUS: SUDAH DIBAYAR* (${fmtDateID(p.paid_at)})` :
        isApproved ? `✓ *STATUS: APPROVED — menunggu transfer*` :
        `⏳ *STATUS: ${(p.status || '').toUpperCase()}*`,
      ``,
      p.tl_bank_name ? `🏦 *Transfer ke:*\n${p.tl_bank_name}\n${p.tl_bank_account}\na.n. ${p.tl_bank_holder}` : null,
      ``,
      `_TEONE — Traveling Eropa_`,
    ].filter((x) => x !== null).join('\n');

    const result = await sendFonnte(phone, message, { context: 'finance' });

    if (result.error) return { error: result.error, sentVia: result.sentVia };

    await supabase
      .from('tl_payments')
      .update({
        wa_sent_at: new Date().toISOString(),
        wa_sent_to: normalizePhone(phone),
      })
      .eq('id', id);

    revalidateAll(p.trip_id);
    return { ok: true, sentVia: result.sentVia, target: normalizePhone(phone) };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ DASHBOARD STATS ============
export async function getTLPaymentsStats() {
  const empty = {
    total: 0, requested: 0, approved: 0, paid: 0, rejected: 0, overdue: 0,
    total_amount_requested: 0, total_amount_approved: 0, total_amount_paid: 0,
  };
  try {
    const supabase = getServiceClient() || createClient();
    const { data, error } = await supabase
      .from('tl_payments')
      .select('id, status, amount, due_date');
    if (error) {
      if (/relation.*does not exist/i.test(error.message)) {
        return { ...empty, setup_needed: true };
      }
      return empty;
    }
    const today = new Date().toISOString().slice(0, 10);
    const stats = { ...empty, total: data.length };
    for (const p of data) {
      const amt = Number(p.amount || 0);
      if (p.status === 'requested') { stats.requested++; stats.total_amount_requested += amt; }
      else if (p.status === 'approved') { stats.approved++; stats.total_amount_approved += amt; }
      else if (p.status === 'paid') { stats.paid++; stats.total_amount_paid += amt; }
      else if (p.status === 'rejected') { stats.rejected++; }
      if (p.status !== 'paid' && p.status !== 'rejected' && p.due_date && p.due_date < today) {
        stats.overdue++;
      }
    }
    return stats;
  } catch {
    return empty;
  }
}

// ============ GET REQUESTS FOR A TRIP (untuk TL portal) ============
export async function getTLPaymentsForTrip(tripId) {
  const supabase = getServiceClient() || createClient();
  const { data } = await supabase
    .from('tl_payments')
    .select('id, payment_type, status, amount, requested_at, approved_at, paid_at, reject_reason')
    .eq('trip_id', tripId)
    .order('payment_type');
  return data || [];
}
