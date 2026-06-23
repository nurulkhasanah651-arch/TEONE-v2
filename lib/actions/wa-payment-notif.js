'use server';

// Round 187: WA notifikasi ke peserta — Invoice link + Bukti Payment received
// Path: lib/actions/wa-payment-notif.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';
import { getPicFonnteTokenById, getPicNameForTrip } from '@/lib/auth/pic-scope';
import { calcPokokPaid, roomTypeToKey } from '@/lib/utils/price-breakdown';
import { getInvoiceBilling } from '@/lib/shop/invoice-bill';

function financeIntro(picName) {
  let code = 'teone';
  try { code = currentBrandCode(); } catch {}
  const brand = code === 'khasanah' ? 'Khasanah Travel' : 'Traveling Eropa';
  if (code === 'khasanah' && picName) return `Perkenalkan, saya ${picName} dari ${brand} \ud83d\ude4f`;
  const nm = (code === 'khasanah' ? process.env.WA_FINANCE_NAME_KHASANAH : process.env.WA_FINANCE_NAME) || 'Putri';
  return `Perkenalkan, saya ${nm} dari tim Finance ${brand} \ud83d\ude4f`;
}

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAppUrl() {
  let code = 'teone'; try { code = currentBrandCode(); } catch {}
  return customerSiteUrlFor(code);
}

function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function roomKeyOf(rt) { return roomTypeToKey(rt) || String(rt || '').toLowerCase().replace(/[^a-z_]/g, ''); }

