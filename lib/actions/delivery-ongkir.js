// lib/actions/delivery-ongkir.js
// R209 + R210 + R212: Ongkir + Cash Out + Family Invoice (digabung ke kepala family)

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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

function genToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

async function sendFonnte(phone, message) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) return { error: 'FONNTE_TOKEN belum di-set' };
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/x-www-form-urlencoded' },
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

async function insertCashOut(supabase, tripId, passengerId, customerName, courier, resi, amount, createdBy, familyMemberCount = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const familyTag = familyMemberCount > 1 ? ` [Family ${familyMemberCount} pax]` : '';
  const description = `Ongkir pengiriman${familyTag} — ${customerName} — Kurir: ${courier || '-'}, Resi: ${resi || '-'}`;

  try {
    const payload1 = {
      date: today,
      type: 'cash_out',
      category: 'Ongkir Pengiriman',
      description,
      amount,
      trip_id: tripId,
      created_by: createdBy,
    };
    const { error } = await supabase.from('accounting_entries').insert(payload1);
    if (!error) return { ok: true, table: 'accounting_entries', payload: payload1 };

    if (/trip_id/.test(error.message)) {
      delete payload1.trip_id;
      const { error: e2 } = await supabase.from('accounting_entries').insert(payload1);
      if (!e2) return { ok: true, table: 'accounting_entries (no trip_id)', payload: payload1 };
    }

    if (/type/.test(error.message)) {
      const payload2 = {
        date: today,
        direction: 'out',
        category: 'Ongkir Pengiriman',
        description,
        amount,
        created_by: createdBy,
      };
      const { error: e3 } = await supabase.from('accounting_entries').insert(payload2);
      if (!e3) return { ok: true, table: 'accounting_entries (direction)', payload: payload2 };
    }

    return { ok: false, reason: error.message };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

/**
 * R212: Bikin invoice ongkir + Cash Out + WA
 * Sekarang HANDLE FAMILY — kalau passenger adalah kepala family, invoice cover semua family member
 */
export async function createAndSendOngkirInvoice(passengerId, ongkirAmount, courier, resi) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!passengerId) return { error: 'Passenger ID kosong' };

  const amount = Number(ongkirAmount) || 0;
  if (amount <= 0) {
    return { ok: true, skipped: true, message: 'Ongkir = 0, gak bikin invoice' };
  }

  const createdBy = user.user_metadata?.full_name || user.email || 'unknown';

  // 1. Ambil data peserta
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id, customer_id, family_group_id, is_family_head, delivery_phone, delivery_recipient')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, whatsapp, email')
    .eq('id', pax.customer_id)
    .maybeSingle();

  const { data: trip } = await supabase
    .from('trips')
    .select('id, kode_trip, name')
    .eq('id', pax.trip_id)
    .maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };

  // R212: Detect family — kalau ada family_group_id, ambil semua member
  let familyMembers = [];
  let familyGroup = null;
  let isFamilyInvoice = false;

  if (pax.family_group_id) {
    const { data: fg } = await supabase
      .from('family_groups')
      .select('id, name, head_passenger_id, head_customer_id')
      .eq('id', pax.family_group_id)
      .maybeSingle();
    if (fg) {
      familyGroup = fg;
      const { data: members } = await supabase
        .from('trip_passengers')
        .select('id, customer_id')
        .eq('family_group_id', fg.id)
        .eq('trip_id', trip.id);
      familyMembers = members || [];
      isFamilyInvoice = familyMembers.length > 1;
    }
  }

  const familyMemberIds = familyMembers.map((m) => m.id);
  const familyMemberCount = familyMembers.length || 1;

  // 2. Save ongkir amount ke kepala (atau peserta individu)
  await supabase
    .from('trip_passengers')
    .update({ delivery_ongkir_amount: amount })
    .eq('id', passengerId);

  // 3. Insert Cash Out
  const customerName = customer?.name || pax.delivery_recipient || `Pax #${passengerId}`;
  const cashOutResult = await insertCashOut(
    supabase, trip.id, passengerId, customerName, courier, resi, amount, createdBy, familyMemberCount
  );

  // 4. Generate invoice — kalau family, pakai field family_invoice
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', trip.id);
  const seq = String((count || 0) + 1).padStart(3, '0');
  const kode = (trip.kode_trip || trip.id).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const invoice_no = `TEONE-${kode}-${seq}`;
  const token = genToken();

  const payload = {
    invoice_no,
    trip_id: trip.id,
    passenger_id: passengerId, // kepala family kalau family
    customer_id: pax.customer_id || null,
    milestone: 'Ongkir Pengiriman',
    amount,
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_via: 'whatsapp',
    description: isFamilyInvoice
      ? `Ongkir family ${familyGroup?.name || ''} (${familyMemberCount} pax) — ${courier || 'kurir'} ${resi || ''}`
      : `Ongkir pengiriman — ${courier || 'kurir'} ${resi || ''}`,
    public_token: token,
    created_by: createdBy,
    customer_name: customer?.name || null,
    customer_phone: customer?.phone || customer?.whatsapp || null,
    customer_email: customer?.email || null,
    trip_name: trip.name || null,
    trip_kode: trip.kode_trip || null,
    family_group_id: isFamilyInvoice ? familyGroup.id : null,
    is_family_invoice: isFamilyInvoice,
    covers_passenger_ids: isFamilyInvoice ? familyMemberIds : [],
  };

  let { data: invData, error: invErr } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id, invoice_no, public_token')
    .single();

  // Defensive: kalau family fields gak ada, retry tanpa
  if (invErr && /family_group_id|is_family_invoice|covers_passenger_ids/.test(invErr.message)) {
    const stripped = { ...payload };
    delete stripped.family_group_id;
    delete stripped.is_family_invoice;
    delete stripped.covers_passenger_ids;
    const retry = await supabase.from('invoices').insert(stripped).select('id, invoice_no, public_token').single();
    invData = retry.data;
    invErr = retry.error;
  }

  if (invErr) return { error: 'Insert invoice failed: ' + invErr.message, cash_out: cashOutResult };

  // 5. Send WA ke kepala family (atau peserta individu)
  const phone = pax.delivery_phone || customer?.phone || customer?.whatsapp;
  if (!phone) {
    return {
      ok: true,
      invoice_id: invData.id,
      invoice_no: invData.invoice_no,
      cash_out: cashOutResult.ok,
      cash_out_error: cashOutResult.reason || null,
      wa_sent: false,
      wa_error: 'No phone',
      family_invoice: isFamilyInvoice,
      family_count: familyMemberCount,
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://teone.dev';
  const invoiceLink = `${baseUrl}/invoice/${token}`;

  const { data: company } = await supabase
    .from('company_settings').select('*').eq('id', 1).maybeSingle();
  const companyName = company?.company_name || 'Traveling Eropa';

  const recipient = pax.delivery_recipient || customer?.name || 'Bapak/Ibu';
  const familyTag = isFamilyInvoice ? ` (${familyMemberCount} pax)` : '';

  const message = `Halo ${recipient},

📦 *Perlengkapan Trip Sudah Dikirim*${isFamilyInvoice ? '\n👨‍👩‍👧 Family: ' + (familyGroup?.name || 'Keluarga') + ` (${familyMemberCount} pax)` : ''}

Trip: ${trip.name}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}
🚚 Kurir: *${courier || '—'}*
📋 No. Resi: *${resi || '—'}*

━━━━━━━━━━━━━━━━━━━━━━
💰 *TAGIHAN ONGKIR${familyTag.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━

Invoice: *${invData.invoice_no}*
Jumlah: *${fmtRupiah(amount)}*${isFamilyInvoice ? `\nMencover: ${familyMemberCount} pax dalam family` : ''}

📄 Detail invoice & upload bukti transfer:
${invoiceLink}

Setelah transfer, mohon upload bukti di link di atas.
Kami akan verifikasi & konfirmasi via WA.

Terima kasih,
${companyName}`;

  const waResult = await sendFonnte(normalizePhone(phone), message);

  revalidatePath('/invoices');
  revalidatePath('/finance/payments');
  revalidatePath('/accounting');
  if (trip.id) revalidatePath(`/finance/payments/${trip.id}`);

  return {
    ok: true,
    invoice_id: invData.id,
    invoice_no: invData.invoice_no,
    cash_out: cashOutResult.ok,
    cash_out_error: cashOutResult.reason || null,
    wa_sent: !!waResult?.ok,
    wa_error: waResult?.error || null,
    phone_target: normalizePhone(phone),
    family_invoice: isFamilyInvoice,
    family_count: familyMemberCount,
  };
}
