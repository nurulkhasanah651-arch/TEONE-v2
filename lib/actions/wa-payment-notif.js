'use server';

// Round 187: WA notifikasi ke peserta — Invoice link + Bukti Payment received
// Path: lib/actions/wa-payment-notif.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';
import { getPicFonnteTokenById, getPicNameForTrip, isPicWaManualForTrip } from '@/lib/auth/pic-scope';
import { calcPokokPaid, roomTypeToKey, visaPriceFor } from '@/lib/utils/price-breakdown';
import { getInvoiceBilling } from '@/lib/shop/invoice-bill';
import { plainForBrand } from '@/lib/utils/wa-plain';

function brandCode() { let c = 'teone'; try { c = currentBrandCode(); } catch {} return c; }
function isKhasanah() { return brandCode() === 'khasanah'; }
// Label header & footer per brand (sebelumnya hardcode 'TEONE' walau di Khasanah)
function brandLabel() { return isKhasanah() ? 'KHASANAH TRAVEL' : 'TEONE'; }
function brandFooter() { return isKhasanah() ? '_Khasanah Travel_' : '_TEONE — Traveling Eropa_'; }

function salamWord() {
  return isKhasanah() ? "Assalamu'alaikum" : 'Hai';
}
function financeIntro(picName, isFirst) {
  const brand = isKhasanah() ? 'Khasanah Travel' : 'Traveling Eropa';
  // Sistem PIC: perkenalan sebagai PIC trip. Tanpa PIC -> tanpa perkenalan.
  if (!picName) return '';
  // Khasanah: selalu "Saya <nama>, PIC trip kamu di Khasanah Travel"
  if (isKhasanah()) return `Saya *${picName}*, PIC trip kamu di ${brand} \ud83d\ude4f`;
  return isFirst
    ? `Perkenalkan, saya *${picName}*, PIC trip kamu di ${brand} \ud83d\ude4f`
    : `Saya *${picName}*, PIC trip kamu \ud83d\ude4f`;
}


// Antrekan pesan yang TIDAK dikirim otomatis (PIC kirim manual), supaya tidak hilang.
// Dipakai alur otomatis: pembayaran online & reminder cron.
async function queueManualWA(supabase, { phone, message, kind, tripId, meta }) {
  try {
    await supabase.from('wa_outbox').insert({
      brand: brandCode(),
      context: 'finance',
      kind: kind || 'manual_pending',
      status: 'pending',
      target_phone: phone || null,
      message: message || null,
      trip_id: tripId || null,
      meta: meta || null, // { customer_name, payment_type, amount, method, paid_at }
      reason: 'PIC kirim manual — nomor WA PIC belum tersambung',
    });
  } catch {}
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
  // INFANT: tanpa biaya wajib. CHILD NO BED: tanpa tips & city tax (tiket+bagasi+base tetap).
  const _rt = String(pax.room_type || '').toLowerCase();
  const _isInfant = (pax.age_type === 'infant') || _rt.includes('infant');
  const _isChildNoBed = !_isInfant && ((pax.age_type === 'child_no_bed') || _rt.includes('child'));
  const tips = (_isInfant || _isChildNoBed) ? 0 : Number(bd.tips || bd.Tips || 0);
  const cityTax = (_isInfant || _isChildNoBed) ? 0 : Number(bd.city_tax || bd.cityTax || bd.CityTax || 0);
  const flight = _isInfant ? 0 : Number(bd.domestic_flight || 0);
  const baggage = _isInfant ? 0 : Number(bd.domestic_baggage || 0);
  const baseFee = _isInfant ? 0 : Number(bd.harga_jual_base || 0);
  const perlengkapan = _isInfant ? 0 : Number(bd.perlengkapan || 0); // biaya WAJIB (spt tips/city tax)
  const discount = Number(pax.discount_amount || 0);
  let pokokGross = Number(pax.price_paid || 0);
  if (pokokGross <= 0) pokokGross = roomPrice + tips + cityTax + flight + baggage + baseFee + perlengkapan; // fallback kalau Harga Bayar belum diisi
  const pokokNet = Math.max(pokokGross - discount, 0);
  const totalBayar = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const pokokPaid = calcPokokPaid(payments || []);
  const addonPaid = Math.max(totalBayar - pokokPaid, 0);
  const sisa = Math.max(pokokNet - pokokPaid, 0);
  return { roomPrice, tips, cityTax, flight, baggage, baseFee, perlengkapan, discount, pokokGross, pokokNet, pokokPaid, addonPaid, sisa, totalBayar };
}
function detailPaketLines(n) {
  const L = [];
  // Paket = pokok (harga jual) - komponen lain, supaya baris menjumlah ke total
  const paket = Math.max((Number(n.pokokGross)||0) - (Number(n.tips)||0) - (Number(n.cityTax)||0) - (Number(n.flight)||0) - (Number(n.baggage)||0) - (Number(n.baseFee)||0) - (Number(n.perlengkapan)||0), 0);
  if (paket > 0) L.push(`   • Paket kamar: ${fmtRp(paket)}`);
  if (n.baseFee > 0) L.push(`   • Harga Dasar: ${fmtRp(n.baseFee)}`);
  if (n.flight > 0) L.push(`   • Tiket Pesawat Domestik: ${fmtRp(n.flight)}`);
  if (n.baggage > 0) L.push(`   • Bagasi Domestik: ${fmtRp(n.baggage)}`);
  if (n.tips > 0) L.push(`   • Tips: ${fmtRp(n.tips)}`);
  if (n.cityTax > 0) L.push(`   • City Tax: ${fmtRp(n.cityTax)}`);
  if (n.perlengkapan > 0) L.push(`   • Perlengkapan: ${fmtRp(n.perlengkapan)}`);
  return L;
}

