'use server';

// Round 187: WA notifikasi ke peserta — Invoice link + Bukti Payment received
// Path: lib/actions/wa-payment-notif.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';
import { calcPokokPaid } from '@/lib/utils/price-breakdown';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'https://teone.dev';
}

function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

// ============ Kirim Invoice ke WA peserta ============
export async function sendInvoiceWA(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id, price_paid, room_type')
      .eq('id', passengerId)
      .maybeSingle();
    if (!pax) return { error: 'Peserta gak ditemukan' };

    const [{ data: customer }, { data: trip }, { data: invoices }] = await Promise.all([
      supabase.from('customers').select('name, phone, whatsapp').eq('id', pax.customer_id).maybeSingle(),
      supabase.from('trips').select('kode_trip, name, departure').eq('id', pax.trip_id).maybeSingle(),
      supabase.from('invoices').select('id, public_token, amount, paid_at, created_at').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
    ]);

    if (!customer) return { error: 'Customer info gak ditemukan' };
    const phone = customer.whatsapp || customer.phone;
    if (!phone) return { error: `Peserta "${customer.name}" gak punya nomor HP/WA` };

    if (!invoices || invoices.length === 0) {
      return { error: `Peserta "${customer.name}" belum ada invoice — buat invoice dulu` };
    }

    // Ambil invoice terbaru yg belum dibayar (kalau ada), kalau gak ada ambil yg paling baru
    const unpaidInvoice = invoices.find(i => !i.paid_at);
    const targetInvoice = unpaidInvoice || invoices[0];

    const appUrl = getAppUrl().replace(/\/$/, '');
    const invoiceLink = `${appUrl}/invoice/${targetInvoice.public_token}`;

    // Hitung sisa POKOK trip — pembayaran addon (ongkir/visa/optional) TIDAK mengurangi pokok
    const { data: payments } = await supabase
      .from('participant_payments')
      .select('amount, type')
      .eq('passenger_id', pax.id);
    const totalBayar = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const pokokPaid = calcPokokPaid(payments || []);     // hanya DP/P1..P7/Pelunasan
    const addonPaid = totalBayar - pokokPaid;            // ongkir/visa/optional/dll
    const sisa = (pax.price_paid || 0) - pokokPaid;

    const message = [
      `📋 *INVOICE PEMBAYARAN — TEONE*`,
      ``,
      `Hai *${customer.name}*,`,
      `Berikut invoice trip kamu:`,
      ``,
      `🎫 Trip: *${trip?.kode_trip || ''} ${trip?.name || ''}*`.trim(),
      `🏨 Kamar: ${pax.room_type || '-'}`,
      ``,
      `💰 *Tagihan Pokok Trip:*`,
      `   Total Tagihan: ${fmtRp(pax.price_paid || 0)}`,
      `   Dibayar (pokok): ${fmtRp(pokokPaid)}`,
      `   *Sisa Pokok: ${fmtRp(sisa)}*`,
      ...(addonPaid > 0 ? [`   ➕ Pembayaran lain diterima (ongkir/visa/dll): ${fmtRp(addonPaid)}`] : []),
      ``,
      `📄 Lihat invoice lengkap:`,
      `🔗 ${invoiceLink}`,
      ``,
      `Untuk konfirmasi pembayaran, mohon balas pesan ini dengan bukti transfer.`,
      ``,
      `Terima kasih 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].join('\n');

    const result = await sendFonnte(phone, message, { context: 'finance' });
    if (result.error) return { error: result.error };

    revalidatePath(`/finance/payments/${pax.trip_id}`);
    return { ok: true, target: normalizePhone(phone), link: invoiceLink };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ Kirim Bukti Payment Received ke WA peserta ============
export async function sendPaymentReceivedWA(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id, price_paid, room_type')
      .eq('id', passengerId)
      .maybeSingle();
    if (!pax) return { error: 'Peserta gak ditemukan' };

    const [{ data: customer }, { data: trip }, { data: payments }, { data: invoices }] = await Promise.all([
      supabase.from('customers').select('name, phone, whatsapp').eq('id', pax.customer_id).maybeSingle(),
      supabase.from('trips').select('kode_trip, name, departure').eq('id', pax.trip_id).maybeSingle(),
      supabase.from('participant_payments').select('amount, type, paid_at, created_at').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('public_token, paid_at, created_at').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
    ]);

    if (!customer) return { error: 'Customer info gak ditemukan' };
    const phone = customer.whatsapp || customer.phone;
    if (!phone) return { error: `Peserta "${customer.name}" gak punya nomor HP/WA` };

    if (!payments || payments.length === 0) {
      return { error: `Peserta "${customer.name}" belum ada catatan pembayaran` };
    }

    const totalBayar = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const pokokPaid = calcPokokPaid(payments);          // hanya pokok (DP/P1../Pelunasan)
    const addonPaid = totalBayar - pokokPaid;           // ongkir/visa/optional/dll
    const sisa = (pax.price_paid || 0) - pokokPaid;     // sisa POKOK saja
    const lastPayment = payments[0];
    const isLunas = sisa <= 0;

    // Breakdown semua pembayaran
    const paymentBreakdown = payments.map((p, idx) => {
      const date = p.paid_at || p.created_at;
      const dateStr = date ? new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
      return `   ${idx + 1}. ${p.type || 'Bayar'} — ${fmtRp(p.amount)} (${dateStr})`;
    }).join('\n');

    const appUrl = getAppUrl().replace(/\/$/, '');
    const invoiceLink = invoices && invoices[0]
      ? `${appUrl}/invoice/${invoices[0].public_token}`
      : null;

    const message = [
      isLunas ? `✅ *PEMBAYARAN LUNAS — TEONE*` : `✅ *PEMBAYARAN DITERIMA — TEONE*`,
      ``,
      `Hai *${customer.name}*,`,
      isLunas
        ? `Pembayaran trip kamu sudah *LUNAS* 🎉`
        : `Pembayaran terbaru kamu sudah kami terima 🙏`,
      ``,
      `🎫 Trip: *${trip?.kode_trip || ''} ${trip?.name || ''}*`.trim(),
      `🏨 Kamar: ${pax.room_type || '-'}`,
      ``,
      `💰 *Pembayaran Terakhir:*`,
      `   ${lastPayment.type || 'Bayar'} — *${fmtRp(lastPayment.amount)}*`,
      ``,
      `📊 *Riwayat Pembayaran:*`,
      paymentBreakdown,
      ``,
      `💵 *Ringkasan Pokok Trip:*`,
      `   Total Tagihan: ${fmtRp(pax.price_paid || 0)}`,
      `   Dibayar (pokok): ${fmtRp(pokokPaid)}`,
      isLunas ? `   *Status Pokok: LUNAS ✅*` : `   *Sisa Pokok: ${fmtRp(sisa)}*`,
      ...(addonPaid > 0 ? [`   ➕ Pembayaran lain (ongkir/visa/dll): ${fmtRp(addonPaid)} — tidak mengurangi sisa pokok`] : []),
      ``,
      invoiceLink ? `📄 Lihat invoice:\n🔗 ${invoiceLink}\n` : '',
      `Terima kasih atas pembayarannya 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].filter(Boolean).join('\n');

    const result = await sendFonnte(phone, message, { context: 'finance' });
    if (result.error) return { error: result.error };

    revalidatePath(`/finance/payments/${pax.trip_id}`);
    return { ok: true, target: normalizePhone(phone), lunas: isLunas };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ Bulk: Kirim invoice ke semua peserta yg belum lunas ============
export async function bulkSendInvoiceWA(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    const { data: paxList } = await supabase
      .from('trip_passengers')
      .select('id, price_paid')
      .eq('trip_id', tripId);

    if (!paxList || paxList.length === 0) {
      return { ok: true, sent: 0, message: 'Tidak ada peserta' };
    }

    // Filter peserta yg masih ada sisa (belum lunas)
    let sent = 0, failed = 0, skipped = 0, errors = [];
    for (const p of paxList) {
      try {
        const { data: pays } = await supabase
          .from('participant_payments').select('amount, type').eq('passenger_id', p.id);
        const pokokPaid = calcPokokPaid(pays || []);
        const sisa = (p.price_paid || 0) - pokokPaid;   // sisa POKOK saja
        if (sisa <= 0) { skipped++; continue; }

        const r = await sendInvoiceWA(p.id);
        if (r.error) { failed++; errors.push(`#${p.id}: ${r.error}`); }
        else sent++;
      } catch (e) {
        failed++;
        errors.push(`#${p.id}: ${e?.message || 'unknown'}`);
      }
    }

    revalidatePath(`/finance/payments/${tripId}`);
    return {
      ok: true, sent, failed, skipped, total: paxList.length, errors,
      message: `📨 ${sent} invoice terkirim · ${skipped} sudah lunas (skip)${failed > 0 ? ` · ${failed} gagal` : ''}`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}