// SUMBER TUNGGAL angka invoice WA — rumus sisa = cicilan pokok − diskon − dibayar pokok.
// Pembayaran addon (visa/ongkir/optional) TIDAK mengurangi sisa pokok.
function invoiceNumbers(pax, breakdown, payments) {
  const bd = (breakdown && typeof breakdown === 'object') ? breakdown : {};
  const rk = roomKeyOf(pax.room_type);
  const roomPrice = Number(bd[rk] || bd[pax.room_type] || 0);
  const tips = Number(bd.tips || bd.Tips || 0);
  const cityTax = Number(bd.city_tax || bd.cityTax || bd.CityTax || 0);
  const flight = Number(bd.domestic_flight || 0);
  const baggage = Number(bd.domestic_baggage || 0);
  const baseFee = Number(bd.harga_jual_base || 0);
  const discount = Number(pax.discount_amount || 0);
  let pokokGross = Number(pax.price_paid || 0);
  if (pokokGross <= 0) pokokGross = roomPrice + tips + cityTax + flight + baggage + baseFee; // fallback kalau Harga Bayar belum diisi
  const pokokNet = Math.max(pokokGross - discount, 0);
  const totalBayar = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const pokokPaid = calcPokokPaid(payments || []);
  const addonPaid = Math.max(totalBayar - pokokPaid, 0);
  const sisa = Math.max(pokokNet - pokokPaid, 0);
  return { roomPrice, tips, cityTax, flight, baggage, baseFee, discount, pokokGross, pokokNet, pokokPaid, addonPaid, sisa, totalBayar };
}
function detailPaketLines(n) {
  const L = [];
  // Paket = pokok (harga jual) - komponen lain, supaya baris menjumlah ke total
  const paket = Math.max((Number(n.pokokGross)||0) - (Number(n.tips)||0) - (Number(n.cityTax)||0) - (Number(n.flight)||0) - (Number(n.baggage)||0) - (Number(n.baseFee)||0), 0);
  if (paket > 0) L.push(`   • Paket kamar: ${fmtRp(paket)}`);
  if (n.baseFee > 0) L.push(`   • Harga Dasar: ${fmtRp(n.baseFee)}`);
  if (n.flight > 0) L.push(`   • Tiket Pesawat Domestik: ${fmtRp(n.flight)}`);
  if (n.baggage > 0) L.push(`   • Bagasi Domestik: ${fmtRp(n.baggage)}`);
  if (n.tips > 0) L.push(`   • Tips: ${fmtRp(n.tips)}`);
  if (n.cityTax > 0) L.push(`   • City Tax: ${fmtRp(n.cityTax)}`);
  return L;
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
      .select('id, trip_id, customer_id, price_paid, room_type, discount_amount')
      .eq('id', passengerId)
      .maybeSingle();
    if (!pax) return { error: 'Peserta gak ditemukan' };

    const [{ data: customer }, { data: trip }, { data: invoices }] = await Promise.all([
      supabase.from('customers').select('name, phone, whatsapp').eq('id', pax.customer_id).maybeSingle(),
      supabase.from('trips').select('kode_trip, name, departure, price_breakdown').eq('id', pax.trip_id).maybeSingle(),
      supabase.from('invoices').select('*').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
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

    const { data: payments } = await supabase
      .from('participant_payments')
      .select('amount, type')
      .eq('passenger_id', pax.id);
    let fn = invoiceNumbers(pax, trip?.price_breakdown, payments);
    if (targetInvoice?.is_family_invoice) {
      try {
        const bill = await getInvoiceBilling(supabase, targetInvoice);
        const sum = (k) => bill.members.reduce((t, m) => t + (m[k] || 0), 0);
        fn = {
          roomPrice: sum('roomPrice'), tips: sum('tips'), cityTax: sum('cityTax'),
          flight: sum('flight'), baggage: sum('baggage'), baseFee: sum('baseFee'),
          pokokGross: bill.expectedTotal + bill.discount, pokokNet: bill.expectedTotal, discount: bill.discount,
          pokokPaid: bill.pokokPaid, addonPaid: bill.addonPaid, sisa: bill.sisa, count: bill.count,
        };
      } catch {}
    }
    const n = fn;
    const famNote = (fn.count && fn.count > 1) ? ` (untuk ${fn.count} peserta keluarga)` : '';

    const message = [
      `📋 *INVOICE PEMBAYARAN — TEONE*`,
      ``,
      `Hai *${customer.name}*,`,
      financeIntro(await getPicNameForTrip(supabase, pax.trip_id)),
      `Berikut invoice trip kamu:`,
      ``,
      `🎫 Trip: *${trip?.kode_trip || ''} ${trip?.name || ''}*`.trim(),
      `🏨 Kamar: ${pax.room_type || '-'}`,
      ``,
      `💼 *Detail Paket${famNote}:*`,
      ...detailPaketLines(n),
      `   Harga Paket: ${fmtRp(n.pokokGross)}`,
      ...(n.discount > 0 ? [`   Diskon: -${fmtRp(n.discount)}`] : []),
      `   *Total Tagihan: ${fmtRp(n.pokokNet)}*`,
      ``,
      `💰 *Status Pembayaran:*`,
      `   ✅ Sudah Dibayar: ${fmtRp(n.pokokPaid)}`,
      `   *Sisa Pembayaran: ${fmtRp(n.sisa)}*`,
      ...(n.addonPaid > 0 ? [`   ➕ Pembayaran lain diterima (visa/ongkir/optional): ${fmtRp(n.addonPaid)}`, `      (di luar cicilan pokok — tidak mengurangi sisa)`] : []),
      ``,
      `💳 *Bayar ONLINE* (kartu / VA / e-wallet / QRIS) atau lihat invoice & upload bukti transfer:`,
      `🔗 ${invoiceLink}`,
      ``,
      `Status pembayaran online otomatis ter-update. Atau konfirmasi manual dengan membalas pesan ini + bukti transfer.`,
      ``,
      `Terima kasih 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].join('\n');

    const _picTok = await getPicFonnteTokenById(supabase, pax.trip_id);
    const result = await sendFonnte(phone, message, { context: 'finance', token: _picTok });
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
      .select('id, trip_id, customer_id, price_paid, room_type, discount_amount')
      .eq('id', passengerId)
      .maybeSingle();
    if (!pax) return { error: 'Peserta gak ditemukan' };

    const [{ data: customer }, { data: trip }, { data: payments }, { data: invoices }] = await Promise.all([
      supabase.from('customers').select('name, phone, whatsapp').eq('id', pax.customer_id).maybeSingle(),
      supabase.from('trips').select('kode_trip, name, departure, price_breakdown').eq('id', pax.trip_id).maybeSingle(),
      supabase.from('participant_payments').select('amount, type, paid_at, created_at').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('public_token, paid_at, created_at').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
    ]);

    if (!customer) return { error: 'Customer info gak ditemukan' };
    const phone = customer.whatsapp || customer.phone;
    if (!phone) return { error: `Peserta "${customer.name}" gak punya nomor HP/WA` };

    if (!payments || payments.length === 0) {
      return { error: `Peserta "${customer.name}" belum ada catatan pembayaran` };
    }

    const n = invoiceNumbers(pax, trip?.price_breakdown, payments);
    const lastPayment = payments[0];
    const isLunas = n.sisa <= 0;

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
      financeIntro(await getPicNameForTrip(supabase, pax.trip_id)),
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
      `💵 *Ringkasan Tagihan:*`,
      ...detailPaketLines(n),
      `   Harga Paket: ${fmtRp(n.pokokGross)}`,
      ...(n.discount > 0 ? [`   Diskon: -${fmtRp(n.discount)}`] : []),
      `   Total Tagihan: ${fmtRp(n.pokokNet)}`,
      `   ✅ Sudah Dibayar: ${fmtRp(n.pokokPaid)}`,
      isLunas ? `   *Status: LUNAS ✅*` : `   *Sisa Pembayaran: ${fmtRp(n.sisa)}*`,
      ...(n.addonPaid > 0 ? [`   ➕ Pembayaran lain (visa/ongkir/optional): ${fmtRp(n.addonPaid)} — di luar cicilan pokok`] : []),
      ``,
      invoiceLink ? `📄 Lihat invoice:\n🔗 ${invoiceLink}\n` : '',
      `Terima kasih atas pembayarannya 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].filter(Boolean).join('\n');

    const _picTok = await getPicFonnteTokenById(supabase, pax.trip_id);
    const result = await sendFonnte(phone, message, { context: 'finance', token: _picTok });
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
      .select('id, price_paid, discount_amount')
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
        const pokokNet = Math.max(Number(p.price_paid || 0) - Number(p.discount_amount || 0), 0);
        const sisa = pokokNet - pokokPaid;   // pokok − diskon − dibayar pokok
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
