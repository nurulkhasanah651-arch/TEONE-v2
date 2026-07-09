'use server';

// Round 106 + R205: WA template + FIX phone lookup
// FIX: fresh fetch customer.phone dari customers table (bukan snapshot di invoices.customer_phone)

import { revalidatePath } from 'next/cache';
import { assertStaff } from '@/lib/auth/require-staff';
import { isPicWaManualForTrip, getPicFonnteTokenForTrip, getPicNameForTrip } from '@/lib/auth/pic-scope';
import { sendPaymentReceivedWA } from '@/lib/actions/wa-payment-notif';
import { applyInvoiceAllInPaid } from '@/lib/shop/fulfillment';
import { getFonnteToken } from '@/lib/utils/fonnte';
import { siteUrlFor, customerSiteUrlFor } from '@/lib/brand-shared';
import { currentBrandCode as getBrandCodeSafe } from '@/lib/supabase/service-env';
import { createClient, createPublicClient } from '@/lib/supabase/server';
import { getBrandId } from '@/lib/brand';
import { paxRoomKey, mainExpectedPerPassenger, isPokokMilestone, visaPriceFor, visaPriceTpl } from '@/lib/utils/price-breakdown';
import { plainForBrand } from '@/lib/utils/wa-plain';

function genToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '62' + p.substring(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

async function sendFonnte(phone, message, tokenOverride) {
  let token;
  if (tokenOverride && String(tokenOverride).trim()) token = String(tokenOverride).trim();
  else ({ token } = getFonnteToken('finance', getBrandCodeSafe()));
  if (!token) return { error: 'Fonnte token finance belum di-set (FONNTE_TOKEN_FINANCE / FONNTE_TOKEN)' };
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ target: phone, message, countryCode: '62' }),
    });
    const data = await res.json();
    if (!res.ok || data.status === false) {
      const _werr = 'Fonnte error: ' + (data.reason || data.message || 'unknown');
      try { const _wm = await import('@/lib/wa-outbox-log'); await _wm.logWA({ context: 'finance', phone, message, status: 'failed', state: 'failed', reason: _werr, senderToken: token }); } catch {}
      return { error: _werr };
    }
    const _wfid = Array.isArray(data.id) ? data.id[0] : (data.id || null);
    try { const _wm = await import('@/lib/wa-outbox-log'); await _wm.logWA({ context: 'finance', phone, message, status: 'sent', state: 'sent', fonnteId: _wfid, senderToken: token }); } catch {}
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

/**
 * R205 NEW: Fresh fetch phone dari customers table
 * Fallback chain: invoice.customer_phone → customers.phone → customers.whatsapp
 */
async function resolveCustomerPhone(supabase, inv) {
  // 1. Coba ambil dari snapshot invoice
  if (inv.customer_phone && String(inv.customer_phone).trim()) {
    return inv.customer_phone;
  }

  // 2. Fresh lookup dari customers table via customer_id
  if (inv.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('phone, whatsapp')
      .eq('id', inv.customer_id)
      .maybeSingle();
    if (cust) {
      return cust.phone || cust.whatsapp || null;
    }
  }

  // 3. Last resort: lookup via passenger → customer
  if (inv.passenger_id) {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('customer_id, customers(phone, whatsapp)')
      .eq('id', inv.passenger_id)
      .maybeSingle();
    if (pax?.customers) {
      return pax.customers.phone || pax.customers.whatsapp || null;
    }
  }

  return null;
}

