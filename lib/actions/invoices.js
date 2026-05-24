'use server';

// Round 93: Invoicing actions
// - createInvoice: generate manual per milestone
// - sendInvoiceWA: kirim via Fonnte
// - approvePayment: verify bukti transfer → auto-send receipt WA
// - rejectPayment: kalau bukti ga valid

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function genToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
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
      return { error: 'Fonnte error: ' + (data.reason || data.message || 'unknown') };
    }
    return { ok: true };
  } catch (e) {
    return { error: 'Network error: ' + (e?.message || 'unknown') };
  }
}

function revalidateAll(tripId) {
  revalidatePath('/invoices');
  revalidatePath('/finance');
  revalidatePath('/finance/payments');
  revalidatePath('/finance/cashflow');
  revalidatePath('/accounting');
  revalidatePath('/dashboard');
  if (tripId) {
    revalidatePath(`/finance/payments/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
  }
}

// Round 99: AUTO-SYNC invoice paid → participant_payments
// (biar checkbox di Payment Checklist matrix auto-centang)
async function syncInvoiceToMatrix(supabase, inv, paidAmount) {
  if (!inv?.passenger_id || !inv?.milestone) return;

  const verified_by = 'invoice-sync';
  const amount = Number(paidAmount || inv.amount) || 0;
  if (amount <= 0) return;

  // Cek apakah sudah ada participant_payments dengan passenger_id + type=milestone
  const { data: existing } = await supabase
    .from('participant_payments')
    .select('id, amount')
    .eq('passenger_id', inv.passenger_id)
    .eq('type', inv.milestone)
    .maybeSingle();

  if (existing) {
    // Update amount kalau berbeda (kasih warning di notes)
    if (Number(existing.amount) !== amount) {
      await supabase
        .from('participant_payments')
        .update({
          amount,
          notes: `Synced dari Invoice ${inv.invoice_no} (Rp ${amount.toLocaleString('id-ID')})`,
        })
        .eq('id', existing.id);
    }
  } else {
    // Insert baru
    await supabase.from('participant_payments').insert({
      passenger_id: inv.passenger_id,
      type: inv.milestone,
      amount,
      paid_at: new Date().toISOString(),
      notes: `Synced dari Invoice ${inv.invoice_no}`,
    });
  }
}

// ============================================================
// GENERATE INVOICE NUMBER per trip
// Format: TEONE-{kode_trip}-{seq}
// ============================================================
async function generateInvoiceNo(supabase, tripId) {
  const { data: trip } = await supabase
    .from('trips')
    .select('kode_trip, id')
    .eq('id', tripId)
    .maybeSingle();

  const kode = (trip?.kode_trip || tripId).replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Get count of existing invoices for this trip
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId);

  const seq = String((count || 0) + 1).padStart(3, '0');
  return `TEONE-${kode}-${seq}`;
}

// ============================================================
// CREATE INVOICE (manual generate dari Payment Checklist)
// ============================================================
export async function createInvoice(params) {
  const { trip_id, passenger_id, customer_id, milestone, amount, due_date, description } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!trip_id || !milestone || !amount) {
    return { error: 'trip_id, milestone, amount wajib' };
  }

  // Fetch snapshot data
  const [tripRes, custRes] = await Promise.all([
    supabase.from('trips').select('name, kode_trip').eq('id', trip_id).maybeSingle(),
    customer_id
      ? supabase.from('customers').select('name, phone, email').eq('id', customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const trip = tripRes.data;
  const cust = custRes.data;

  const invoice_no = await generateInvoiceNo(supabase, trip_id);
  const token = genToken();

  const payload = {
    invoice_no,
    trip_id,
    passenger_id: passenger_id || null,
    customer_id: customer_id || null,
    milestone,
    amount: Number(amount) || 0,
    due_date: due_date || null,
    status: 'draft',
    description: description || `${milestone} — ${trip?.name || trip_id}`,
    public_token: token,
    created_by: user.user_metadata?.full_name || user.email || 'unknown',
    customer_name: cust?.name || null,
    customer_phone: cust?.phone || null,
    customer_email: cust?.email || null,
    trip_name: trip?.name || null,
    trip_kode: trip?.kode_trip || null,
  };

  const { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id, invoice_no, public_token')
    .single();

  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true, invoice_id: data.id, invoice_no: data.invoice_no, token: data.public_token };
}

// ============================================================
// SEND INVOICE via WA Fonnte
// ============================================================
export async function sendInvoiceWA(invoiceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: inv } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();

  if (!inv) return { error: 'Invoice tidak ditemukan' };
  if (!inv.customer_phone) return { error: 'Peserta belum punya no HP' };

  // Fetch company settings
  const { data: company } = await supabase
    .from('company_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://teone.dev';
  const invoiceLink = `${baseUrl}/invoice/${inv.public_token}`;
  const companyName = company?.company_name || 'Traveling Eropa';

  const message = `Halo ${inv.customer_name || 'Bapak/Ibu'},

📄 *Invoice ${inv.invoice_no}*

Trip: ${inv.trip_name}${inv.trip_kode ? ` (${inv.trip_kode})` : ''}
Tagihan: *${inv.milestone}*
Jumlah: *${fmtRupiah(inv.amount)}*${inv.due_date ? `\nDue Date: ${inv.due_date}` : ''}

Detail invoice & cara pembayaran:
${invoiceLink}

Setelah transfer, mohon upload bukti di link di atas atau balas pesan ini.

Terima kasih,
${companyName}`;

  const phone = normalizePhone(inv.customer_phone);
  const result = await sendFonnte(phone, message);
  if (result?.error) return { error: result.error };

  // Update status sent
  await supabase
    .from('invoices')
    .update({
      status: inv.status === 'paid' ? 'paid' : 'sent',
      sent_at: new Date().toISOString(),
      sent_via: 'whatsapp',
    })
    .eq('id', invoiceId);

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

// ============================================================
// UPLOAD BUKTI BAYAR (dari peserta via public page)
// ============================================================
export async function uploadPaymentProof(token, formData) {
  const supabase = createClient();

  // No auth required (public endpoint via token)
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status, amount, trip_id')
    .eq('public_token', token)
    .maybeSingle();

  if (!inv) return { error: 'Invoice tidak ditemukan' };

  const amount = parseInt(formData.get('amount')) || inv.amount;
  const payment_method = formData.get('payment_method') || 'transfer';
  const payment_date = formData.get('payment_date') || new Date().toISOString().slice(0, 10);
  const note = formData.get('note') || null;
  const proof_url = formData.get('proof_url') || null;
  const proof_file_name = formData.get('proof_file_name') || null;

  const { error } = await supabase.from('invoice_payments').insert({
    invoice_id: inv.id,
    amount,
    payment_date,
    payment_method,
    proof_url,
    proof_file_name,
    note_from_customer: note,
    status: 'pending',
  });

  if (error) return { error: error.message };

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

// ============================================================
// APPROVE PAYMENT — verify bukti + AUTO-SEND receipt WA
// ============================================================
export async function approveInvoicePayment(paymentId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const verified_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Get payment + invoice info
  const { data: pay } = await supabase
    .from('invoice_payments')
    .select('*, invoices(*)')
    .eq('id', paymentId)
    .maybeSingle();

  if (!pay) return { error: 'Payment record tidak ditemukan' };
  const inv = pay.invoices;
  if (!inv) return { error: 'Invoice tidak ditemukan' };

  // Mark payment verified
  await supabase
    .from('invoice_payments')
    .update({
      status: 'verified',
      verified_by,
      verified_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  // Mark invoice paid
  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by_check: verified_by,
    })
    .eq('id', inv.id);

  // Round 99: AUTO-SYNC ke participant_payments → checkbox matrix auto-centang
  await syncInvoiceToMatrix(supabase, inv, pay.amount);

  // AUTO-SEND receipt WA + info sisa
  if (inv.customer_phone) {
    // Compute total invoices + paid + sisa untuk trip ini, peserta ini
    let allInvoices = [];
    if (inv.passenger_id) {
      const { data } = await supabase
        .from('invoices')
        .select('amount, status, milestone, due_date')
        .eq('trip_id', inv.trip_id)
        .eq('passenger_id', inv.passenger_id)
        .order('due_date', { ascending: true, nullsFirst: false });
      allInvoices = data || [];
    }

    const totalAll = allInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
    const totalPaid = allInvoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + Number(i.amount || 0), 0);
    const sisa = Math.max(totalAll - totalPaid, 0);

    // Cari next unpaid invoice
    const nextInv = allInvoices.find((i) => i.status !== 'paid');

    const { data: company } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle();
    const companyName = company?.company_name || 'Traveling Eropa';

    let nextInfo = '';
    if (nextInv && sisa > 0) {
      nextInfo = `\n\n📅 Payment Selanjutnya:
${nextInv.milestone}: ${fmtRupiah(nextInv.amount)}${nextInv.due_date ? `\nDue: ${nextInv.due_date}` : ''}`;
    } else if (sisa === 0 && totalAll > 0) {
      nextInfo = `\n\n🎉 *Pembayaran trip ${inv.trip_name || inv.trip_id} LUNAS!*`;
    }

    const message = `Halo ${inv.customer_name || 'Bapak/Ibu'},

✅ *Pembayaran Diterima*

Invoice: ${inv.invoice_no}
${inv.milestone}: ${fmtRupiah(pay.amount)}
Tanggal: ${pay.payment_date || '—'}

📊 Ringkasan Pembayaran ${inv.trip_kode || ''}:
Total Tagihan: ${fmtRupiah(totalAll)}
Sudah Dibayar: *${fmtRupiah(totalPaid)}*
Sisa: *${fmtRupiah(sisa)}*${nextInfo}

Terima kasih,
${companyName}`;

    const phone = normalizePhone(inv.customer_phone);
    await sendFonnte(phone, message); // best-effort, ga block kalau error
  }

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function rejectInvoicePayment(paymentId, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Fetch invoice trip_id for revalidate
  const { data: pay } = await supabase
    .from('invoice_payments')
    .select('invoices(trip_id)')
    .eq('id', paymentId)
    .maybeSingle();

  const { error } = await supabase
    .from('invoice_payments')
    .update({
      status: 'rejected',
      reject_reason: reason || 'Bukti tidak valid',
      verified_by: user.user_metadata?.full_name || user.email,
      verified_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  if (error) return { error: error.message };

  revalidateAll(pay?.invoices?.trip_id);
  return { ok: true };
}

// ============================================================
// MARK PAID MANUAL (kalau owner verify dari mutasi bank)
// ============================================================
export async function markInvoicePaidManual(invoiceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const verified_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: inv } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();

  if (!inv) return { error: 'Invoice tidak ditemukan' };

  // Insert payment record (manual)
  await supabase.from('invoice_payments').insert({
    invoice_id: invoiceId,
    amount: inv.amount,
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'manual_mark',
    status: 'verified',
    verified_by,
    verified_at: new Date().toISOString(),
    note_from_customer: 'Marked paid manually by ' + verified_by,
  });

  // Mark invoice paid (will trigger receipt WA in next call)
  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by_check: verified_by,
    })
    .eq('id', invoiceId);

  // Round 99: Sync ke participant_payments → matrix auto-centang
  await syncInvoiceToMatrix(supabase, inv, inv.amount);

  // Trigger auto-receipt
  // (Reuse approveInvoicePayment logic by calling sendReceiptWA helper inline)
  if (inv.customer_phone) {
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('amount, status, milestone, due_date')
      .eq('trip_id', inv.trip_id)
      .eq('passenger_id', inv.passenger_id);

    const arr = allInvoices || [];
    const totalAll = arr.reduce((s, i) => s + Number(i.amount || 0), 0);
    const totalPaid = arr.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0);
    const sisa = Math.max(totalAll - totalPaid, 0);
    const nextInv = arr.find((i) => i.status !== 'paid');

    const { data: company } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle();
    const companyName = company?.company_name || 'Traveling Eropa';

    let nextInfo = '';
    if (nextInv && sisa > 0) {
      nextInfo = `\n\n📅 Payment Selanjutnya:\n${nextInv.milestone}: ${fmtRupiah(nextInv.amount)}${nextInv.due_date ? `\nDue: ${nextInv.due_date}` : ''}`;
    } else if (sisa === 0) {
      nextInfo = `\n\n🎉 *Pembayaran LUNAS!*`;
    }

    const message = `Halo ${inv.customer_name || 'Bapak/Ibu'},

✅ *Pembayaran Diterima*

Invoice: ${inv.invoice_no}
${inv.milestone}: ${fmtRupiah(inv.amount)}

📊 Sisa Pembayaran: ${fmtRupiah(sisa)}${nextInfo}

Terima kasih,
${companyName}`;

    await sendFonnte(normalizePhone(inv.customer_phone), message);
  }

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function deleteInvoice(invoiceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Get trip_id sebelum delete (untuk revalidate)
  const { data: invMeta } = await supabase
    .from('invoices')
    .select('trip_id')
    .eq('id', invoiceId)
    .maybeSingle();

  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) return { error: error.message };

  revalidateAll(invMeta?.trip_id);
  return { ok: true };
}

// ============================================================
// SAVE COMPANY SETTINGS
// ============================================================
export async function saveCompanySettings(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const payload = {
    id: 1,
    company_name: formData.get('company_name') || 'Traveling Eropa',
    company_address: formData.get('company_address') || null,
    company_phone: formData.get('company_phone') || null,
    company_email: formData.get('company_email') || null,
    company_npwp: formData.get('company_npwp') || null,
    company_logo_url: formData.get('company_logo_url') || null,
    bank_name: formData.get('bank_name') || 'BCA',
    bank_account_no: formData.get('bank_account_no') || null,
    bank_account_name: formData.get('bank_account_name') || null,
    invoice_footer_note: formData.get('invoice_footer_note') || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('company_settings')
    .upsert(payload, { onConflict: 'id' });

  if (error) return { error: error.message };

  revalidatePath('/settings');
  revalidatePath('/invoices');
  return { ok: true };
}

// ============================================================
// ROUND 97: createInvoiceAsPaid — generate invoice yang langsung
// status PAID (untuk milestone yang sudah dibayar, e.g. receipt DP)
// ============================================================
export async function createInvoiceAsPaid(params) {
  const { trip_id, passenger_id, customer_id, milestone, amount, payment_date, description } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!trip_id || !milestone || !amount) {
    return { error: 'trip_id, milestone, amount wajib' };
  }

  // Fetch snapshot data
  const [tripRes, custRes] = await Promise.all([
    supabase.from('trips').select('name, kode_trip').eq('id', trip_id).maybeSingle(),
    customer_id
      ? supabase.from('customers').select('name, phone, email').eq('id', customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const trip = tripRes.data;
  const cust = custRes.data;

  const invoice_no = await generateInvoiceNo(supabase, trip_id);
  const token = genToken();
  const verified_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    invoice_no,
    trip_id,
    passenger_id: passenger_id || null,
    customer_id: customer_id || null,
    milestone,
    amount: Number(amount) || 0,
    status: 'paid', // langsung paid
    paid_at: payment_date || new Date().toISOString(),
    paid_by_check: verified_by,
    description: description || `Receipt ${milestone} — ${trip?.name || trip_id}`,
    public_token: token,
    created_by: verified_by,
    customer_name: cust?.name || null,
    customer_phone: cust?.phone || null,
    customer_email: cust?.email || null,
    trip_name: trip?.name || null,
    trip_kode: trip?.kode_trip || null,
  };

  const { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id, invoice_no, public_token')
    .single();

  if (error) return { error: error.message };

  // Auto-create invoice_payment record sebagai verified
  await supabase.from('invoice_payments').insert({
    invoice_id: data.id,
    amount: Number(amount) || 0,
    payment_date: payment_date || new Date().toISOString().slice(0, 10),
    payment_method: 'verified_manual',
    status: 'verified',
    verified_by,
    verified_at: new Date().toISOString(),
    note_from_customer: 'Receipt — sudah dibayar saat invoice digenerate',
  });

  // Round 99: Sync ke participant_payments → matrix auto-centang
  await syncInvoiceToMatrix(supabase, {
    invoice_no: data.invoice_no,
    passenger_id,
    milestone,
  }, Number(amount) || 0);

  revalidateAll(trip_id);
  return { ok: true, invoice_id: data.id, invoice_no: data.invoice_no, token: data.public_token };
}
