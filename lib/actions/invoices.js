'use server';

// Round 101: Family Invoice dengan passenger_amounts (harga per-pax beda)
// - createInvoice/createInvoiceAsPaid terima parameter passenger_amounts JSONB
// - syncInvoiceToMatrix pakai amount per pax dari passenger_amounts (fallback split rata)
// - WA message tampilkan breakdown per pax kalau ada

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

// Round 101: Sync per-pax amount kalau ada, kalau ga ada fallback split rata
async function syncInvoiceToMatrix(supabase, inv, paidAmount) {
  if (!inv?.milestone) return;

  const totalAmount = Number(paidAmount || inv.amount) || 0;
  if (totalAmount <= 0) return;

  let pesertaIds = [];
  if (inv.is_family_invoice && Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length > 0) {
    pesertaIds = inv.covers_passenger_ids;
  } else if (inv.passenger_id) {
    pesertaIds = [inv.passenger_id];
  } else {
    return;
  }

  // Round 101: cek passenger_amounts (per-pax custom)
  const perPaxMap = (inv.passenger_amounts && typeof inv.passenger_amounts === 'object') ? inv.passenger_amounts : {};
  const hasCustomPerPax = Object.keys(perPaxMap).length > 0;

  const noteText = inv.is_family_invoice
    ? `Synced dari Family Invoice ${inv.invoice_no} (cover ${pesertaIds.length} peserta, total Rp ${totalAmount.toLocaleString('id-ID')})`
    : `Synced dari Invoice ${inv.invoice_no}`;

  for (const pid of pesertaIds) {
    // Per-pax amount: dari passenger_amounts kalau ada, kalau ga split rata
    let amountPerPax;
    if (hasCustomPerPax) {
      const v = perPaxMap[String(pid)] ?? perPaxMap[pid];
      amountPerPax = Number(v) || 0;
    } else {
      amountPerPax = pesertaIds.length > 1 ? Math.round(totalAmount / pesertaIds.length) : totalAmount;
    }

    if (amountPerPax <= 0) continue;

    const { data: existing } = await supabase
      .from('participant_payments')
      .select('id, amount')
      .eq('passenger_id', pid)
      .eq('type', inv.milestone)
      .maybeSingle();

    if (existing) {
      if (Number(existing.amount) !== amountPerPax) {
        await supabase
          .from('participant_payments')
          .update({ amount: amountPerPax, notes: noteText })
          .eq('id', existing.id);
      }
    } else {
      await supabase.from('participant_payments').insert({
        passenger_id: pid,
        type: inv.milestone,
        amount: amountPerPax,
        paid_at: new Date().toISOString(),
        notes: noteText,
      });
    }
  }
}

async function generateInvoiceNo(supabase, tripId) {
  const { data: trip } = await supabase
    .from('trips')
    .select('kode_trip, id')
    .eq('id', tripId)
    .maybeSingle();

  const kode = (trip?.kode_trip || tripId).replace(/[^A-Z0-9]/gi, '').toUpperCase();

  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId);

  const seq = String((count || 0) + 1).padStart(3, '0');
  return `TEONE-${kode}-${seq}`;
}