export async function getExpectedAndPaidForPassenger(supabase, trip_id, passenger_id) {
  const [tripRes, paxRes, paysRes] = await Promise.all([
    supabase.from('trips').select('price_breakdown, payment_template').eq('id', trip_id).maybeSingle(),
    supabase.from('trip_passengers').select('room_type, age_type, discount_amount, price_paid, visa_type, include_visa, include_asuransi, visa_ready').eq('id', passenger_id).maybeSingle(),
    supabase.from('participant_payments').select('type, amount').eq('passenger_id', passenger_id),
  ]);

  const breakdown = (tripRes.data?.price_breakdown && typeof tripRes.data.price_breakdown === 'object') ? tripRes.data.price_breakdown : {};
  const template = (tripRes.data?.payment_template && typeof tripRes.data.payment_template === 'object') ? tripRes.data.payment_template : {};
  const roomType = paxRes.data?.room_type || '';
  const pays = paysRes.data || [];
  const paidTypes = new Set(pays.map((p) => p.type));

  const totalPaid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);

  const roomKey = paxRoomKey({ room_type: roomType, age_type: paxRes.data?.age_type });
  const roomPrice = Number(
    breakdown[roomKey] || breakdown[roomType] || breakdown[String(roomType).toLowerCase()] || 0
  );
  const tips = Number(breakdown.tips || breakdown.Tips || 0);
  const cityTax = Number(breakdown.city_tax || breakdown.cityTax || breakdown.CityTax || 0);
  const flight = Number(breakdown.domestic_flight || 0);
  const baggage = Number(breakdown.domestic_baggage || 0);
  const baseFee = Number(breakdown.harga_jual_base || 0);
  const perlengkapan = Number(breakdown.perlengkapan || 0);

  // POKOK = kamar + biaya wajib. INFANT: harga dasar saja (tanpa biaya wajib).
  // CHILD NO BED (anak <7th): tanpa tips & city tax, tapi tiket+bagasi domestik & base TETAP ditagih.
  const ageType = paxRes.data?.age_type;
  const isInfant = (ageType === 'infant') || String(roomType).toLowerCase().includes('infant');
  const isChildNoBed = !isInfant && ((ageType === 'child_no_bed') || String(roomType).toLowerCase().includes('child'));
  // LAND TOUR: diperlakukan sama seperti full trip (semua biaya wajib ditagihkan)
  const effTips = (isInfant || isChildNoBed) ? 0 : tips;
  const effCity = (isInfant || isChildNoBed) ? 0 : cityTax;
  const effFlight = isInfant ? 0 : flight;
  const effBaggage = isInfant ? 0 : baggage;
  const effBase = isInfant ? 0 : baseFee;
  // Perlengkapan = biaya WAJIB (spt tips/city tax). Infant bebas biaya wajib; child no bed tetap kena.
  const effPerlengkapan = isInfant ? 0 : perlengkapan;
  const mainExpected = roomPrice + effTips + effCity + effFlight + effBaggage + effBase + effPerlengkapan;

  // Tampil sbg tagihan bila peserta MEMILIH include (opt-in) ATAU sudah ada pembayarannya
  const _incVisa = !!paxRes.data?.include_visa && !paxRes.data?.visa_ready;
  const _incAsr = !!paxRes.data?.include_asuransi;
  const visaExpected = (_incVisa || paidTypes.has('Visa')) ? visaPriceFor(breakdown, paxRes.data?.visa_type) : 0;
  const asuransiExpected = (_incAsr || paidTypes.has('Asuransi')) ? Number(breakdown.asuransi || 0) : 0;
  let optExpected = visaExpected + asuransiExpected;

  // POKOK trip = paket utama (room + tips + city tax + tiket/bagasi domestik + base, jika diisi). Visa/asuransi/ongkir/optional = ADDON terpisah.
  // Pembayaran addon TIDAK mengurangi sisa pokok, tapi tetap dicatat (lihat addonPaid + totalPaid).
  const milestonesPokok = ['DP','P1','P2','P3','P4','P5','P6','P7','Pelunasan'];
  const pokokPaid = pays.filter((p) => milestonesPokok.includes(p.type)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const addonPaid = Math.max(totalPaid - pokokPaid, 0);
  // cicilan pokok = Harga Bayar (price_paid) kalau diisi, kalau 0 pakai mainExpected (room+tips+citytax)
  const discount = Number(paxRes.data?.discount_amount || 0);
  const pokokGross = Number(paxRes.data?.price_paid || 0) > 0 ? Number(paxRes.data.price_paid) : mainExpected;
  const expectedTotal = Math.max(pokokGross - discount, 0);  // tagihan POKOK setelah diskon
  const sisa = Math.max(expectedTotal - pokokPaid, 0);       // sisa = pokok − diskon − dibayar pokok

  const milestones = ['DP', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'Pelunasan'];
  let nextMilestone = null;
  for (const m of milestones) {
    if (!paidTypes.has(m) && Number(template[m]) > 0) {
      nextMilestone = { type: m, amount: Number(template[m]) };
      break;
    }
  }
  if (!nextMilestone && sisa > 0) {
    nextMilestone = { type: 'Pelunasan', amount: sisa };
  }

  return { expectedTotal, totalPaid, pokokPaid, addonPaid, sisa, discount, mainExpected, optExpected, nextMilestone, roomPrice, tips: effTips, cityTax: effCity, flight: effFlight, baggage: effBaggage, baseFee: effBase, perlengkapan: effPerlengkapan, roomType, visaExpected, asuransiExpected };
}

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

  const perPaxMap = (inv.passenger_amounts && typeof inv.passenger_amounts === 'object') ? inv.passenger_amounts : {};
  const hasCustomPerPax = Object.keys(perPaxMap).length > 0;

  const noteText = inv.is_family_invoice
    ? `Synced dari Family Invoice ${inv.invoice_no} (cover ${pesertaIds.length} peserta, total Rp ${totalAmount.toLocaleString('id-ID')})`
    : `Synced dari Invoice ${inv.invoice_no}`;

  for (const pid of pesertaIds) {
    let amountPerPax;
    if (hasCustomPerPax) {
      const v = perPaxMap[String(pid)] ?? perPaxMap[pid];
      amountPerPax = Number(v) || 0;
    } else {
      amountPerPax = pesertaIds.length > 1 ? Math.round(totalAmount / pesertaIds.length) : totalAmount;
    }
    if (amountPerPax <= 0) continue;

    const { data: existing } = await supabase
      .from('participant_payments').select('id, amount')
      .eq('passenger_id', pid).eq('type', inv.milestone).maybeSingle();

    if (existing) {
      if (Number(existing.amount) !== amountPerPax) {
        await supabase.from('participant_payments').update({ amount: amountPerPax, notes: noteText }).eq('id', existing.id);
      }
    } else {
      await supabase.from('participant_payments').insert({
        passenger_id: pid, type: inv.milestone, amount: amountPerPax,
        paid_at: new Date().toISOString(), notes: noteText,
      });
    }
  }
}

async function generateInvoiceNo(supabase, tripId, bump = 0) {
  const { data: trip } = await supabase.from('trips').select('kode_trip, id').eq('id', tripId).maybeSingle();
  const kode = (trip?.kode_trip || tripId).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  // Ambil nomor tertinggi yg sudah ada utk trip ini → +1 (bukan count, agar tak bentrok bila ada invoice yg dihapus)
  const { data: rows } = await supabase.from('invoices').select('invoice_no').eq('trip_id', tripId);
  let maxSeq = 0;
  for (const r of (rows || [])) {
    const m = String(r.invoice_no || '').match(/(\d+)\s*$/);
    if (m) { const n = parseInt(m[1], 10); if (Number.isFinite(n) && n > maxSeq) maxSeq = n; }
  }
  const seq = String(maxSeq + 1 + (bump || 0)).padStart(3, '0');
  const prefix = getBrandCodeSafe() === 'khasanah' ? 'KT' : 'TEONE';
  return `${prefix}-${kode}-${seq}`;
}

