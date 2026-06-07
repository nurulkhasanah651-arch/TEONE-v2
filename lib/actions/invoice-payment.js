'use server';

// R201 v5: Invoice payment actions
// - syncPaymentToMatrix: handle FAMILY case (auto-spread ke semua member)
// - approve: 1 invoice family → centang semua family member
// - WA dikirim ke kepala kalo family, individual kalo bukan family

import { revalidatePath } from 'next/cache';
import { createPublicClient as createClient } from '@/lib/supabase/server';
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

/**
 * UPSERT 1 participant_payment (passenger + type)
 */
async function upsertParticipantPayment(supabase, passengerId, type, amount, paidAt, noteText) {
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
        amount,
        notes: noteText,
        paid_at: paidAt,
      })
      .eq('id', existing.id);
    return { ok: !error, action: 'updated', error: error?.message };
  }

  const { error } = await supabase
    .from('participant_payments')
    .insert({
      passenger_id: passengerId,
      type,
      amount,
      paid_at: paidAt,
      notes: noteText,
    });
  return { ok: !error, action: 'inserted', error: error?.message };
}

/**
 * Sync ke matrix — handle FAMILY case
 * Kalau passenger ada di family_group → sync ke semua member
 * Amount di-split equal per member
 */
async function syncPaymentToMatrix(supabase, invoice, payment, approved_by, headPassengerId) {
  if (!headPassengerId) return { ok: false, reason: 'passenger_id kosong' };

  const type = (invoice.milestone || 'P1').toString();
  const paidAt = payment.payment_date || new Date().toISOString().slice(0, 10);
  const invoiceLabel = invoice.invoice_no || `#${invoice.id}`;

  // Cek apakah passenger ini ada di family_group
  const { data: headPax } = await supabase
    .from('trip_passengers')
    .select('id, family_group_id, trip_id')
    .eq('id', headPassengerId)
    .maybeSingle();

  let memberIds = [headPassengerId];
  let isFamily = false;
  let familyId = headPax?.family_group_id || null;

  if (familyId) {
    isFamily = true;
    // Ambil semua member family ini (untuk trip yg sama)
    const { data: members } = await supabase
      .from('trip_passengers')
      .select('id')
      .eq('family_group_id', familyId)
      .eq('trip_id', headPax.trip_id);

    if (members && members.length > 0) {
      memberIds = members.map((m) => m.id);
    }
  }

  // Split amount equal per member (kalau family)
  const totalAmount = Number(payment.amount) || 0;
  const amountPerMember = memberIds.length > 0 ? Math.floor(totalAmount / memberIds.length) : totalAmount;

  // Upsert ke semua member
  const results = [];
  for (const pid of memberIds) {
    const noteText = isFamily
      ? `Family payment approved by ${approved_by} (Invoice ${invoiceLabel}, share ${memberIds.length} pax)`
      : `Approved by ${approved_by} (Invoice ${invoiceLabel})`;

    const r = await upsertParticipantPayment(supabase, pid, type, amountPerMember, paidAt, noteText);
    results.push({ passenger_id: pid, ...r });
  }

  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    is_family: isFamily,
    family_id: familyId,
    member_count: memberIds.length,
    synced: results.filter((r) => r.ok).length,
    failed: failed.length,
    failures: failed,
  };
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

  // 1. Update payment status
  const { error: updErr } = await safeUpdate(
    supabase, 'invoice_payments',
    { status: 'approved', approved_by, approved_at: new Date().toISOString() },
    'id', paymentId
  );
  if (updErr) return { error: 'Update payment: ' + updErr.message };

  // 2. Cari passenger_id (kepala family atau individu)
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

  // 3. Sync ke matrix (handle family case)
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

  // 5. Send WA — kalau family, kirim ke kepala family. Kalau bukan, ke peserta.
  let waResult = { ok: false };
  let phoneTarget = null;
  let nameTarget = invoice.customer_name || 'Bapak/Ibu';

  if (syncResult.is_family && syncResult.family_id) {
    // Ambil kepala family
    const { data: fam } = await supabase
      .from('family_groups')
      .select('id, name, head_passenger_id, head_customer_id')
      .eq('id', syncResult.family_id)
      .maybeSingle();

    if (fam?.head_customer_id) {
      const { data: headCust } = await supabase
        .from('customers')
        .select('name, phone, whatsapp')
        .eq('id', fam.head_customer_id)
        .maybeSingle();
      if (headCust) {
        phoneTarget = headCust.phone || headCust.whatsapp;
        nameTarget = headCust.name || nameTarget;
      }
    }
  }

  // Fallback: cari phone dari invoice atau passenger
  if (!phoneTarget) {
    phoneTarget = invoice.customer_phone || null;
    if (!phoneTarget && passengerId) {
      const { data: pax } = await supabase
        .from('trip_passengers')
        .select('customers(name, phone, whatsapp)')
        .eq('id', passengerId)
        .maybeSingle();
      if (pax?.customers) {
        phoneTarget = pax.customers.phone || pax.customers.whatsapp;
        nameTarget = pax.customers.name || nameTarget;
      }
    }
  }

  if (phoneTarget) {
    const { data: company } = await supabase
      .from('brands').select('*, company_name:name, company_logo_url:logo_url').eq('id', invoice.brand_id || 1).maybeSingle();
    const companyName = company?.company_name || 'Traveling Eropa';

    const milestone = invoice.milestone || 'Payment';
    const tripLabel = invoice.trip_kode || invoice.trip_id || '';
    const tripName = invoice.trip_name || '';
    const familyNote = syncResult.is_family
      ? `\n\n👨‍👩‍👧 Family — ${syncResult.member_count} pax tercatat`
      : '';

    const message = `Halo ${nameTarget},

✅ *Pembayaran ${milestone} Sudah Diterima*

Trip: ${tripName}${tripLabel ? ` (${tripLabel})` : ''}
Invoice: ${invoice.invoice_no || '#'+invoice.id}
Nominal: *${fmtRupiah(payment.amount)}*
Tanggal: ${payment.payment_date || '—'}
Metode: ${payment.payment_method || 'Transfer'}${familyNote}

Pembayaran Anda sudah kami verifikasi.
${newInvoiceStatus === 'paid' ? 'Invoice ini sudah *LUNAS* ✓' : 'Terima kasih atas pembayarannya 🙏'}

Terima kasih,
${companyName}`;

    waResult = await sendFonnte(normalizePhone(phoneTarget), message);
  } else {
    waResult = { ok: false, error: 'Phone customer/kepala family kosong' };
  }

  revalidateAll(invoice.trip_id);
  return {
    ok: true,
    checklist_synced: syncResult.ok,
    is_family: syncResult.is_family,
    member_count: syncResult.member_count,
    wa_sent: !!waResult.ok,
    wa_target: phoneTarget,
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
    .eq('id', paymentId).maybeSingle();
  if (!payment) return { error: 'Payment tidak ditemukan' };

  const { error } = await safeUpdate(
    supabase, 'invoice_payments',
    { status: 'rejected', rejected_by, rejected_at: new Date().toISOString(), rejected_reason: reason || null },
    'id', paymentId
  );

  if (error) {
    const { error: e2 } = await supabase
      .from('invoice_payments').update({ status: 'rejected' }).eq('id', paymentId);
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