// ============================================================
// CREATE INVOICE
// ============================================================
export async function createInvoice(params) {
  const {
    trip_id, passenger_id, customer_id, milestone, amount, due_date, description,
    family_group_id = null,
    covers_passenger_ids = null,
    is_family_invoice = false,
    passenger_amounts = null,   // Round 101: { passenger_id: amount }
  } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!trip_id || !milestone || !amount) {
    return { error: 'trip_id, milestone, amount wajib' };
  }

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
    family_group_id: family_group_id || null,
    covers_passenger_ids: is_family_invoice && Array.isArray(covers_passenger_ids) ? covers_passenger_ids : [],
    is_family_invoice: !!is_family_invoice,
    passenger_amounts: passenger_amounts && typeof passenger_amounts === 'object' ? passenger_amounts : {},
  };

  let { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id, invoice_no, public_token')
    .single();

  // Defensive: kalau kolom belum exist
  if (error && /family_group_id|covers_passenger_ids|is_family_invoice|passenger_amounts/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.family_group_id;
    delete stripped.covers_passenger_ids;
    delete stripped.is_family_invoice;
    delete stripped.passenger_amounts;
    const retry = await supabase.from('invoices').insert(stripped).select('id, invoice_no, public_token').single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidateAll(trip_id);
  return { ok: true, invoice_id: data.id, invoice_no: data.invoice_no, token: data.public_token };
}

// ============================================================
// HELPER: Build WA message branch by status + breakdown per-pax
// ============================================================
async function buildWAMessage(supabase, inv) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://teone.dev';
  const invoiceLink = `${baseUrl}/invoice/${inv.public_token}`;
  const { data: company } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle();
  const companyName = company?.company_name || 'Traveling Eropa';
  const familyTag = inv.is_family_invoice && Array.isArray(inv.covers_passenger_ids)
    ? ` (${inv.covers_passenger_ids.length} pax)` : '';

  // Round 101: Breakdown per pax kalau ada passenger_amounts
  let breakdownText = '';
  if (inv.is_family_invoice && inv.passenger_amounts && typeof inv.passenger_amounts === 'object' && Object.keys(inv.passenger_amounts).length > 0) {
    const pids = Object.keys(inv.passenger_amounts);
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, customer_id')
      .in('id', pids.map(Number));
    const customerIds = (pax || []).map((p) => p.customer_id).filter(Boolean);
    const { data: custs } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds);
    const custMap = Object.fromEntries((custs || []).map((c) => [c.id, c.name]));
    const paxMap = Object.fromEntries((pax || []).map((p) => [p.id, custMap[p.customer_id] || `#${p.id}`]));

    const lines = pids.map((pid) => {
      const name = paxMap[Number(pid)] || `#${pid}`;
      const amt = Number(inv.passenger_amounts[pid]) || 0;
      return `• ${name}: ${fmtRupiah(amt)}`;
    });
    if (lines.length > 0) {
      breakdownText = '\n\n📋 Breakdown per peserta:\n' + lines.join('\n');
    }
  }

  if (inv.status === 'paid') {
    let nextInfo = '';
    if (inv.trip_id && inv.passenger_id) {
      const { data: arr } = await supabase
        .from('invoices')
        .select('amount, status, milestone, due_date')
        .eq('trip_id', inv.trip_id)
        .eq('passenger_id', inv.passenger_id);
      const allInvoices = arr || [];
      const totalAll = allInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
      const totalPaid = allInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0);
      const sisa = Math.max(totalAll - totalPaid, 0);
      const nextInv = allInvoices.find((i) => i.status !== 'paid');

      if (sisa === 0 && totalAll > 0) {
        nextInfo = `\n\n🎉 *Pembayaran trip ini LUNAS!*`;
      } else if (nextInv && sisa > 0) {
        nextInfo = `\n\n📊 Total Tagihan: ${fmtRupiah(totalAll)}\nSudah Dibayar: *${fmtRupiah(totalPaid)}*\nSisa: *${fmtRupiah(sisa)}*\n\n📅 Payment Selanjutnya:\n${nextInv.milestone}: ${fmtRupiah(nextInv.amount)}${nextInv.due_date ? `\nDue: ${nextInv.due_date}` : ''}`;
      }
    }

    return `Halo ${inv.customer_name || 'Bapak/Ibu'},

✅ *Pembayaran Sudah Diterima*

Trip: ${inv.trip_name}${inv.trip_kode ? ` (${inv.trip_kode})` : ''}
Receipt: *${inv.invoice_no}*
${inv.milestone}${familyTag}: *${fmtRupiah(inv.amount)}*
Tanggal: ${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}${breakdownText}

Bukti pembayaran (receipt) bisa dilihat di:
${invoiceLink}${nextInfo}

Terima kasih,
${companyName}`;
  }

  return `Halo ${inv.customer_name || 'Bapak/Ibu'},

📄 *Invoice ${inv.invoice_no}*

Trip: ${inv.trip_name}${inv.trip_kode ? ` (${inv.trip_kode})` : ''}
Tagihan: *${inv.milestone}*${familyTag}
Jumlah: *${fmtRupiah(inv.amount)}*${inv.due_date ? `\nDue Date: ${inv.due_date}` : ''}${breakdownText}

Detail invoice & cara pembayaran:
${invoiceLink}

Setelah transfer, mohon upload bukti di link di atas atau balas pesan ini.

Terima kasih,
${companyName}`;
}