export async function createInvoice(params) {
  let {
    trip_id, passenger_id, customer_id, milestone, amount, due_date, description,
    family_group_id = null, covers_passenger_ids = null, is_family_invoice = false,
    passenger_amounts = null, allIn = false, skipAsuransi = false,
  } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  // ALL-IN: hitung total semua sisa (pokok + visa + asuransi yg di-include) server-side
  if (allIn) {
    const ids = (is_family_invoice && Array.isArray(covers_passenger_ids) && covers_passenger_ids.length) ? covers_passenger_ids : (passenger_id ? [passenger_id] : []);
    const { data: _trip } = await supabase.from('trips').select('price_breakdown, payment_template').eq('id', trip_id).maybeSingle();
    const bd = _trip?.price_breakdown || {};
    const _tpl = (_trip?.payment_template && typeof _trip.payment_template === 'object') ? _trip.payment_template : {};
    const _vp = Number(_tpl.Visa ?? _tpl.visa) || Number(bd.visa) || 0;
    const _ap = Number(_tpl.Asuransi ?? _tpl.asuransi) || Number(bd.asuransi) || 0;
    let total = 0;
    for (const pid of ids) {
      const { data: px } = await supabase.from('trip_passengers').select('room_type, age_type, price_paid, discount_amount, include_visa, include_asuransi, visa_ready, visa_type').eq('id', pid).maybeSingle();
      if (!px) continue;
      const { data: pys } = await supabase.from('participant_payments').select('type, amount').eq('passenger_id', pid);
      const pokokExp = Math.max(mainExpectedPerPassenger(px, bd) - (Number(px.discount_amount) || 0), 0);
      const pokokPaid = (pys || []).filter((x) => isPokokMilestone(x.type)).reduce((a, x) => a + (Number(x.amount) || 0), 0);
      const visaOwed = (px.include_visa && !px.visa_ready && !(pys || []).some((x) => String(x.type).toLowerCase() === 'visa')) ? visaPriceTpl(_tpl, bd, px.visa_type) : 0;
      const asrOwed = (!skipAsuransi && px.include_asuransi && !(pys || []).some((x) => String(x.type).toLowerCase() === 'asuransi')) ? _ap : 0;
      total += Math.max(pokokExp - pokokPaid, 0) + visaOwed + asrOwed;
    }
    amount = total;
    milestone = skipAsuransi ? 'Pelunasan + Visa' : 'Pelunasan + Visa + Asuransi';
    passenger_amounts = null;
  }

  if (!trip_id || !milestone || !amount) return { error: 'trip_id, milestone, amount wajib' };

  const [tripRes, custRes] = await Promise.all([
    supabase.from('trips').select('name, kode_trip').eq('id', trip_id).maybeSingle(),
    customer_id ? supabase.from('customers').select('name, phone, whatsapp, email').eq('id', customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const trip = tripRes.data; const cust = custRes.data;
  const invoice_no = await generateInvoiceNo(supabase, trip_id);
  const token = genToken();

  const payload = {
    invoice_no, trip_id,
    passenger_id: passenger_id || null,
    customer_id: customer_id || null,
    milestone, amount: Number(amount) || 0,
    due_date: due_date || null, status: 'draft',
    description: description || `${milestone} — ${trip?.name || trip_id}`,
    public_token: token,
    created_by: user.user_metadata?.full_name || user.email || 'unknown',
    customer_name: cust?.name || null,
    customer_phone: cust?.phone || cust?.whatsapp || null, // R205: fallback ke whatsapp juga
    customer_email: cust?.email || null,
    trip_name: trip?.name || null, trip_kode: trip?.kode_trip || null,
    family_group_id: family_group_id || null,
    covers_passenger_ids: is_family_invoice && Array.isArray(covers_passenger_ids) ? covers_passenger_ids : [],
    is_family_invoice: !!is_family_invoice,
    passenger_amounts: passenger_amounts && typeof passenger_amounts === 'object' ? passenger_amounts : {},
    is_allin: !!allIn,
  };

  let { data, error } = await supabase.from('invoices').insert(payload).select('id, invoice_no, public_token').single();

  if (error && /family_group_id|covers_passenger_ids|is_family_invoice|passenger_amounts|is_allin/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.family_group_id;
    delete stripped.covers_passenger_ids;
    delete stripped.is_family_invoice;
    delete stripped.passenger_amounts;
    delete stripped.is_allin;
    const retry = await supabase.from('invoices').insert(stripped).select('id, invoice_no, public_token').single();
    data = retry.data; error = retry.error;
  }

  // Retry kalau nomor invoice bentrok (unique invoice_no) — regenerate & coba lagi
  let dupTries = 0;
  while (error && /invoice_no|duplicate key|23505/i.test(error.message || '') && dupTries < 5) {
    dupTries++;
    payload.invoice_no = await generateInvoiceNo(supabase, trip_id, dupTries);
    const r2 = await supabase.from('invoices').insert(payload).select('id, invoice_no, public_token').single();
    data = r2.data; error = r2.error;
  }

  if (error) return { error: error.message };

  revalidateAll(trip_id);
  return { ok: true, invoice_id: data.id, invoice_no: data.invoice_no, token: data.public_token };
}

// ============================================================
// WA template (no change) — masih pakai inv.customer_phone untuk display
// Tapi build content tetap pakai data dari DB
// ============================================================
async function buildWAMessage(supabase, inv) {
  const baseUrl = customerSiteUrlFor(getBrandCodeSafe());
  const invoiceLink = `${baseUrl}/invoice/${inv.public_token}`;
  const { data: company } = await supabase.from('brands').select('*, company_name:name, company_logo_url:logo_url').eq('id', inv.brand_id || 1).maybeSingle();
  const companyName = company?.company_name || 'Traveling Eropa';
  const _bcode = getBrandCodeSafe();
  const _picName = await getPicNameForTrip(supabase, inv.trip_id);
  const _isDP = /dp/i.test(String(inv.milestone || ''));
  const greet = (nm) => {
    const salam = _bcode === 'khasanah' ? "Assalamu'alaikum" : 'Halo';
    const who = _picName ? `saya *${_picName}*, PIC trip kamu` : `tim ${companyName}`;
    return `${salam} ${nm || 'Bapak/Ibu'} \ud83d\ude4f\nPerkenalkan, ${who} di ${companyName}.`;
  };
  const familyTag = inv.is_family_invoice && Array.isArray(inv.covers_passenger_ids)
    ? ` (${inv.covers_passenger_ids.length} pax)` : '';

  let breakdownText = '';
  if (inv.is_family_invoice && inv.passenger_amounts && typeof inv.passenger_amounts === 'object' && Object.keys(inv.passenger_amounts).length > 0) {
    const pids = Object.keys(inv.passenger_amounts);
    const { data: pax } = await supabase.from('trip_passengers').select('id, customer_id').in('id', pids.map(Number));
    const customerIds = (pax || []).map((p) => p.customer_id).filter(Boolean);
    const { data: custs } = await supabase.from('customers').select('id, name').in('id', customerIds);
    const custMap = Object.fromEntries((custs || []).map((c) => [c.id, c.name]));
    const paxMap = Object.fromEntries((pax || []).map((p) => [p.id, custMap[p.customer_id] || `#${p.id}`]));
    const lines = pids.map((pid) => {
      const name = paxMap[Number(pid)] || `#${pid}`;
      const amt = Number(inv.passenger_amounts[pid]) || 0;
      return `• ${name}: ${fmtRupiah(amt)}`;
    });
    if (lines.length > 0) breakdownText = '\n\n📋 Breakdown per peserta:\n' + lines.join('\n');
  }

  if (inv.status === 'paid') {
    let summarySection = '';
    let nextSection = '';
    if (inv.trip_id && inv.passenger_id) {
      // Agregat KELUARGA: jumlahkan SEMUA peserta yg ditanggung invoice ini (bukan cuma pemesan).
      const memberIds = (inv.is_family_invoice && Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length)
        ? inv.covers_passenger_ids
        : [inv.passenger_id];
      let expectedTotal = 0, pokokPaid = 0, addonPaid = 0, tips = 0, cityTax = 0, flight = 0, baggage = 0, baseFee = 0, perlengkapan = 0, discount = 0, firstRoom = '';
      let nextType = null, nextAmt = 0;
      for (const pid of memberIds) {
        const s = await getExpectedAndPaidForPassenger(supabase, inv.trip_id, pid);
        expectedTotal += Number(s.expectedTotal) || 0;
        pokokPaid += Number(s.pokokPaid) || 0;
        addonPaid += Number(s.addonPaid) || 0;
        tips += Number(s.tips) || 0;
        cityTax += Number(s.cityTax) || 0;
        flight += Number(s.flight) || 0;
        baggage += Number(s.baggage) || 0;
        baseFee += Number(s.baseFee) || 0;
        perlengkapan += Number(s.perlengkapan) || 0;
        discount += Number(s.discount) || 0;
        if (!firstRoom) firstRoom = s.roomType || '';
        if (s.nextMilestone) { if (!nextType) nextType = s.nextMilestone.type; if (s.nextMilestone.type === nextType) nextAmt += Number(s.nextMilestone.amount) || 0; }
      }
      const sisa = Math.max(expectedTotal - pokokPaid, 0);
      const roomType = memberIds.length > 1 ? `${memberIds.length} pax` : firstRoom;
      const nextMilestone = nextType ? { type: nextType, amount: nextAmt } : null;
      const paketShown = Math.max(expectedTotal + discount - tips - cityTax - flight - baggage - baseFee - perlengkapan, 0);

      if (expectedTotal > 0) {
        summarySection = `

━━━━━━━━━━━━━━━━━━━━━━
📊 *RINGKASAN PEMBAYARAN ANDA*
━━━━━━━━━━━━━━━━━━━━━━

💰 Total Tagihan Pokok: *${fmtRupiah(expectedTotal)}*
✅ Dibayar (pokok): *${fmtRupiah(pokokPaid)}*${addonPaid > 0 ? `\n➕ Pembayaran lain (visa/ongkir/optional): *${fmtRupiah(addonPaid)}*` : ''}`;

        if (sisa === 0) {
          summarySection += `

🎉 *PEMBAYARAN LUNAS!* 🎉
Semua tagihan trip ini sudah selesai. Terima kasih!`;
        } else {
          summarySection += `

⚠ *SISA PEMBAYARAN POKOK:*
🟡 *${fmtRupiah(sisa)}*`;

          if (nextMilestone) {
            nextSection = `

📅 *Payment Selanjutnya:*
${nextMilestone.type}: ${fmtRupiah(nextMilestone.amount)}`;
          }
        }
      }
    }

    return plainForBrand(`${greet(inv.customer_name)}

Berikut kami sampaikan konfirmasi pembayaran Anda 🙏

✅ *Pembayaran Sudah Diterima*

Trip: ${inv.trip_name}${inv.trip_kode ? ` (${inv.trip_kode})` : ''}
Receipt: *${inv.invoice_no}*
Pembayaran: *${inv.milestone}*${familyTag}
Tanggal: ${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}

📄 Bukti pembayaran (receipt) klik link di bawah ini:
${invoiceLink}

Terima kasih,
${companyName}`);
  }

  let invoiceBreakdownText = '';
  if (inv.trip_id && inv.passenger_id) {
    // Total KELUARGA: jumlahkan semua anggota yang ditanggung invoice ini
    const memberIds = (inv.is_family_invoice && Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length)
      ? inv.covers_passenger_ids
      : [inv.passenger_id];
    let roomSum = 0, tipsSum = 0, citySum = 0, expSum = 0, pokokPaidSum = 0, sisaSum = 0, addonSum = 0, discSum = 0, flightSum = 0, baggageSum = 0, baseSum = 0, perlengkapanSum = 0, firstRoom = '';
    for (const pid of memberIds) {
      const s = await getExpectedAndPaidForPassenger(supabase, inv.trip_id, pid);
      roomSum += Number(s.roomPrice) || 0;
      tipsSum += Number(s.tips) || 0;
      citySum += Number(s.cityTax) || 0;
      expSum += Number(s.expectedTotal) || 0;
      pokokPaidSum += Number(s.pokokPaid) || 0;
      sisaSum += Number(s.sisa) || 0;
      addonSum += Number(s.addonPaid) || 0;
      discSum += Number(s.discount) || 0;
      flightSum += Number(s.flight) || 0;
      baggageSum += Number(s.baggage) || 0;
      baseSum += Number(s.baseFee) || 0;
      perlengkapanSum += Number(s.perlengkapan) || 0;
      if (!firstRoom) firstRoom = s.roomType || '';
    }
    if (expSum > 0) {
      const lbl = memberIds.length > 1 ? ` (${memberIds.length} pax)` : (firstRoom ? ` (${firstRoom})` : '');
      const paketSum = Math.max(expSum + discSum - tipsSum - citySum - flightSum - baggageSum - baseSum - perlengkapanSum, 0);
      invoiceBreakdownText = `

━━━━━━━━━━━━━━━━━━━━━━
📋 *RINGKASAN TAGIHAN*
━━━━━━━━━━━━━━━━━━━━━━

💰 Total Paket (Pokok): *${fmtRupiah(expSum)}*
${pokokPaidSum > 0 ? `✅ Dibayar (pokok): *${fmtRupiah(pokokPaidSum)}*\n⚠ Sisa Pokok: *${fmtRupiah(sisaSum)}*` : ''}${addonSum > 0 ? `\n➕ Pembayaran lain (visa/ongkir/optional): *${fmtRupiah(addonSum)}*` : ''}`;
    }
  }

  return plainForBrand(`${greet(inv.customer_name)}

Berikut kami sampaikan invoice tagihan trip Anda 🙏

📄 *Invoice ${inv.invoice_no}*

Trip: ${inv.trip_name}${inv.trip_kode ? ` (${inv.trip_kode})` : ''}
Tagihan: *${inv.milestone}*${familyTag}${inv.due_date ? `\nDeadline: ${inv.due_date}` : ''}

📄 Detail invoice & cara pembayaran (nominal, bayar online, upload bukti) klik link di bawah ini:
${invoiceLink}

Setelah transfer, mohon upload bukti di link di atas atau balas pesan ini.

Terima kasih,
${companyName}`);
}

// ============================================================
// SEND INVOICE WA — R205 FIX: resolveCustomerPhone fallback chain
// ============================================================
export async function previewInvoiceWA(invoiceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }
  const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!inv) return { error: 'Invoice tidak ditemukan' };
  const resolvedPhone = await resolveCustomerPhone(supabase, inv);
  let message = '';
  try { message = await buildWAMessage(supabase, inv); } catch (e) { return { error: 'Gagal render pesan: ' + (e?.message || 'unknown') }; }
  return {
    ok: true,
    message,
    phone: resolvedPhone ? normalizePhone(resolvedPhone) : null,
    customerName: inv.customer_name || '',
    invoiceNo: inv.invoice_no || '',
    isPaid: inv.status === 'paid',
    noPhone: !resolvedPhone,
  };
}

export async function sendInvoiceWA(invoiceId, opts = {}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!inv) return { error: 'Invoice tidak ditemukan' };

  // R205 NEW: Resolve phone dgn fallback chain (snapshot → customer → passenger.customer)
  const resolvedPhone = await resolveCustomerPhone(supabase, inv);
  if (!resolvedPhone) {
    return { error: 'Peserta belum punya no HP (cek customer profile)' };
  }

  // Update invoice.customer_phone supaya snapshot ke depan up-to-date
  if (!inv.customer_phone || inv.customer_phone !== resolvedPhone) {
    await supabase.from('invoices').update({ customer_phone: resolvedPhone }).eq('id', invoiceId);
    inv.customer_phone = resolvedPhone;
  }

  const message = await buildWAMessage(supabase, inv);
  const phone = normalizePhone(resolvedPhone);

  // PIC dgn WA manual: jangan kirim, balikan template supaya di-copy manual.
  if (!opts.forceSend && await isPicWaManualForTrip(supabase, inv.trip_id)) {
    if (opts.queueManual) {
      try {
        await supabase.from('wa_outbox').insert({
          brand: (() => { try { return currentBrandCode(); } catch { return null; } })(),
          context: 'finance', kind: opts.queueKind || 'manual_pending', status: 'pending',
          target_phone: phone, message, trip_id: inv.trip_id || null,
          reason: 'PIC kirim manual — nomor WA PIC belum tersambung',
        });
      } catch {}
    }
    await supabase.from('invoices')
      .update({ status: inv.status === 'paid' ? 'paid' : 'sent', sent_at: new Date().toISOString(), sent_via: 'manual' })
      .eq('id', invoiceId);
    revalidateAll(inv?.trip_id);
    return { ok: true, wa_manual: true, wa_message: message, wa_phone: phone, customer_name: inv.customer_name || '' };
  }

  let _picTok = null;
  try { if (inv.trip_id) { const { data: _tr } = await supabase.from('trips').select('pic_email').eq('id', inv.trip_id).maybeSingle(); _picTok = await getPicFonnteTokenForTrip(_tr); } } catch {}
  const result = await sendFonnte(phone, message, _picTok);
  if (result?.error) return { error: result.error };

  await supabase.from('invoices')
    .update({ status: inv.status === 'paid' ? 'paid' : 'sent', sent_at: new Date().toISOString(), sent_via: 'whatsapp' })
    .eq('id', invoiceId);

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function uploadPaymentProof(token, formData) {
  // Pakai service role (bukan anon): customer publik tak bergantung pada policy anon.
  const supabase = createPublicClient();
  const { data: inv } = await supabase.from('invoices').select('id, status, amount, trip_id, is_allin').eq('public_token', token).maybeSingle();
  if (!inv) return { error: 'Invoice tidak ditemukan' };

  let amount = parseInt(formData.get('amount')) || inv.amount;

  // R229: peserta pilih "bayar semua sekaligus" di transfer manual → tandai invoice all-in
  // supaya saat di-approve tercatat Pelunasan + Visa + Asuransi (bukan cuma milestone invoice).
  if (String(formData.get('all_in') || '') === '1' && !inv.is_allin && inv.status !== 'paid') {
    try {
      const { invoiceAllInOutstanding } = await import('@/lib/shop/fulfillment');
      const _out = await invoiceAllInOutstanding(inv.id);
      const _allTotal = Number(_out?.total) || 0;
      if (_allTotal > 0) {
        await supabase.from('invoices').update({ is_allin: true, milestone: 'Pelunasan + Visa + Asuransi', amount: _allTotal }).eq('id', inv.id);
        if (!parseInt(formData.get('amount'))) amount = _allTotal;
      }
    } catch {}
  }
  const payment_method = formData.get('payment_method') || 'transfer';
  const payment_date = formData.get('payment_date') || new Date().toISOString().slice(0, 10);
  const note = formData.get('note') || null;
  const proof_url = formData.get('proof_url') || null;
  const proof_file_name = formData.get('proof_file_name') || null;

  const { error } = await supabase.from('invoice_payments').insert({
    invoice_id: inv.id, amount, payment_date, payment_method,
    proof_url, proof_file_name, note_from_customer: note, status: 'pending',
  });
  if (error) return { error: error.message };

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function approveInvoicePayment(paymentId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const verified_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: pay } = await supabase.from('invoice_payments').select('*, invoices(*)').eq('id', paymentId).maybeSingle();
  if (!pay) return { error: 'Payment record tidak ditemukan' };
  const inv = pay.invoices;
  if (!inv) return { error: 'Invoice tidak ditemukan' };

  if (inv.is_allin) {
    await supabase.from('invoice_payments').update({ status: 'verified', verified_by, verified_at: new Date().toISOString() }).eq('id', paymentId);
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString(), paid_by_check: verified_by }).eq('id', inv.id);
    try { await applyInvoiceAllInPaid(inv.id, pay.amount, 'Transfer'); } catch (e) {}
    revalidateAll(inv?.trip_id);
    return { ok: true, all_in: true };
  }

  await supabase.from('invoice_payments').update({ status: 'verified', verified_by, verified_at: new Date().toISOString() }).eq('id', paymentId);
  await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString(), paid_by_check: verified_by }).eq('id', inv.id);

  await syncInvoiceToMatrix(supabase, inv, pay.amount);

  // Template LENGKAP (detail + link invoice) bila pembayaran terkait peserta trip.
  {
    let _pid = inv.passenger_id || null;
    if (!_pid && inv.customer_id && inv.trip_id) {
      const { data: _p } = await supabase.from('trip_passengers').select('id').eq('customer_id', inv.customer_id).eq('trip_id', inv.trip_id).maybeSingle();
      _pid = _p?.id || null;
    }
    if (_pid) {
      // PIC dgn WA manual -> jangan auto-kirim, balikan template utk di-copy.
      if (await isPicWaManualForTrip(supabase, inv.trip_id)) {
        let tpl = null;
        try { tpl = await sendPaymentReceivedWA(_pid, true); } catch {}
        revalidateAll(inv?.trip_id);
        return { ok: true, wa_manual: true, wa_message: tpl?.message || null, wa_phone: tpl?.phone || null, customer_name: tpl?.customerName || null };
      }
      let _f = { error: 'init' };
      try { _f = await sendPaymentReceivedWA(_pid); } catch (e) { _f = { error: e?.message || 'wa' }; }
      if (!_f?.error) { revalidateAll(inv?.trip_id); return { ok: true, full: true }; }
    }
  }

  // R205: Resolve phone dgn fallback chain
  const phoneForWA = await resolveCustomerPhone(supabase, inv);
  if (phoneForWA) {
    const updatedInv = { ...inv, status: 'paid', paid_at: new Date().toISOString(), customer_phone: phoneForWA };
    const message = await buildWAMessage(supabase, updatedInv);
    let _picTok = null;
    try { if (inv.trip_id) { const { data: _tr } = await supabase.from('trips').select('pic_email').eq('id', inv.trip_id).maybeSingle(); _picTok = await getPicFonnteTokenForTrip(_tr); } } catch {}
    await sendFonnte(normalizePhone(phoneForWA), message, _picTok);
  }

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function rejectInvoicePayment(paymentId, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const { data: pay } = await supabase.from('invoice_payments').select('invoices(trip_id)').eq('id', paymentId).maybeSingle();

  const { error } = await supabase.from('invoice_payments')
    .update({
      status: 'rejected', reject_reason: reason || 'Bukti tidak valid',
      verified_by: user.user_metadata?.full_name || user.email,
      verified_at: new Date().toISOString(),
    }).eq('id', paymentId);
  if (error) return { error: error.message };

  revalidateAll(pay?.invoices?.trip_id);
  return { ok: true };
}

