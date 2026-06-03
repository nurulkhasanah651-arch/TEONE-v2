'use server';

// R201 v4: Invoice payment actions — MIRRORING dp.js pattern (proven working)
// - approveInvoicePayment: update status + sync matrix + send WA via Fonnte
// - rejectInvoicePayment: reject with reason
// - deleteInvoicePayment: delete

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '62' + p.substring(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

async function sendFonnte(phone, message) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) return { error: 'FONNTE_TOKEN belum di-set' };
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ target: phone, message, countryCode: '62' }),
    });
    const data = await res.json();
    if (!res.ok || data.status === false) {
      return { error: 'Fonnte: ' + (data.reason || data.message || 'unknown') };
    }
    return { ok: true };
  } catch (e) {
    return { error: 'Network: ' + (e?.message || 'unknown') };
  }
}

function revalidateAll(tripId) {
  revalidatePath('/invoices');
  revalidatePath('/finance');
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  revalidatePath('/dashboard');
  if (tripId) {
    revalidatePath(`/finance/payments/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
  }
}

/**
 * Sync 1 invoice payment ke matrix (insert/update participant_payments)
 * Pattern: UPSERT by (passenger_id, type) — gak pakai transferred_to_payment_id
 */
async function syncPaymentToMatrix(supabase, invoice, payment, approved_by, passengerId) {
  if (!passengerId) return { ok: false, reason: 'passenger_id kosong' };

  // type mengikuti milestone invoice (DP, P1, P2, Pelunasan)
  const type = (invoice.milestone || 'P1').toString();
  const noteText = `Approved by ${approved_by} (Invoice ${invoice.invoice_no || '#'+invoice.id})`;

  // Cek existing
  const { data: existing } = await supabase
    .from('participant_payments')
    .select('id, amount')
    .eq('passenger_id', passengerId)
    .eq('type', type)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('participant_payments')
      .update({
        amount: payment.amount,
        notes: noteText,
        paid_at: payment.payment_date || new Date().toISOString().slice(0, 10),
      })
      .eq('id', existing.id);
    if (error) return { ok: false, reason: error.message };
    return { ok: true, action: 'updated' };
  }

  // Insert baru — TANPA transferred_to_payment_id (avoid UUID-bigint mismatch)
  const { error } = await supabase
    .from('participant_payments')
    .insert({
      passenger_id: passengerId,
      type,
      amount: payment.amount,
      paid_at: payment.payment_date || new Date().toISOString().slice(0, 10),
      notes: noteText,
    });

  if (error) return { ok: false, reason: error.message };
  return { ok: true, action: 'inserted' };
}

/**
 * Helper defensive update — strip column yg gak ada
 */
async function safeUpdate(supabase, table, updates, whereField, whereValue) {
  let { error } = await supabase.from(table).update(updates).eq(whereField, whereValue);
  if (error && /approved_at|rejected_at|updated_at|rejected_reason|approved_by|rejected_by/.test(error.message)) {
    const stripped = { ...updates };
    delete stripped.approved_at;
    delete stripped.rejected_at;
    delete stripped.updated_at;
    delete stripped.rejected_reason;
    delete stripped.approved_by;
    delete stripped.rejected_by;
    const retry = await supabase.from(table).update(stripped).eq(whereField, whereValue);
    error = retry.error;
  }
  return { error };
}

// ============================================================
// APPROVE INVOICE PAYMENT
// ============================================================
export async function approveInvoicePayment(paymentId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Fetch payment + invoice
  const { data: payment } = await supabase
    .from('invoice_payments')
    .select('*, invoices(*)')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment) return { error: 'Payment tidak ditemukan' };
  if (payment.status === 'approved') return { error: 'Sudah ter-approve sebelumnya' };

  const invoice = payment.invoices;
  if (!invoice) return { error: 'Invoice link kosong' };

  // 1. Update invoice_payments.status
  const { error: updErr } = await safeUpdate(
    supabase,
    'invoice_payments',
    {
      status: 'approved',
      approved_by,
      approved_at: new Date().toISOString(),
    },
    'id',
    paymentId
  );
  if (updErr) return { error: 'Update payment: ' + updErr.message };

  // 2. Cari passenger_id (dari invoice atau lookup via customer_id+trip_id)
  let passengerId = invoice.passenger_id || null;

  if (!passengerId && invoice.customer_id && invoice.trip_id) {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id')
      .eq('customer_id', invoice.customer_id)
      .eq('trip_id', invoice.trip_id)
      .maybeSingle();
    passengerId = pax?.id || null;
  }

  // 3. Sync ke matrix
  const syncResult = await syncPaymentToMatrix(supabase, invoice, payment, approved_by, passengerId);

  // 4. Recompute invoice status
  const { data: allPayments } = await supabase
    .from('invoice_payments')
    .select('amount, status')
    .eq('invoice_id', invoice.id)
    .eq('status', 'approved');

  const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const invoiceAmount = Number(invoice.amount || 0);

  let newInvoiceStatus = invoice.status;
  if (totalPaid >= invoiceAmount && invoiceAmount > 0) {
    newInvoiceStatus = 'paid';
  } else if (totalPaid > 0) {
    newInvoiceStatus = 'partial';
  }
  if (newInvoiceStatus !== invoice.status) {
    await supabase.from('invoices').update({ status: newInvoiceStatus }).eq('id', invoice.id);
  }

  // 5. Send WA via Fonnte
  // Cari phone — coba dari invoice langsung atau lookup customer
  let customerPhone = invoice.customer_phone || null;
  let customerName = invoice.customer_name || 'Bapak/Ibu';

  if (!customerPhone && passengerId) {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('customer_id, customers(name, phone, whatsapp)')
      .eq('id', passengerId)
      .maybeSingle();
    if (pax?.customers) {
      customerPhone = pax.customers.phone || pax.customers.whatsapp;
      customerName = pax.customers.name || customerName;
    }
  }

  let waResult = { ok: false };
  if (customerPhone) {
    const { data: company } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    const companyName = company?.company_name || 'Traveling Eropa';

    const milestone = invoice.milestone || 'Payment';
    const tripLabel = invoice.trip_kode || invoice.trip_id || '';
    const tripName = invoice.trip_name || '';

    const message = `Halo ${customerName},

✅ *Pembayaran ${milestone} Sudah Diterima*

Trip: ${tripName}${tripLabel ? ` (${tripLabel})` : ''}
Invoice: ${invoice.invoice_no || '#'+invoice.id}
Nominal: *${fmtRupiah(payment.amount)}*
Tanggal: ${payment.payment_date || '—'}
Metode: ${payment.payment_method || 'Transfer'}

Pembayaran Anda sudah kami verifikasi.
${newInvoiceStatus === 'paid' ? 'Invoice ini sudah *LUNAS* ✓' : 'Terima kasih atas pembayarannya 🙏'}

Terima kasih,
${companyName}`;

    waResult = await sendFonnte(normalizePhone(customerPhone), message);
  } else {
    waResult = { ok: false, error: 'Customer phone kosong' };
  }

  revalidateAll(invoice.trip_id);
  return {
    ok: true,
    checklist_synced: syncResult.ok,
    checklist_reason: syncResult.reason || syncResult.action,
    wa_sent: !!waResult.ok,
    wa_error: waResult.error || null,
    invoice_status: newInvoiceStatus,
  };
}

// ============================================================
// REJECT INVOICE PAYMENT
// ============================================================
export async function rejectInvoicePayment(paymentId, reason) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const rejected_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: payment } = await supabase
    .from('invoice_payments')
    .select('id, status, invoice_id, invoices(trip_id)')
    .eq('id', paymentId)
    .maybeSingle();
  if (!payment) return { error: 'Payment tidak ditemukan' };

  const { error } = await safeUpdate(
    supabase,
    'invoice_payments',
    {
      status: 'rejected',
      rejected_by,
      rejected_at: new Date().toISOString(),
      rejected_reason: reason || null,
    },
    'id',
    paymentId
  );

  if (error) {
    const { error: e2 } = await supabase
      .from('invoice_payments')
      .update({ status: 'rejected' })
      .eq('id', paymentId);
    if (e2) return { error: 'Reject: ' + e2.message };
  }

  revalidateAll(payment.invoices?.trip_id);
  return { ok: true };
}

// ============================================================
// DELETE INVOICE PAYMENT
// ============================================================
export async function deleteInvoicePayment(paymentId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId);
  if (error) return { error: error.message };

  revalidateAll(null);
  return { ok: true };
}
