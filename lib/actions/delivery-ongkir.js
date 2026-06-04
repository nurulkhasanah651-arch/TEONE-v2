// lib/actions/delivery-ongkir.js
// R209: Action untuk bikin invoice ongkir + kirim WA bareng dengan resi

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

/**
 * Bikin invoice ongkir + kirim WA dengan resi + link bayar
 *
 * Dipanggil dari DeliverySection setelah Mark Dikirim (existing markDeliverySent).
 *
 * Flow:
 * 1. Save delivery_ongkir_amount ke trip_passengers
 * 2. Bikin invoice (milestone="Ongkir Pengiriman")
 * 3. Send WA dengan: resi info + link bayar invoice
 */
export async function createAndSendOngkirInvoice(passengerId, ongkirAmount, courier, resi) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!passengerId) return { error: 'Passenger ID kosong' };

  const amount = Number(ongkirAmount) || 0;
  if (amount <= 0) {
    // Ongkir 0 = peserta gak perlu bayar, gak bikin invoice
    return { ok: true, skipped: true, message: 'Ongkir = 0, gak bikin invoice' };
  }

  // 1. Ambil data peserta + customer + trip
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id, customer_id, delivery_phone, delivery_recipient, delivery_street, delivery_kota')
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

  // 2. Save ongkir amount
  await supabase
    .from('trip_passengers')
    .update({ delivery_ongkir_amount: amount })
    .eq('id', passengerId);

  // 3. Generate invoice
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', trip.id);
  const seq = String((count || 0) + 1).padStart(3, '0');
  const kode = (trip.kode_trip || trip.id).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const invoice_no = `TEONE-${kode}-${seq}`;
  const token = genToken();
  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    invoice_no,
    trip_id: trip.id,
    passenger_id: passengerId,
    customer_id: pax.customer_id || null,
    milestone: 'Ongkir Pengiriman',
    amount,
    status: 'sent', // langsung sent (sudah kirim WA)
    sent_at: new Date().toISOString(),
    sent_via: 'whatsapp',
    description: `Ongkir pengiriman perlengkapan — ${courier || 'kurir'} ${resi || ''}`,
    public_token: token,
    created_by,
    customer_name: customer?.name || null,
    customer_phone: customer?.phone || customer?.whatsapp || null,
    customer_email: customer?.email || null,
    trip_name: trip.name || null,
    trip_kode: trip.kode_trip || null,
  };

  let { data: invData, error: invErr } = await supabase
    .from('invoices')
    .insert(payload)
    .select('id, invoice_no, public_token')
    .single();
  if (invErr) return { error: 'Insert invoice failed: ' + invErr.message };

  // 4. Send WA: resi + link bayar
  const phone = pax.delivery_phone || customer?.phone || customer?.whatsapp;
  if (!phone) {
    return {
      ok: true,
      invoice_id: invData.id,
      invoice_no: invData.invoice_no,
      wa_sent: false,
      wa_error: 'No phone'
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://teone.dev';
  const invoiceLink = `${baseUrl}/invoice/${token}`;

  const { data: company } = await supabase
    .from('company_settings').select('*').eq('id', 1).maybeSingle();
  const companyName = company?.company_name || 'Traveling Eropa';

  const recipient = pax.delivery_recipient || customer?.name || 'Bapak/Ibu';
  const message = `Halo ${recipient},

📦 *Perlengkapan Trip Sudah Dikirim*

Trip: ${trip.name}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}
🚚 Kurir: *${courier || '—'}*
📋 No. Resi: *${resi || '—'}*

━━━━━━━━━━━━━━━━━━━━━━
💰 *TAGIHAN ONGKIR*
━━━━━━━━━━━━━━━━━━━━━━

Invoice: *${invData.invoice_no}*
Jumlah: *${fmtRupiah(amount)}*

📄 Detail invoice & upload bukti transfer:
${invoiceLink}

Setelah transfer, mohon upload bukti di link di atas.
Kami akan verifikasi & konfirmasi via WA.

Terima kasih,
${companyName}`;

  const waResult = await sendFonnte(normalizePhone(phone), message);

  revalidatePath('/invoices');
  revalidatePath('/finance/payments');
  if (trip.id) revalidatePath(`/finance/payments/${trip.id}`);

  return {
    ok: true,
    invoice_id: invData.id,
    invoice_no: invData.invoice_no,
    wa_sent: !!waResult?.ok,
    wa_error: waResult?.error || null,
    phone_target: normalizePhone(phone),
  };
}
