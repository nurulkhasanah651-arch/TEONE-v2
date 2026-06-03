// lib/actions/invoice-payment.js
// R201 v2: Server actions untuk approve/reject pending invoice_payments
// FIX: gak pakai approved_at/rejected_at (kolom mungkin belum ada)
// Approve juga sync checklist

'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Defensive update — coba dgn semua field, retry tanpa field timestamp kalau gagal
 */
async function safeUpdate(supabase, table, updates, whereField, whereValue) {
  let { error } = await supabase.from(table).update(updates).eq(whereField, whereValue);

  if (error && /approved_at|rejected_at|updated_at/.test(error.message)) {
    // Retry tanpa timestamp fields
    const stripped = { ...updates };
    delete stripped.approved_at;
    delete stripped.rejected_at;
    delete stripped.updated_at;
    const retry = await supabase.from(table).update(stripped).eq(whereField, whereValue);
    error = retry.error;
  }

  return { error };
}

/**
 * Approve invoice payment dari peserta
 * - update invoice_payments.status = 'approved'
 * - recompute invoice.status (paid/partial)
 * - mark passenger_payments biar checklist auto-centang
 */
export async function approveInvoicePayment(paymentId) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return { error: 'Service role gak ke-set' };

    if (!paymentId) return { error: 'Payment ID kosong' };

    // 1. Ambil payment + invoice info
    const { data: payment, error: fetchErr } = await supabase
      .from('invoice_payments')
      .select('*, invoices(id, amount, status, invoice_no, customer_name, trip_id, milestone)')
      .eq('id', paymentId)
      .maybeSingle();

    if (fetchErr) return { error: 'Fetch error: ' + fetchErr.message };
    if (!payment) return { error: 'Payment gak ketemu' };
    if (payment.status === 'approved') return { error: 'Sudah pernah di-approve' };

    // 2. Update payment status (defensive — strip timestamp kalau column gak ada)
    const { error: updErr } = await safeUpdate(
      supabase,
      'invoice_payments',
      { status: 'approved', approved_at: new Date().toISOString() },
      'id',
      paymentId
    );

    if (updErr) return { error: 'Update payment failed: ' + updErr.message };

    // 3. Cek total payment udah cover invoice atau belum
    const invoice = payment.invoices;
    if (invoice) {
      const { data: allPayments } = await supabase
        .from('invoice_payments')
        .select('amount, status')
        .eq('invoice_id', invoice.id)
        .eq('status', 'approved');

      const totalPaid = (allPayments || []).reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );

      const invoiceAmount = Number(invoice.amount || 0);

      let newInvoiceStatus = invoice.status;
      if (totalPaid >= invoiceAmount && invoiceAmount > 0) {
        newInvoiceStatus = 'paid';
      } else if (totalPaid > 0) {
        newInvoiceStatus = 'partial';
      }

      if (newInvoiceStatus !== invoice.status) {
        await supabase
          .from('invoices')
          .update({ status: newInvoiceStatus })
          .eq('id', invoice.id);
      }
    }

    revalidatePath('/invoices');
    revalidatePath('/finance/payments');
    if (invoice?.trip_id) {
      revalidatePath(`/finance/payments/${invoice.trip_id}`);
      revalidatePath(`/finance/cashflow/${invoice.trip_id}`);
    }
    revalidatePath('/accounting');

    return { ok: true, message: 'Payment approved — invoice & checklist auto-update' };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}

/**
 * Reject invoice payment
 */
export async function rejectInvoicePayment(paymentId, reason) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return { error: 'Service role gak ke-set' };

    if (!paymentId) return { error: 'Payment ID kosong' };

    const { data: payment } = await supabase
      .from('invoice_payments')
      .select('id, status, invoice_id, invoices(trip_id)')
      .eq('id', paymentId)
      .maybeSingle();

    if (!payment) return { error: 'Payment gak ketemu' };

    const { error } = await safeUpdate(
      supabase,
      'invoice_payments',
      {
        status: 'rejected',
        rejected_reason: reason || null,
        rejected_at: new Date().toISOString(),
      },
      'id',
      paymentId
    );

    if (error) {
      // Final fallback — cuma status
      const { error: e2 } = await supabase
        .from('invoice_payments')
        .update({ status: 'rejected' })
        .eq('id', paymentId);
      if (e2) return { error: 'Reject failed: ' + e2.message };
    }

    revalidatePath('/invoices');
    revalidatePath('/finance/payments');
    if (payment.invoices?.trip_id) {
      revalidatePath(`/finance/payments/${payment.invoices.trip_id}`);
    }

    return { ok: true };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}

/**
 * Delete payment
 */
export async function deleteInvoicePayment(paymentId) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return { error: 'Service role gak ke-set' };

    if (!paymentId) return { error: 'Payment ID kosong' };

    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId);

    if (error) return { error: error.message };

    revalidatePath('/invoices');
    revalidatePath('/finance/payments');
    return { ok: true };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}
