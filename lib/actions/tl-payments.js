'use server';

// Round 176: TL Payments — split 70% DP / 30% Final
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

function revalidateTL() {
  revalidatePath('/hr');
  revalidatePath('/hr/tl-payments');
  revalidatePath('/tl-master');
}

function fmtIDR(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}
function fmtDateID(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============ GENERATE FROM TRIPS ============

/**
 * Generate DP 70% + Final 30% entries untuk 1 trip.
 * Skip kalau udah ada entries-nya (idempotent).
 */
export async function generateTLPaymentsForTrip(tripId) {
  const supabase = getServiceClient() || createClient();

  try {
    // 1) Ambil trip + TL info
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (tripErr) return { error: 'Trip error: ' + tripErr.message };
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (!trip.tl_id) return { error: 'Trip ini belum punya TL ter-assign' };

    // 2) Ambil employee TL
    const { data: tl, error: tlErr } = await supabase
      .from('employees')
      .select('*')
      .eq('id', trip.tl_id)
      .maybeSingle();

    if (tlErr) return { error: 'TL error: ' + tlErr.message };
    if (!tl) return { error: 'TL gak ditemukan di employees' };

    const fee = Number(tl.per_trip_fee || 0);
    if (fee <= 0) return { error: `TL "${tl.full_name}" belum di-set per_trip_fee` };

    const dp = Math.round(fee * 0.7);
    const finalAmt = fee - dp;

    // 3) Due dates
    const departure = trip.departure ? new Date(trip.departure) : null;
    const dpDue = departure
      ? new Date(departure.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null;
    const finalDue = trip.return_date || trip.departure || null;

    // 4) Common payload
    const base = {
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
      total_fee: fee,
    };

    // 5) Insert 2 rows (idempotent via UNIQUE constraint)
    const rows = [
      { ...base, payment_type: 'dp_70', amount: dp, due_date: dpDue },
      { ...base, payment_type: 'final_30', amount: finalAmt, due_date: finalDue },
    ];

    let created = 0, skipped = 0;
    for (const row of rows) {
      const { error } = await supabase.from('tl_payments').insert(row);
      if (error) {
        if (/duplicate key|unique/i.test(error.message)) skipped++;
        else return { error: error.message };
      } else {
        created++;
      }
    }

    revalidateTL();
    return { ok: true, created, skipped };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

/**
 * Sweep semua trips yg ada tl_id dan belum punya entries — generate sekaligus
 */
export async function sweepGenerateAllTLPayments() {
  const supabase = getServiceClient() || createClient();

  try {
    const { data: trips, error } = await supabase
      .from('trips')
      .select('id, kode_trip, tl_id, departure, status')
      .not('tl_id', 'is', null)
      .order('departure', { ascending: false });

    if (error) return { error: error.message };

    let totalCreated = 0, totalSkipped = 0, errors = [];
    for (const trip of trips || []) {
      const res = await generateTLPaymentsForTrip(trip.id);
      if (res.error) {
        errors.push(`${trip.kode_trip || trip.id}: ${res.error}`);
      } else {
        totalCreated += res.created || 0;
        totalSkipped += res.skipped || 0;
      }
    }

    revalidateTL();
    return {
      ok: true,
      trips_checked: trips?.length || 0,
      total_created: totalCreated,
      total_skipped: totalSkipped,
      errors,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ UPDATE / MARK PAID ============

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
    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: paidAmount,
        paid_by: paidBy,
        payment_method: paymentMethod,
        notes,
      })
      .eq('id', id);

    if (error) return { error: error.message };
    revalidateTL();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function unmarkTLPaymentPaid(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'pending',
        paid_at: null,
        paid_amount: null,
        paid_by: null,
        payment_method: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateTL();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function markFinalReportSubmitted(id, formData) {
  const supabase = getServiceClient() || createClient();
  const reportNotes = formData?.get?.('final_report_notes')?.toString().trim() || null;
  try {
    const { error } = await supabase
      .from('tl_payments')
      .update({
        final_report_submitted: true,
        final_report_submitted_at: new Date().toISOString(),
        final_report_notes: reportNotes,
      })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateTL();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function unmarkFinalReportSubmitted(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { error } = await supabase
      .from('tl_payments')
      .update({
        final_report_submitted: false,
        final_report_submitted_at: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateTL();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function deleteTLPayment(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { error } = await supabase.from('tl_payments').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidateTL();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ PAYMENT PROOF (private bucket 'payroll-proofs' dari R174) ============

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

    revalidateTL();
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
    revalidateTL();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ SEND SLIP TO WHATSAPP (Fonnte) ============

/**
 * Send formatted text slip ke WA TL.
 * Pakai FONNTE_TOKEN_FINANCE karena ini outbound dari TEONE Finance ke TL.
 */
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
    const typeLabel = p.payment_type === 'dp_70' ? '70% (DP)' : '30% (Final)';

    const message = [
      `🌟 *SLIP PEMBAYARAN TOUR LEADER* 🌟`,
      ``,
      `Hai *${p.tl_name || 'TL'}*,`,
      `Berikut detail pembayaran fee TL untuk trip:`,
      ``,
      `📌 *Trip:* ${p.trip_kode || ''} ${p.trip_name || ''}`.trim(),
      `📅 *Keberangkatan:* ${fmtDateID(p.trip_departure)}`,
      p.trip_return ? `📅 *Return:* ${fmtDateID(p.trip_return)}` : null,
      ``,
      `💰 *Total Fee Trip:* ${fmtIDR(p.total_fee)}`,
      `📊 *Termin Ini:* ${typeLabel}`,
      `💵 *Nominal:* ${fmtIDR(p.amount)}`,
      `📆 *Jatuh Tempo:* ${fmtDateID(p.due_date)}`,
      ``,
      isPaid
        ? `✅ *STATUS: SUDAH DIBAYAR*\n📤 Dibayar: ${fmtDateID(p.paid_at)}\n💳 Metode: ${p.payment_method || 'transfer'}`
        : `⏳ *STATUS: MENUNGGU PEMBAYARAN*`,
      ``,
      p.payment_type === 'final_30' && !p.final_report_submitted
        ? `⚠ Final 30% akan di-release setelah Final Report di-submit.`
        : null,
      ``,
      p.tl_bank_name ? `🏦 *Rekening Tujuan Transfer:*\n${p.tl_bank_name}\n${p.tl_bank_account}\na.n. ${p.tl_bank_holder}` : null,
      ``,
      `Terima kasih atas dedikasinya! 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].filter((x) => x !== null).join('\n');

    const result = await sendFonnte(phone, message, { context: 'finance' });

    if (result.error) {
      return { error: result.error, sentVia: result.sentVia };
    }

    // Track WA send
    await supabase
      .from('tl_payments')
      .update({
        wa_sent_at: new Date().toISOString(),
        wa_sent_to: normalizePhone(phone),
      })
      .eq('id', id);

    revalidateTL();
    return { ok: true, sentVia: result.sentVia, target: normalizePhone(phone) };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ DASHBOARD STATS ============

export async function getTLPaymentsStats() {
  const empty = {
    total: 0,
    pending: 0,
    paid: 0,
    overdue: 0,
    total_amount_pending: 0,
    total_amount_paid: 0,
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
      if (p.status === 'paid') {
        stats.paid++;
        stats.total_amount_paid += Number(p.amount || 0);
      } else {
        stats.pending++;
        stats.total_amount_pending += Number(p.amount || 0);
        if (p.due_date && p.due_date < today) stats.overdue++;
      }
    }
    return stats;
  } catch {
    return empty;
  }
}