export async function markInvoicePaidManual(invoiceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const verified_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!inv) return { error: 'Invoice tidak ditemukan' };

  if (inv.is_allin) {
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString(), paid_by_check: verified_by }).eq('id', invoiceId);
    try { await applyInvoiceAllInPaid(invoiceId, inv.amount, 'manual'); } catch (e) {}
    revalidateAll(inv?.trip_id);
    return { ok: true, all_in: true };
  }

  await supabase.from('invoice_payments').insert({
    invoice_id: invoiceId, amount: inv.amount,
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'manual_mark', status: 'verified',
    verified_by, verified_at: new Date().toISOString(),
    note_from_customer: 'Marked paid manually by ' + verified_by,
  });

  await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString(), paid_by_check: verified_by }).eq('id', invoiceId);

  await syncInvoiceToMatrix(supabase, inv, inv.amount);

  // Template LENGKAP (detail + link invoice) bila pembayaran terkait peserta trip.
  {
    let _pid = inv.passenger_id || null;
    if (!_pid && inv.customer_id && inv.trip_id) {
      const { data: _p } = await supabase.from('trip_passengers').select('id').eq('customer_id', inv.customer_id).eq('trip_id', inv.trip_id).maybeSingle();
      _pid = _p?.id || null;
    }
    if (_pid) {
      // PIC dgn WA manual -> jangan auto-kirim, balikan template utk di-copy.
      if (await isPicWaManualForTrip(supabase, inv.trip_id)) {
        let tpl = null;
        try { tpl = await sendPaymentReceivedWA(_pid, true); } catch {}
        revalidateAll(inv?.trip_id);
        return { ok: true, wa_manual: true, wa_message: tpl?.message || null, wa_phone: tpl?.phone || null, customer_name: tpl?.customerName || null };
      }
      let _f = { error: 'init' };
      try { _f = await sendPaymentReceivedWA(_pid); } catch (e) { _f = { error: e?.message || 'wa' }; }
      if (!_f?.error) { revalidateAll(inv?.trip_id); return { ok: true, full: true }; }
    }
  }

  // R205: Resolve phone dgn fallback chain
  const phoneForWA = await resolveCustomerPhone(supabase, inv);
  if (phoneForWA) {
    const updatedInv = { ...inv, status: 'paid', paid_at: new Date().toISOString(), customer_phone: phoneForWA };
    const message = await buildWAMessage(supabase, updatedInv);
    let _picTok = null;
    try { if (inv.trip_id) { const { data: _tr } = await supabase.from('trips').select('pic_email').eq('id', inv.trip_id).maybeSingle(); _picTok = await getPicFonnteTokenForTrip(_tr); } } catch {}
    await sendFonnte(normalizePhone(phoneForWA), message, _picTok);
  }

  revalidateAll(inv?.trip_id);
  return { ok: true };
}