// ============ Kirim Invoice ke WA peserta ============
export async function sendInvoiceWA(passengerId, previewOnly = false, opts = {}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id, price_paid, room_type, discount_amount, age_type')
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
          flight: sum('flight'), baggage: sum('baggage'), baseFee: sum('baseFee'), perlengkapan: sum('perlengkapan'),
          pokokGross: bill.expectedTotal + bill.discount, pokokNet: bill.expectedTotal, discount: bill.discount,
          pokokPaid: bill.pokokPaid, addonPaid: bill.addonPaid, sisa: bill.sisa, count: bill.count,
        };
      } catch {}
    }
    const n = fn;
    const famNote = (fn.count && fn.count > 1) ? ` (untuk ${fn.count} peserta keluarga)` : '';

    const message = plainForBrand([
      `📋 *INVOICE PEMBAYARAN — ${brandLabel()}*`,
      ``,
      `${salamWord()} *${customer.name}*,`,
      financeIntro(await getPicNameForTrip(supabase, pax.trip_id), !(payments && payments.length)),
      `Berikut invoice trip kamu:`,
      ``,
      `🎫 Trip: *${trip?.kode_trip || ''} ${trip?.name || ''}*`.trim(),
      `🧾 No Invoice: *${targetInvoice?.invoice_no || '-'}*`,
      `💳 Pembayaran: *${targetInvoice?.milestone || '-'}*`,
      ...(targetInvoice?.due_date ? [`📅 Deadline: *${new Date(targetInvoice.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}*`] : []),
      ``,
      `Detail invoice & cara pembayaran (nominal, bayar online, upload bukti transfer) klik link di bawah ini 👇`,
      `🔗 ${invoiceLink}`,
      ``,
      `Status pembayaran online otomatis ter-update. Atau konfirmasi manual dengan membalas pesan ini + bukti transfer.`,
      ``,
      `Terima kasih 🙏`,
      brandFooter(),
    ].join('\n'));

    if (previewOnly) return { ok: true, preview: true, message, phone: normalizePhone(phone), customerName: customer.name };
    if (!opts.forceSend && await isPicWaManualForTrip(supabase, pax.trip_id)) {
      if (opts.queueManual) await queueManualWA(supabase, { phone: normalizePhone(phone), message, kind: opts.queueKind, tripId: pax.trip_id, meta: opts.meta || null });
      return { ok: true, wa_manual: true, wa_message: message, wa_phone: normalizePhone(phone), customer_name: customer.name };
    }
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
export async function sendPaymentReceivedWA(passengerId, previewOnly = false, opts = {}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id, price_paid, room_type, discount_amount, age_type, include_visa, visa_ready, include_asuransi, visa_type')
      .eq('id', passengerId)
      .maybeSingle();
    if (!pax) return { error: 'Peserta gak ditemukan' };

    const [{ data: customer }, { data: trip }, { data: payments }, { data: invoices }] = await Promise.all([
      supabase.from('customers').select('name, phone, whatsapp').eq('id', pax.customer_id).maybeSingle(),
      supabase.from('trips').select('kode_trip, name, departure, price_breakdown').eq('id', pax.trip_id).maybeSingle(),
      supabase.from('participant_payments').select('amount, type, paid_at, created_at').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('passenger_id', pax.id).order('created_at', { ascending: false }),
    ]);

    if (!customer) return { error: 'Customer info gak ditemukan' };
    const phone = customer.whatsapp || customer.phone;
    if (!phone) return { error: `Peserta "${customer.name}" gak punya nomor HP/WA` };

    if (!payments || payments.length === 0) {
      return { error: `Peserta "${customer.name}" belum ada catatan pembayaran` };
    }

    const n = invoiceNumbers(pax, trip?.price_breakdown, payments);
    const lastPayment = payments[0];

    // Breakdown semua pembayaran
    const paymentBreakdown = payments.map((p, idx) => {
      const date = p.paid_at || p.created_at;
      const dateStr = date ? new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
      return `   ${idx + 1}. ${p.type || 'Bayar'} — ${fmtRp(p.amount)} (${dateStr})`;
    }).join('\n');

    const appUrl = getAppUrl().replace(/\/$/, '');
    // Fallback: peserta tanpa invoice sendiri bisa tercakup di invoice KELUARGA.
    let _invRow = (invoices && invoices[0]) ? invoices[0] : null;
    if (!_invRow) {
      try {
        const { data: famInv } = await supabase.from('invoices')
          .select('*')
          .eq('trip_id', pax.trip_id)
          .contains('covers_passenger_ids', [pax.id])
          .order('created_at', { ascending: false }).limit(1);
        if (famInv && famInv[0]) _invRow = famInv[0];
      } catch {}
    }
    const invoiceLink = _invRow ? `${appUrl}/invoice/${_invRow.public_token}` : null;

    // === TOTAL BIAYA (bukan cuma nominal DP) — supaya WA jadi tanda terima utuh. ===
    // Family: pakai getInvoiceBilling atas invoice keluarga (total semua anggota).
    // Individual / tanpa invoice: hitung dari peserta ini (pokok + visa + asuransi yg di-include).
    const _bd = trip?.price_breakdown || {};
    let totalBiaya = 0, sudahBayar = 0;
    let famPax = 1;
    if (_invRow && _invRow.is_family_invoice) {
      try {
        const bill = await getInvoiceBilling(supabase, _invRow);
        totalBiaya = (Number(bill.expectedTotal) || 0) + (Number(bill.visaExpected) || 0) + (Number(bill.asuransiExpected) || 0);
        sudahBayar = Number(bill.totalPaid) || 0;
        famPax = Number(bill.count) || 1;
      } catch { /* fallback di bawah */ }
    }
    if (!(totalBiaya > 0)) {
      const _visaExp = (pax.include_visa && !pax.visa_ready) ? visaPriceFor(_bd, pax.visa_type) : 0;
      const _asrExp = pax.include_asuransi ? (Number(_bd.asuransi) || 0) : 0;
      totalBiaya = (Number(n.pokokNet) || 0) + _visaExp + _asrExp;
      sudahBayar = Number(n.totalBayar) || 0;
      famPax = 1;
    }
    const sisaBiaya = Math.max(totalBiaya - sudahBayar, 0);
    const isLunas = totalBiaya > 0 && sisaBiaya <= 0;

    const _payType = lastPayment.type || 'Bayar';
    const _picName = await getPicNameForTrip(supabase, pax.trip_id);

    // Khasanah: "Assalamu'alaikum <nama>, saya <PIC>, PIC trip kamu di Khasanah Travel.
    //            Berikut konfirmasi pembayaran <DP> kamu" + trip + nominal + link.
    // Format sama utk kedua brand: konfirmasi dari PIC + nominal + link tanda terima.
    // Yg beda hanya salam (Assalamu'alaikum / Hai) dan label brand.
    const _header = isLunas
      ? `✅ *PEMBAYARAN LUNAS — ${brandLabel()}*`
      : `✅ *KONFIRMASI PEMBAYARAN ${String(_payType).toUpperCase()} — ${brandLabel()}*`;

    const _bodyLine = isLunas
      ? `Pembayaran trip kamu sudah *LUNAS* 🎉`
      : `Berikut konfirmasi pembayaran *${_payType}* kamu:`;

    const message = plainForBrand([
      _header,
      ``,
      `${salamWord()} *${customer.name}*,`,
      financeIntro(_picName, /dp/i.test(String(_payType))),
      _bodyLine,
      ``,
      `🎫 Trip: *${trip?.kode_trip || ''} ${trip?.name || ''}*`.trim(),
      `💳 ${_payType}: *${fmtRp(lastPayment.amount)}*`,
      ``,
      invoiceLink ? `Bukti pembayaran (tanda terima resmi) klik link di bawah ini 👇\n🔗 ${invoiceLink}\n` : '',
      `Terima kasih atas pembayarannya 🙏`,
      brandFooter(),
    ].filter(Boolean).join('\n'));

    if (previewOnly) return { ok: true, preview: true, message, phone: normalizePhone(phone), customerName: customer.name };
    if (!opts.forceSend && await isPicWaManualForTrip(supabase, pax.trip_id)) {
      if (opts.queueManual) await queueManualWA(supabase, { phone: normalizePhone(phone), message, kind: opts.queueKind, tripId: pax.trip_id, meta: opts.meta || null });
      return { ok: true, wa_manual: true, wa_message: message, wa_phone: normalizePhone(phone), customer_name: customer.name };
    }
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
    let sent = 0, failed = 0, skipped = 0, manual = 0, errors = [];
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
        else if (r.wa_manual) { manual++; }
        else sent++;
      } catch (e) {
        failed++;
        errors.push(`#${p.id}: ${e?.message || 'unknown'}`);
      }
    }

    revalidatePath(`/finance/payments/${tripId}`);
    return {
      ok: true, sent, failed, skipped, manual, total: paxList.length, errors,
      message: `📨 ${sent} invoice terkirim · ${skipped} sudah lunas (skip)${manual > 0 ? ` · ${manual} PIC kirim manual (tidak dikirim)` : ''}${failed > 0 ? ` · ${failed} gagal` : ''}`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}