// ============================================================
// SEND INVOICE/RECEIPT via WA
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

  const message = await buildWAMessage(supabase, inv);

  const phone = normalizePhone(inv.customer_phone);
  const result = await sendFonnte(phone, message);
  if (result?.error) return { error: result.error };

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

export async function uploadPaymentProof(token, formData) {
  const supabase = createClient();

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

export async function approveInvoicePayment(paymentId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const verified_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: pay } = await supabase
    .from('invoice_payments')
    .select('*, invoices(*)')
    .eq('id', paymentId)
    .maybeSingle();

  if (!pay) return { error: 'Payment record tidak ditemukan' };
  const inv = pay.invoices;
  if (!inv) return { error: 'Invoice tidak ditemukan' };

  await supabase
    .from('invoice_payments')
    .update({
      status: 'verified',
      verified_by,
      verified_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by_check: verified_by,
    })
    .eq('id', inv.id);

  await syncInvoiceToMatrix(supabase, inv, pay.amount);

  if (inv.customer_phone) {
    const updatedInv = { ...inv, status: 'paid', paid_at: new Date().toISOString() };
    const message = await buildWAMessage(supabase, updatedInv);
    await sendFonnte(normalizePhone(inv.customer_phone), message);
  }

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function rejectInvoicePayment(paymentId, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

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

  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_by_check: verified_by,
    })
    .eq('id', invoiceId);

  await syncInvoiceToMatrix(supabase, inv, inv.amount);

  if (inv.customer_phone) {
    const updatedInv = { ...inv, status: 'paid', paid_at: new Date().toISOString() };
    const message = await buildWAMessage(supabase, updatedInv);
    await sendFonnte(normalizePhone(inv.customer_phone), message);
  }

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function deleteInvoice(invoiceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

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
// createInvoiceAsPaid — Round 101: support passenger_amounts
// ============================================================
export async function createInvoiceAsPaid(params) {
  const {
    trip_id, passenger_id, customer_id, milestone, amount, payment_date, description,
    family_group_id = null,
    covers_passenger_ids = null,
    is_family_invoice = false,
    passenger_amounts = null,   // Round 101
  } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!trip_id || !milestone || !amount) {
    return { error: 'trip_id, milestone, amount wajib' };
  }

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
    status: 'paid',
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
    family_group_id: family_group_id || null,
    covers_passenger_ids: is_family_invoice && Array.isArray(covers_passenger_ids) ? covers_passenger_ids : [],
    is_family_invoice: !!is_family_invoice,
    passenger_amounts: passenger_amounts && typeof passenger_amounts === 'object' ? passenger_amounts : {},
  };

  let { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id, invoice_no, public_token')
    .single();

  if (error && /family_group_id|covers_passenger_ids|is_family_invoice|passenger_amounts/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.family_group_id;
    delete stripped.covers_passenger_ids;
    delete stripped.is_family_invoice;
    delete stripped.passenger_amounts;
    const retry = await supabase.from('invoices').insert(stripped).select('id, invoice_no, public_token').single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return { error: error.message };

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

  // Round 101: pass passenger_amounts ke sync
  await syncInvoiceToMatrix(supabase, {
    invoice_no: data.invoice_no,
    passenger_id,
    milestone,
    is_family_invoice: !!is_family_invoice,
    covers_passenger_ids: Array.isArray(covers_passenger_ids) ? covers_passenger_ids : [],
    passenger_amounts: passenger_amounts && typeof passenger_amounts === 'object' ? passenger_amounts : {},
  }, Number(amount) || 0);

  revalidateAll(trip_id);
  return { ok: true, invoice_id: data.id, invoice_no: data.invoice_no, token: data.public_token };
}
