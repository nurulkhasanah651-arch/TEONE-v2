// lib/actions/invoice-payment.js
// R201 v3: Approve invoice payment + auto-checklist + auto-WA
// FLOW:
// 1. Update invoice_payments.status = 'approved'
// 2. Insert ke participant_payments → drive matrix checklist auto-centang
// 3. Recompute invoice status (paid/partial)
// 4. Send WA confirmation via Fonnte ke peserta

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

function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

function fmtDate(d) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return String(d); }
}

async function safeUpdate(supabase, table, updates, whereField, whereValue) {
  let { error } = await supabase.from(table).update(updates).eq(whereField, whereValue);

  if (error && /approved_at|rejected_at|updated_at|rejected_reason/.test(error.message)) {
    const stripped = { ...updates };
    delete stripped.approved_at;
    delete stripped.rejected_at;
    delete stripped.updated_at;
    delete stripped.rejected_reason;
    const retry = await supabase.from(table).update(stripped).eq(whereField, whereValue);
    error = retry.error;
  }

  return { error };
}

/**
 * Insert participant_payments → drive matrix checklist
 */
async function syncToChecklist(supabase, payment, invoice) {
  // Cari passenger_id dari invoice
  // Invoice mungkin punya passenger_id langsung, atau lewat customer_id
  let passengerId = invoice.passenger_id || null;

  if (!passengerId && invoice.customer_id) {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id')
      .eq('customer_id', invoice.customer_id)
      .eq('trip_id', invoice.trip_id)
      .maybeSingle();
    passengerId = pax?.id || null;
  }

  if (!passengerId) {
    return { ok: false, reason: 'Passenger gak ketemu untuk invoice ini' };
  }

  // Map milestone (P1, P2, Pelunasan) ke type
  const milestone = (invoice.milestone || 'P1').toUpperCase();
  const type = milestone === 'DP' ? 'dp'
             : milestone === 'PELUNASAN' ? 'pelunasan'
             : milestone.toLowerCase(); // p1, p2, p3, dst

  // Cek apakah sudah ada participant_payment yg link ke invoice ini
  const { data: existing } = await supabase
    .from('participant_payments')
    .select('id')
    .eq('passenger_id', passengerId)
    .eq('transferred_to_payment_id', payment.id)
    .maybeSingle();

  if (existing) {
    // Update saja
    await supabase
      .from('participant_payments')
      .update({
        amount: payment.amount,
        paid_at: payment.payment_date || new Date().toISOString().slice(0, 10),
        is_transferred: true,
      })
      .eq('id', existing.id);
    return { ok: true, action: 'updated', passengerId };
  }

  // Insert baru
  const payload = {
    passenger_id: passengerId,
    type,
    label: invoice.invoice_no
      ? `${invoice.invoice_no} (${milestone})`
      : `Payment ${milestone}`,
    amount: payment.amount,
    paid_at: payment.payment_date || new Date().toISOString().slice(0, 10),
    notes: `Approved dari invoice_payment #${payment.id} via link`,
    is_transferred: true,
    transferred_to_payment_id: payment.id,
    transfer_note: `Approved: ${invoice.invoice_no || 'inv #'+invoice.id}`,
    created_by: 'finance-approval',
  };

  let { error } = await supabase
    .from('participant_payments')
    .insert(payload);

  // Defensive retry tanpa field opsional
  if (error) {
    const stripped = { ...payload };
    delete stripped.is_transferred;
    delete stripped.transferred_to_payment_id;
    delete stripped.transfer_note;
    const retry = await supabase.from('participant_payments').insert(stripped);
    error = retry.error;
  }

  if (error) {
    return { ok: false, reason: error.message };
  }
  return { ok: true, action: 'inserted', passengerId };
}

/**
 * Send WA confirmation ke peserta via Fonnte
 */