export async function deleteInvoice(invoiceId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const { data: invMeta } = await supabase.from('invoices').select('trip_id').eq('id', invoiceId).maybeSingle();
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) return { error: error.message };

  revalidateAll(invMeta?.trip_id);
  return { ok: true };
}

export async function saveCompanySettings(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const payload = {
    name: formData.get('company_name') || 'Traveling Eropa',
    company_address: formData.get('company_address') || null,
    company_phone: formData.get('company_phone') || null,
    company_email: formData.get('company_email') || null,
    company_npwp: formData.get('company_npwp') || null,
    logo_url: formData.get('company_logo_url') || null,
    bank_name: formData.get('bank_name') || 'BCA',
    bank_account_no: formData.get('bank_account_no') || null,
    bank_account_name: formData.get('bank_account_name') || null,
    invoice_footer_note: formData.get('invoice_footer_note') || null,
    updated_at: new Date().toISOString(),
  };

  const brandId = await getBrandId();
  const { error } = await supabase.from('brands').update(payload).eq('id', brandId);
  if (error) return { error: error.message };

  revalidatePath('/settings');
  revalidatePath('/invoices');
  return { ok: true };
}

export async function createInvoiceAsPaid(params) {
  const {
    trip_id, passenger_id, customer_id, milestone, amount, payment_date, description,
    family_group_id = null, covers_passenger_ids = null, is_family_invoice = false,
    passenger_amounts = null,
  } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }
  if (!trip_id || !milestone || !amount) return { error: 'trip_id, milestone, amount wajib' };

  const [tripRes, custRes] = await Promise.all([
    supabase.from('trips').select('name, kode_trip').eq('id', trip_id).maybeSingle(),
    customer_id ? supabase.from('customers').select('name, phone, whatsapp, email').eq('id', customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const trip = tripRes.data; const cust = custRes.data;
  const invoice_no = await generateInvoiceNo(supabase, trip_id);
  const token = genToken();
  const verified_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    invoice_no, trip_id,
    passenger_id: passenger_id || null,
    customer_id: customer_id || null,
    milestone, amount: Number(amount) || 0,
    status: 'paid',
    paid_at: payment_date || new Date().toISOString(),
    paid_by_check: verified_by,
    description: description || `Receipt ${milestone} — ${trip?.name || trip_id}`,
    public_token: token, created_by: verified_by,
    customer_name: cust?.name || null,
    customer_phone: cust?.phone || cust?.whatsapp || null, // R205: fallback ke whatsapp
    customer_email: cust?.email || null,
    trip_name: trip?.name || null, trip_kode: trip?.kode_trip || null,
    family_group_id: family_group_id || null,
    covers_passenger_ids: is_family_invoice && Array.isArray(covers_passenger_ids) ? covers_passenger_ids : [],
    is_family_invoice: !!is_family_invoice,
    passenger_amounts: passenger_amounts && typeof passenger_amounts === 'object' ? passenger_amounts : {},
  };

  let { data, error } = await supabase.from('invoices').insert(payload).select('id, invoice_no, public_token').single();

  if (error && /family_group_id|covers_passenger_ids|is_family_invoice|passenger_amounts/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.family_group_id;
    delete stripped.covers_passenger_ids;
    delete stripped.is_family_invoice;
    delete stripped.passenger_amounts;
    const retry = await supabase.from('invoices').insert(stripped).select('id, invoice_no, public_token').single();
    data = retry.data; error = retry.error;
  }
  // Retry kalau nomor invoice bentrok (unique invoice_no)
  let dupTries2 = 0;
  while (error && /invoice_no|duplicate key|23505/i.test(error.message || '') && dupTries2 < 5) {
    dupTries2++;
    payload.invoice_no = await generateInvoiceNo(supabase, trip_id, dupTries2);
    const r3 = await supabase.from('invoices').insert(payload).select('id, invoice_no, public_token').single();
    data = r3.data; error = r3.error;
  }
  if (error) return { error: error.message };

  await supabase.from('invoice_payments').insert({
    invoice_id: data.id, amount: Number(amount) || 0,
    payment_date: payment_date || new Date().toISOString().slice(0, 10),
    payment_method: 'verified_manual', status: 'verified',
    verified_by, verified_at: new Date().toISOString(),
    note_from_customer: 'Receipt — sudah dibayar saat invoice digenerate',
  });

  await syncInvoiceToMatrix(supabase, {
    invoice_no: data.invoice_no, passenger_id, milestone,
    is_family_invoice: !!is_family_invoice,
    covers_passenger_ids: Array.isArray(covers_passenger_ids) ? covers_passenger_ids : [],
    passenger_amounts: passenger_amounts && typeof passenger_amounts === 'object' ? passenger_amounts : {},
  }, Number(amount) || 0);

  revalidateAll(trip_id);
  return { ok: true, invoice_id: data.id, invoice_no: data.invoice_no, token: data.public_token };
}

// ============================================================
// INVOICE MANUAL (di luar trip) — mis. Visa Only, Asuransi, dll.
// ============================================================
export async function createManualInvoice(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const customer_name = (formData.get('customer_name') || '').toString().trim();
  const customer_phone = (formData.get('customer_phone') || '').toString().trim() || null;
  const customer_email = (formData.get('customer_email') || '').toString().trim() || null;
  const milestone = (formData.get('milestone') || '').toString().trim() || 'Tagihan';
  const description = (formData.get('description') || '').toString().trim() || null;
  const amount = parseInt(String(formData.get('amount') || '').replace(/\D/g, '')) || 0;
  const due_date = formData.get('due_date') || null;

  if (!customer_name) return { error: 'Nama wajib diisi' };
  if (amount <= 0) return { error: 'Jumlah harus lebih dari 0' };

  // Nomor invoice manual (trip_id null) — pakai nomor tertinggi + 1 (kebal terhadap invoice yg dihapus)
  const manPrefix = getBrandCodeSafe() === 'khasanah' ? 'KT' : 'TEONE';
  const { data: manRows } = await supabase.from('invoices').select('invoice_no').is('trip_id', null).like('invoice_no', `${manPrefix}-INV-%`);
  let maxMan = 0;
  for (const r of (manRows || [])) {
    const m = String(r.invoice_no || '').match(/(\d+)\s*$/);
    if (m) { const n = parseInt(m[1], 10); if (Number.isFinite(n) && n > maxMan) maxMan = n; }
  }
  let invoice_no = `${manPrefix}-INV-${String(maxMan + 1).padStart(4, '0')}`;
  const token = genToken();

  const payload = {
    invoice_no, trip_id: null, passenger_id: null, customer_id: null,
    milestone, amount, due_date: due_date || null, status: 'sent',
    description: description || milestone,
    public_token: token,
    created_by: user.user_metadata?.full_name || user.email || 'unknown',
    customer_name, customer_phone, customer_email,
    trip_name: null, trip_kode: null,
  };

  let { data, error } = await supabase.from('invoices').insert(payload).select('id, invoice_no, public_token').single();
  let mTries = 0;
  while (error && /invoice_no|duplicate key|23505/i.test(error.message || '') && mTries < 5) {
    mTries++;
    payload.invoice_no = `${manPrefix}-INV-${String(maxMan + 1 + mTries).padStart(4, '0')}`;
    const r = await supabase.from('invoices').insert(payload).select('id, invoice_no, public_token').single();
    data = r.data; error = r.error;
  }
  if (error) return { error: error.message };

  revalidatePath('/invoices');
  return { ok: true, invoice_id: data.id, invoice_no: data.invoice_no, token: data.public_token };
}