async function sendPaymentConfirmationWA(supabase, payment, invoice, passengerId) {
  const token = process.env.FONNTE_TOKEN || process.env.FONNTE_API_KEY;
  if (!token) return { ok: false, reason: 'FONNTE_TOKEN gak ke-set' };

  // Ambil phone customer
  let phone = null;
  let customerName = invoice.customer_name || 'Pak/Bu';

  if (passengerId) {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('customer_id, customers(name, phone, whatsapp)')
      .eq('id', passengerId)
      .maybeSingle();

    if (pax?.customers) {
      phone = pax.customers.phone || pax.customers.whatsapp;
      customerName = pax.customers.name || customerName;
    }
  }

  if (!phone) {
    return { ok: false, reason: 'Phone customer kosong' };
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return { ok: false, reason: 'Phone gak valid' };

  // Build message
  const milestone = invoice.milestone || 'Payment';
  const tripCode = invoice.trip_kode || invoice.trip_id || '';

  const message = [
    `Halo Kak ${customerName} 👋`,
    '',
    `Pembayaran ${milestone} sudah kami *TERIMA* dan ter-konfirmasi ✅`,
    '',
    `📋 Detail:`,
    `🌍 Trip: *${tripCode}*`,
    `📄 Invoice: ${invoice.invoice_no || '#'+invoice.id}`,
    `💰 Nominal: *${fmtRupiah(payment.amount)}*`,
    `📅 Tanggal: ${fmtDate(payment.payment_date)}`,
    `💳 Metode: ${payment.payment_method || 'Transfer'}`,
    '',
    `Terima kasih atas pembayarannya 🙏`,
    `Kami akan kirim detail trip & briefing selanjutnya via WA terpisah.`,
    '',
    `_TEONE — Traveling Eropa_`,
  ].join('\n');

  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: normalizedPhone,
        message,
        countryCode: '62',
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.status === false) {
      return { ok: false, reason: data?.reason || `Fonnte error ${res.status}` };
    }

    return { ok: true, phone: normalizedPhone };
  } catch (e) {
    return { ok: false, reason: 'Fonnte exception: ' + (e?.message || String(e)) };
  }
}

/**
 * APPROVE — main function
 */
export async function approveInvoicePayment(paymentId) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return { error: 'Service role gak ke-set' };
    if (!paymentId) return { error: 'Payment ID kosong' };

    // 1. Fetch payment + invoice (incl. fields needed buat passenger lookup)
    const { data: payment, error: fetchErr } = await supabase
      .from('invoice_payments')
      .select(`
        *,
        invoices (
          id, amount, status, invoice_no, customer_name, customer_id,
          trip_id, trip_kode, milestone, passenger_id
        )
      `)
      .eq('id', paymentId)
      .maybeSingle();

    if (fetchErr) return { error: 'Fetch error: ' + fetchErr.message };
    if (!payment) return { error: 'Payment gak ketemu' };
    if (payment.status === 'approved') return { error: 'Sudah pernah di-approve' };

    const invoice = payment.invoices;
    if (!invoice) return { error: 'Invoice link kosong' };

    // 2. Update invoice_payments status
    const { error: updErr } = await safeUpdate(
      supabase,
      'invoice_payments',
      { status: 'approved', approved_at: new Date().toISOString() },
      'id',
      paymentId
    );
    if (updErr) return { error: 'Update payment failed: ' + updErr.message };

    // 3. Sync ke participant_payments (auto-checklist)
    const syncResult = await syncToChecklist(supabase, payment, invoice);

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

    // 5. Send WA confirmation
    let waResult = { ok: false, reason: 'skipped' };
    if (syncResult.ok) {
      waResult = await sendPaymentConfirmationWA(supabase, payment, invoice, syncResult.passengerId);
    }

    // Revalidate semua page yg related
    revalidatePath('/invoices');
    revalidatePath('/finance/payments');
    if (invoice.trip_id) {
      revalidatePath(`/finance/payments/${invoice.trip_id}`);
      revalidatePath(`/finance/cashflow/${invoice.trip_id}`);
    }
    revalidatePath('/accounting');

    return {
      ok: true,
      message:
        '✓ Payment approved' +
        (syncResult.ok ? ` + checklist sync (${syncResult.action})` : ` (checklist skip: ${syncResult.reason})`) +
        (waResult.ok ? ` + WA sent ke ${waResult.phone}` : ` (WA skip: ${waResult.reason})`),
      checklist_synced: syncResult.ok,
      wa_sent: waResult.ok,
      wa_reason: waResult.reason,
    };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}

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
