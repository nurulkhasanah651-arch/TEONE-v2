// Fulfillment: saat pembayaran web BERHASIL → sinkron ke sistem internal.
// 1) bookings → paid  2) peserta masuk trip_passengers  3) participant_payments (Income)
// 4) accounting cash-in (Real Cashflow)  5) cs_daily_closings (lead_source=website)  6) seat
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { roomPriceFor, ADMIN_FEE, ADMIN_FEE_ONLINE } from '@/lib/shop/data';
import { adminFeeFromLabel } from '@/lib/shop/payment-fee';
import { sendFonnte } from '@/lib/utils/fonnte';
import { isPicWaManualForTrip } from '@/lib/auth/pic-scope';
import { getPicFonnteTokenById, getPicNameForTrip } from '@/lib/auth/pic-scope';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { getTransactionStatus, mapTransactionStatus, midtransMethodLabel } from '@/lib/midtrans';
import { mainExpectedPerPassenger, isPokokMilestone, visaPriceTpl } from '@/lib/utils/price-breakdown';
import { currentBrandCode, runWithBrand } from '@/lib/supabase/service-env';
import { plainForBrand } from '@/lib/utils/wa-plain';
import { trySendWabaForTrip } from '@/lib/utils/waba-send';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // WIB (UTC+7)
function rp(n){ return 'Rp ' + Number(n||0).toLocaleString('id-ID'); }
const SPECIAL_AGE = { child_no_bed: 'child_no_bed', infant: 'infant' };
function parseNotes(b) { try { const j = JSON.parse(b?.notes || '{}'); return (j && typeof j === 'object') ? j : {}; } catch { return {}; } }

// Kirim WA, ATAU antrekan kalau PIC trip-nya kirim manual (Khasanah tanpa nomor cadangan).
// Balikan true kalau diantrekan (tidak dikirim).
async function sendOrQueueWA(db, tripId, phone, message, opts = {}) {
  // Konfirmasi pembayaran: coba TEMPLATE konfirmasi (bisa ke peserta yang belum pernah chat)
  // dari nomor PIC via Api.co.id. Kalau ter-handle, selesai.
  if (opts.passengerId) {
    try {
      const _wpn = await import('@/lib/actions/wa-payment-notif');
      const _r = await _wpn.sendPaymentReceivedWA(opts.passengerId, false, { system: true });
      if (_r && !_r.error) return false;
    } catch {}
  }
  try {
    if (tripId && await isPicWaManualForTrip(db, tripId)) {
      // Coba WABA resmi dulu (PIC bernomor WABA, mis. Anis).
      const _waba = await trySendWabaForTrip(db, tripId, phone, message, { context: opts.context || 'finance', kind: 'waba_online' });
      if (_waba?.ok) return false;
      await db.from('wa_outbox').insert({
        brand: currentBrandCode(),
        context: opts.context || 'finance',
        kind: opts.kind || 'manual_pending_online',
        status: 'pending',
        target_phone: phone || null,
        message: message || null,
        trip_id: tripId || null,
        meta: opts.meta || null, // { customer_name, payment_type, amount, method, paid_at }
        reason: 'PIC kirim manual — nomor WA PIC belum tersambung',
      });
      return true;
    }
  } catch {}
  await sendFonnte(phone, message, opts.fonnte || {});
  return false;
}

export async function fulfillPaidBooking(orderCode, method) {
  const db = svc();
  if (!db) return { error: 'no_service' };

  const { data: booking } = await db.from('bookings').select('*').eq('order_code', orderCode).maybeSingle();
  if (!booking) return { error: 'booking_not_found' };
  if (booking.status === 'paid') return { skipped: 'already_paid' };

  const { data: trip } = await db.from('trips').select('*').eq('id', booking.trip_id).maybeSingle();

  // pastikan customer
  let customerId = booking.customer_id;
  if (!customerId) {
    const np = String(booking.lead_phone || '').replace(/\D/g, '').replace(/^0/, '62');
    if (np) {
      const { data } = await db.from('customers').select('id').eq('phone', np).limit(1).maybeSingle();
      if (data) customerId = data.id;
      else {
        const { data: c } = await db.from('customers').insert({ name: booking.lead_name, phone: np, whatsapp: np, email: booking.lead_email || null }).select('id').single();
        customerId = c?.id || null;
      }
    }
  }

  // peserta di master trip — 1 baris per orang (customer berbeda tiap orang biar tidak bentrok
  // unique trip+customer). Jika >=2 orang → otomatis dibuat 1 grup Family. Idempotent: dijaga
  // guard booking.status==='paid' di atas + pengecekan family group/notes.
  const meta = parseNotes(booking);
  const incVisaFlag = !!meta.include_visa || trip?.visa_requirement === 'group';
  const visaReadyFlag = !!meta.visa_ready;
  const visaTypeVal = meta.visa_type || null;
  const incAsuransiFlag = !!meta.include_asuransi;
  const adminFee = Number(meta.admin_fee || 0);
  let paxList = Array.isArray(meta.pax_list) ? meta.pax_list : [];
  if (!paxList.length) {
    const comp = Array.isArray(meta.composition) ? meta.composition : [];
    for (const it of comp) { const q = Math.max(parseInt(it.qty) || 0, 0); for (let k = 0; k < q; k++) paxList.push({ key: it.key, label: it.label, name: '', price: Number(it.price) || 0 }); }
  }
  if (!paxList.length) paxList = [{ key: null, label: booking.room_type || 'Paket', name: booking.lead_name, price: roomPriceFor(trip, booking.room_type) || 0 }];

  function specOf(px) {
    const isSpecial = !!SPECIAL_AGE[px.key];
    return {
      room_type: px.key === 'land_tour_only' ? 'Land Tour Only' : px.label,
      age_type: SPECIAL_AGE[px.key] || null,
      price_paid: Number(px.price) || 0,
    };
  }

  const isFull = booking.payment_type === 'full';
  const dpPer = Number(trip?.dp_amount) || 0;
  const perPaxDp = dpPer > 0 ? dpPer : Math.round((Number(booking.amount) - adminFee) / Math.max(paxList.length, 1));
  let firstPaymentId = null;

  let passengerId = null;
  const createdPids = [];
  // idempotensi sederhana: tandai lewat family group "Order <code>" / notes peserta
  const marker = 'web:' + booking.order_code;
  const { count: alreadyCount } = await db.from('trip_passengers')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', booking.trip_id).eq('room_notes', marker);

  if (customerId && !alreadyCount) {
    for (let idx = 0; idx < paxList.length; idx++) {
      const px = paxList[idx];
      const sp = specOf(px);
      // customer: orang pertama pakai customer pemesan; sisanya buat customer baru (nomor HP sama boleh)
      let cid = null;
      const pName = (px.name || '').trim() || (idx === 0 ? booking.lead_name : `${booking.lead_name} (${idx + 1})`);
      if (idx === 0) {
        // Kalau akun ini SUDAH punya peserta di trip ini (mis. booking ke-2 dgn akun yg sama),
        // buat customer baru utk peserta ini — jangan timpa nama akun & hindari unique constraint
        // (trip_id, customer_id) yg bikin peserta ke-2 gagal & pembayarannya hilang.
        const { count: _existCust } = await db.from('trip_passengers')
          .select('id', { count: 'exact', head: true })
          .eq('trip_id', booking.trip_id).eq('customer_id', customerId);
        if (_existCust && _existCust > 0) {
          try {
            const { data: nc } = await db.from('customers').insert({ name: pName, phone: booking.lead_phone || null, whatsapp: booking.lead_phone || null }).select('id').single();
            cid = nc?.id || null;
          } catch { cid = null; }
        } else {
          // JANGAN timpa nama akun. Kalau nama peserta beda dgn nama akun (mis. daftarin teman),
          // buat customer BARU utk peserta ini — nama akun & trip lama tetap utuh.
          let _accName = '';
          try { const { data: acc } = await db.from('customers').select('name').eq('id', customerId).maybeSingle(); _accName = (acc?.name || '').trim(); } catch {}
          if (!_accName) {
            // akun belum punya nama -> set sekali pakai nama peserta
            cid = customerId;
            try { await db.from('customers').update({ name: pName }).eq('id', cid); } catch {}
          } else if (_accName.toLowerCase() === pName.toLowerCase()) {
            cid = customerId; // nama sama -> pakai akun, tidak diubah
          } else {
            // nama beda -> customer baru, nama akun TIDAK diubah
            try {
              const { data: nc } = await db.from('customers').insert({ name: pName, phone: booking.lead_phone || null, whatsapp: booking.lead_phone || null }).select('id').single();
              cid = nc?.id || null;
            } catch { cid = null; }
          }
        }
      } else {
        try {
          const { data: nc } = await db.from('customers').insert({ name: pName, phone: booking.lead_phone || null, whatsapp: booking.lead_phone || null }).select('id').single();
          cid = nc?.id || null;
        } catch { cid = null; }
      }
      if (!cid) continue;
      const { data: p } = await db.from('trip_passengers').insert({
        trip_id: booking.trip_id, customer_id: cid,
        room_type: sp.room_type, age_type: sp.age_type, price_paid: sp.price_paid,
        status: 'confirmed', lead_source: 'website', closing_date: today(), room_notes: marker,
        include_visa: incVisaFlag, visa_ready: visaReadyFlag, include_asuransi: incAsuransiFlag, visa_type: visaTypeVal,
      }).select('id').single();
      if (p?.id) {
        createdPids.push({ pid: p.id, cid });
        if (!passengerId) passengerId = p.id;
        // catat pembayaran PER peserta: DP per orang, atau pelunasan = harga pokoknya
        try {
          const { data: pay } = await db.from('participant_payments').insert({
            passenger_id: p.id, type: isFull ? 'Pelunasan' : 'DP', label: `Online${method ? ' · ' + method : ''}`,
            amount: isFull ? (Number(sp.price_paid) || 0) : perPaxDp,
            paid_at: today(), notes: booking.order_code, created_by: 'website',
          }).select('id').maybeSingle();
          if (pay?.id && !firstPaymentId) firstPaymentId = pay.id;
        } catch {}
      }
    }

    // grup Family kalau >= 2 orang
    if (createdPids.length >= 2) {
      try {
        const head = createdPids[0];
        const { data: fg } = await db.from('family_groups').insert({
          trip_id: booking.trip_id, name: `Keluarga ${booking.lead_name || 'Web'}`,
          head_passenger_id: head.pid, head_customer_id: head.cid, created_by: 'website',
          notes: 'Order ' + booking.order_code,
        }).select('id').single();
        if (fg?.id) {
          for (const cp of createdPids) {
            await db.from('trip_passengers').update({ family_group_id: fg.id, is_family_head: cp.pid === head.pid }).eq('id', cp.pid);
          }
        }
      } catch { /* family best-effort */ }
    }
  } else if (alreadyCount) {
    const { data: any } = await db.from('trip_passengers').select('id').eq('trip_id', booking.trip_id).eq('room_notes', marker).limit(1).maybeSingle();
    passengerId = any?.id || null;
  }

  // SELF-HEAL (permanen): paksa price_paid tiap peserta web = harga paket dari komposisi.
  // Cegah nominal DP/total nyangkut di price_paid (pernah terjadi pada kepala keluarga).
  try {
    const priceByLabel = {};
    for (const px of paxList) {
      const lbl = px.key === 'land_tour_only' ? 'Land Tour Only' : (px.label || '');
      const pr = Number(px.price) || 0;
      if (lbl && pr > 0 && priceByLabel[lbl] == null) priceByLabel[lbl] = pr;
    }
    const { data: marked } = await db.from('trip_passengers')
      .select('id, room_type, price_paid')
      .eq('trip_id', booking.trip_id).eq('room_notes', marker);
    for (const mp of (marked || [])) {
      const want = priceByLabel[mp.room_type];
      if (want != null && Number(mp.price_paid) !== want) {
        await db.from('trip_passengers').update({ price_paid: want }).eq('id', mp.id);
      }
    }
  } catch { /* self-heal best-effort */ }

  // R230: bersihkan peserta "hantu" dari akun pemesan — baris tanpa marker web (room_notes null)
  //        DAN tanpa pembayaran sama sekali. Cegah nama akun (mis. akun tes / akun login) nyangkut
  //        jadi peserta saat nama peserta yang di-input beda dari nama akun. Peserta asli (punya
  //        marker + pembayaran) TIDAK tersentuh.
  try {
    if (customerId) {
      const { data: _ghosts } = await db.from('trip_passengers')
        .select('id').eq('trip_id', booking.trip_id).eq('customer_id', customerId).is('room_notes', null);
      for (const _gp of (_ghosts || [])) {
        const { count: _pc } = await db.from('participant_payments')
          .select('id', { count: 'exact', head: true }).eq('passenger_id', _gp.id);
        if (!_pc) await db.from('trip_passengers').delete().eq('id', _gp.id);
      }
    }
  } catch { /* ghost-cleanup best-effort */ }

  // porsi trip (income) = total bayar - biaya admin
  const tripPortion = Math.max((Number(booking.amount) || 0) - adminFee, 0);

  // pembayaran sudah dicatat per-peserta di loop di atas. paymentId utk link accounting.
  let paymentId = firstPaymentId;
  if (!paymentId) {
    const { data: anyPay } = await db.from('participant_payments').select('id').eq('notes', booking.order_code).limit(1).maybeSingle();
    paymentId = anyPay?.id || null;
  }

  // accounting cash-in → Real Cashflow (best-effort)
  try {
    if (paymentId && Number(booking.amount) > 0) {
      const { data: accs } = await db.from('accounts').select('id, type, active');
      const active = (accs || []).filter((a) => a.active !== false);
      const acct = active.find((a) => a.type === 'bank') || active[0];
      if (acct) {
        const tripLabel = trip?.kode_trip ? ' - ' + trip.kode_trip : '';
        // Catatan: pembayaran peserta TIDAK dibuat entri accounting terpisah, karena sudah
        // dihitung lewat participant_payments (Cash In Peserta Real). Hindari dobel hitung.
        // Hanya biaya admin web yang dicatat di accounting (tidak ada di participant_payments).
        const adminActual = adminFeeFromLabel(method, tripPortion, { dpWeb: true });
        if (adminActual > 0) {
          const { data: existAdm } = await db.from('accounting_entries').select('id').eq('category', 'Biaya Admin Web').ilike('description', `%${booking.order_code}%`).limit(1).maybeSingle();
          if (!existAdm) {
            await db.from('accounting_entries').insert({
              type: 'in', amount: adminActual, category: 'Biaya Admin Web',
              description: `Biaya admin web - ${booking.order_code}${tripLabel}`,
              trip_id: booking.trip_id, account_id: acct.id, date: today(), created_by: 'website',
            });
          }
        }
      }
    }
  } catch { /* non-fatal */ }

  // cs_daily_closings → rekap CS (best-effort, lead_source=website)
  try {
    const { data: existClose } = await db.from('cs_daily_closings').select('id').eq('trip_id', booking.trip_id).eq('notes', 'Order ' + booking.order_code).limit(1).maybeSingle();
    if (!existClose) {
      // find/create daily update untuk trip+tanggal
      let csDailyId = null;
      const pax = Number(booking.pax_count) || 1;
      const { data: du } = await db.from('cs_daily_updates').select('id, from_website, total_terjual_hari_ini').eq('tanggal', today()).eq('trip_id', booking.trip_id).limit(1).maybeSingle();
      if (du) {
        csDailyId = du.id;
        await db.from('cs_daily_updates').update({
          from_website: (Number(du.from_website) || 0) + pax,
          total_terjual_hari_ini: (Number(du.total_terjual_hari_ini) || 0) + pax,
        }).eq('id', du.id);
      } else {
        const { data: ndu } = await db.from('cs_daily_updates').insert({ tanggal: today(), trip_id: booking.trip_id, trip_name: trip?.name || null, updated_by: 'website', from_website: pax, total_terjual_hari_ini: pax }).select('id').maybeSingle();
        csDailyId = ndu?.id || null;
      }
      await db.from('cs_daily_closings').insert({
        cs_daily_id: csDailyId, trip_id: booking.trip_id, customer_id: customerId,
        customer_name: booking.lead_name, customer_phone: booking.lead_phone, customer_email: booking.lead_email || null,
        source: 'website', price_paid: Number(booking.amount) || 0, room_type: booking.room_type || null,
        notes: 'Order ' + booking.order_code, created_by: 'website',
      });
    }
  } catch { /* non-fatal */ }

  // recompute seat
  try {
    const { count } = await db.from('trip_passengers').select('id', { count: 'exact', head: true }).eq('trip_id', booking.trip_id);
    const quota = trip?.quota || 0;
    await db.from('trips').update({ sold: count || 0, seat_left: Math.max(quota - (count || 0), 0) }).eq('id', booking.trip_id);
  } catch { /* non-fatal */ }

  // tandai booking paid
  await db.from('bookings').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', booking.id);

  // WA konfirmasi ke peserta via Fonnte (best-effort)
  try {
    if (booking.lead_phone) {
      const code = currentBrandCode();
      const base = customerSiteUrlFor(code);
      const subtotal = Number(meta.subtotal || 0);
      const sisa = Math.max(subtotal - tripPortion, 0);
      const isFull = booking.payment_type === 'full';
      const lines = [
        '*Konfirmasi Pembayaran Diterima* ✅',
        '',
        `Halo *${booking.lead_name || 'Kak'}*, pembayaran untuk trip berikut sudah kami terima 🙏`,
        '',
        `🧳 *${trip?.kode_trip ? trip.kode_trip + ' — ' : ''}${trip?.name || 'Trip'}*`,
        `🧾 No Order: *${booking.order_code}*`,
        `👥 Peserta: ${booking.pax_count} orang (${booking.room_type || '-'})`,
        `💳 Dibayar: *${rp(booking.amount)}* (${isFull ? 'Lunas' : 'DP'})`,
      ];
      if (!isFull && sisa > 0) lines.push(`🧾 Sisa pelunasan: *${rp(sisa)}* (dibayar bertahap)`);
      lines.push('', `Pantau status & trip kamu di:`, `${base}/akun`, '', `Ada pertanyaan? Chat CS kami di sini.`, '', 'Terima kasih 🙏');
      await sendOrQueueWA(db, booking.trip_id, booking.lead_phone, lines.join('\n'), {
        context: 'cs', kind: 'manual_pending_online', passengerId,
        meta: { customer_name: booking.lead_name || '', payment_type: isFull ? 'Pelunasan' : 'DP', amount: Number(booking.amount) || 0, method: method || '', paid_at: new Date().toISOString() },
        fonnte: { context: 'cs', brand: currentBrandCode(), token: currentBrandCode() === 'khasanah' ? await getPicFonnteTokenById(db, booking.trip_id) : null },
      }); // DP pertama web: TEONE=nomor CS, Khasanah=PIC / antre manual
    }
  } catch { /* WA best-effort */ }

  return { ok: true, passengerId, paymentId };
}


// Bayar lanjutan (milestone) berhasil → catat pembayaran per peserta + kas. Tidak buat peserta/closing baru.
export async function recordMilestonePayment(orderCode, milestoneType, method) {
  const db = svc();
  if (!db) return { error: 'no_service' };
  const { data: booking } = await db.from('bookings').select('*').eq('order_code', orderCode).maybeSingle();
  if (!booking) return { error: 'booking_not_found' };
  const { data: trip } = await db.from('trips').select('id, kode_trip, dp_amount, payment_template').eq('id', booking.trip_id).maybeSingle();
  const tpl = (trip?.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};
  const perPax = milestoneType === 'DP' ? (Number(trip?.dp_amount) || 0) : (Number(tpl[milestoneType]) || 0);
  if (perPax <= 0) return { error: 'no_amount' };

  const { data: pax } = await db.from('trip_passengers').select('id').eq('room_notes', 'web:' + orderCode);
  const pids = (pax || []).map((p) => p.id);
  if (!pids.length) return { error: 'no_passengers' };

  const noteMark = `${orderCode}:${milestoneType}`;
  const { count: already } = await db.from('participant_payments').select('id', { count: 'exact', head: true }).eq('notes', noteMark);
  if (already) return { skipped: 'already' };

  let firstPaymentId = null;
  for (const pid of pids) {
    const { data: p } = await db.from('participant_payments').insert({
      passenger_id: pid, type: milestoneType, label: `Online${method ? ' · ' + method : ''}`,
      amount: perPax, paid_at: today(), notes: noteMark, created_by: 'website',
    }).select('id').maybeSingle();
    if (p?.id && !firstPaymentId) firstPaymentId = p.id;
  }

  // kas: Payment Peserta (total termin) + Biaya Admin Web
  try {
    const { data: accs } = await db.from('accounts').select('id, type, active');
    const active = (accs || []).filter((a) => a.active !== false);
    const acct = active.find((a) => a.type === 'bank') || active[0];
    if (acct) {
      const tripLabel = trip?.kode_trip ? ' - ' + trip.kode_trip : '';
      // pembayaran peserta sudah di participant_payments → tidak buat entri accounting (hindari dobel)
      const adminAmt = adminFeeFromLabel(method, perPax * pids.length, { dpWeb: false });
      const { data: exA } = await db.from('accounting_entries').select('id').eq('category', 'Biaya Admin Web').ilike('description', `%${orderCode} ${milestoneType}%`).limit(1).maybeSingle();
      if (!exA && adminAmt > 0) {
        await db.from('accounting_entries').insert({ type: 'in', amount: adminAmt, category: 'Biaya Admin Web', description: `Biaya admin web - ${orderCode} ${milestoneType}${tripLabel}`, trip_id: booking.trip_id, account_id: acct.id, date: today(), created_by: 'website' });
      }
    }
  } catch {}

  // WA konfirmasi
  try {
    if (booking.lead_phone) {
      const base = customerSiteUrlFor(currentBrandCode());
      const total = perPax * pids.length;
      // Tanda terima resmi → link INVOICE peserta (bukan /akun). Prefer invoice milestone yg cocok.
      let receiptLink = `${base}/akun`;
      try {
        const { data: invs } = await db.from('invoices')
          .select('public_token, milestone, created_at')
          .in('passenger_id', pids).not('public_token', 'is', null)
          .order('created_at', { ascending: false });
        const match = (invs || []).find((x) => String(x.milestone || '').toLowerCase().includes(String(milestoneType).toLowerCase())) || (invs || [])[0];
        if (match?.public_token) receiptLink = `${base}/invoice/${match.public_token}`;
      } catch {}
      const _picName = await getPicNameForTrip(db, booking.trip_id);
      const msg = plainForBrand([`*Pembayaran ${milestoneType} Diterima* ✅`, '',
        `Halo *${booking.lead_name || 'Kak'}*, pembayaran lanjutan untuk order *${booking.order_code}* sudah kami terima 🙏`,
        _picName ? `_Saya ${_picName}, PIC trip kamu._` : '',
        `💳 ${milestoneType}: *${rp(total)}*`, '', `Bukti pembayaran (tanda terima resmi) klik di sini 👇`, `🔗 ${receiptLink}`, '', 'Terima kasih 🙏'].filter(Boolean).join('\n'));
      await sendOrQueueWA(db, booking.trip_id, booking.lead_phone, msg, {
        context: 'finance', kind: 'manual_pending_online', passengerId: pids[0],
        meta: { customer_name: booking.lead_name || '', payment_type: milestoneType, amount: Number(total) || 0, method: method || '', paid_at: new Date().toISOString() },
        fonnte: { context: 'finance', brand: currentBrandCode(), token: await getPicFonnteTokenById(db, booking.trip_id) },
      }); // pembayaran lanjutan (P1/P2/P3) → nomor PIC, atau antre manual
    }
  } catch {}

  return { ok: true };
}


// Bayar online dari halaman invoice (peserta mana pun) berhasil → catat 1 pembayaran utk peserta itu.
export async function recordInvoiceMilestone(passengerId, type, amount, method) {
  const db = svc();
  if (!db) return { error: 'no_service' };
  const amt = Math.round(Number(amount) || 0);
  if (!passengerId || !type || amt <= 0) return { error: 'invalid' };

  const noteMark = `online-inv:${passengerId}:${type}`;
  const { count: already } = await db.from('participant_payments').select('id', { count: 'exact', head: true }).eq('passenger_id', passengerId).eq('notes', noteMark);
  if (already) return { skipped: 'already' };

  await db.from('participant_payments').insert({
    passenger_id: passengerId, type, label: `Online${method ? ' · ' + method : ''}`,
    amount: amt, paid_at: today(), notes: noteMark, created_by: 'website',
  });

  // WA konfirmasi ke peserta
  try {
    const { data: pax } = await db.from('trip_passengers').select('customer_id, trip_id').eq('id', passengerId).maybeSingle();
    if (pax?.customer_id) {
      const { data: c } = await db.from('customers').select('name, phone, whatsapp').eq('id', pax.customer_id).maybeSingle();
      const phone = c?.whatsapp || c?.phone;
      if (phone) {
        const base = customerSiteUrlFor(currentBrandCode());
        const msg = plainForBrand([`*Pembayaran ${type} Diterima* ✅`, '', `Halo *${c?.name || 'Kak'}*, pembayaran *${rp(amt)}* untuk trip kamu sudah kami terima 🙏`, '', 'Terima kasih 🙏'].join('\n'));
        await sendOrQueueWA(db, pax.trip_id, phone, msg, {
          context: 'finance', kind: 'manual_pending_online', passengerId,
          meta: { customer_name: c?.name || '', payment_type: type, amount: Number(amt) || 0, method: method || '', paid_at: new Date().toISOString() },
          fonnte: { context: 'finance', brand: currentBrandCode(), token: await getPicFonnteTokenById(db, pax.trip_id) },
        });
      }
    }
  } catch {}
  return { ok: true };
}


// Bayar online dari halaman invoice (mendukung Family) berhasil → kredit SEMUA anggota + tandai invoice lunas.
export async function applyInvoiceOnlinePaid(invoiceId, paidAmount, method) {
  const db = svc();
  if (!db) return { error: 'no_service' };
  const { data: inv } = await db.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (inv && inv.is_allin) return await applyInvoiceAllInPaid(invoiceId, paidAmount, method);
  if (!inv) return { error: 'invoice_not_found' };
  if (inv.paid_at) return { skipped: 'already' };

  const ids = (inv.is_family_invoice && Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length)
    ? inv.covers_passenger_ids
    : (inv.passenger_id ? [inv.passenger_id] : []);
  const perPaxMap = (inv.passenger_amounts && typeof inv.passenger_amounts === 'object') ? inv.passenger_amounts : {};
  const hasCustom = Object.keys(perPaxMap).length > 0;
  const milestone = inv.milestone || 'Pelunasan';
  const note = `Online invoice ${inv.invoice_no || inv.id}`;

  for (const pid of ids) {
    let amt = hasCustom ? (Number(perPaxMap[String(pid)] ?? perPaxMap[pid]) || 0)
                        : (ids.length > 1 ? Math.round((Number(inv.amount) || 0) / ids.length) : (Number(inv.amount) || 0));
    if (amt <= 0) continue;
    const { data: ex } = await db.from('participant_payments').select('id').eq('passenger_id', pid).eq('type', milestone).maybeSingle();
    if (ex) await db.from('participant_payments').update({ amount: amt, paid_at: today(), notes: note, label: `Online${method ? ' · ' + method : ''}`, }).eq('id', ex.id);
    else await db.from('participant_payments').insert({ passenger_id: pid, type: milestone, amount: amt, paid_at: today(), notes: note, created_by: 'website', label: `Online${method ? ' · ' + method : ''}`, });
  }

  await db.from('invoices').update({ paid_at: new Date().toISOString(), status: 'paid' }).eq('id', inv.id);

  // Biaya admin online = total dibayar (gross) - nominal invoice (pokok)
  const adminFeeInv = Math.max((Number(paidAmount) || 0) - (Number(inv.amount) || 0), 0);
  try {
    const { data: accs } = await db.from('accounts').select('id, type, active');
    const active = (accs || []).filter((a) => a.active !== false);
    const acct = active.find((a) => a.type === 'bank') || active[0];
    if (acct) {
      // Invoice MANUAL (tanpa peserta trip): pokok → "Invoice Manual"
      if (ids.length === 0) {
        await db.from('accounting_entries').insert({
          type: 'in', amount: Number(inv.amount) || 0, category: 'Invoice Manual',
          description: `${inv.invoice_no || 'Invoice'} · ${inv.milestone || ''}${method ? ' · ' + method : ''}`.trim(),
          trip_id: null, account_id: acct.id, date: today(), created_by: 'website',
        });
      }
      // Fee → "Biaya Admin Web" (3% utk CC / Rp6.000 / Rp13.000)
      if (adminFeeInv > 0) {
        const { data: exAdm } = await db.from('accounting_entries').select('id').eq('category', 'Biaya Admin Web').ilike('description', `%${inv.invoice_no || inv.id}%`).limit(1).maybeSingle();
        if (!exAdm) {
          await db.from('accounting_entries').insert({
            type: 'in', amount: adminFeeInv, category: 'Biaya Admin Web',
            description: `Biaya admin web - ${inv.invoice_no || inv.id}${method ? ' · ' + method : ''}`,
            trip_id: inv.trip_id || null, account_id: acct.id, date: today(), created_by: 'website',
          });
        }
      }
    }
  } catch (e) { /* best-effort */ }

  // WA konfirmasi ke pemesan/kepala
  try {
    const headPid = inv.passenger_id || ids[0];
    if (headPid) {
      const { data: pax } = await db.from('trip_passengers').select('customer_id').eq('id', headPid).maybeSingle();
      if (pax?.customer_id) {
        const { data: c } = await db.from('customers').select('name, phone, whatsapp').eq('id', pax.customer_id).maybeSingle();
        const phone = c?.whatsapp || c?.phone;
        if (phone) {
          const base = customerSiteUrlFor(currentBrandCode());
          const msg = plainForBrand([`*Pembayaran ${milestone} Diterima* ✅`, '', `Halo *${c?.name || 'Kak'}*, pembayaran *${rp(Number(paidAmount) || inv.amount)}*${ids.length > 1 ? ` untuk ${ids.length} peserta (keluarga)` : ''} sudah kami terima 🙏`, '', `Cek di: ${base}/invoice/${inv.public_token}`, '', 'Terima kasih 🙏'].join('\n'));
          await sendOrQueueWA(db, inv.trip_id, phone, msg, {
            context: 'finance', kind: 'manual_pending_online', passengerId: headPid,
            meta: { customer_name: c?.name || '', payment_type: milestone, amount: Number(paidAmount) || Number(inv.amount) || 0, method: method || '', paid_at: new Date().toISOString() },
            fonnte: { context: 'finance', brand: currentBrandCode(), token: await getPicFonnteTokenById(db, inv.trip_id) },
          });
        }
      }
    }
  } catch {}
  return { ok: true, credited: ids.length };
}


// Rekonsiliasi: bila booking masih pending tapi sudah settle di Midtrans (webhook telat/terlewat),
// proses fulfillment di konteks brand yang benar. Aman & idempotent (fulfillPaidBooking pakai marker).
export async function reconcilePendingBooking(code, booking) {
  if (!booking || booking.status === 'paid' || !booking.midtrans_order_id) return false;
  const st = await getTransactionStatus(code, booking.midtrans_order_id);
  if (!st) return false;
  if (mapTransactionStatus(st) !== 'paid') return false;
  const method = midtransMethodLabel(st.payment_type);
  await runWithBrand(code, async () => { await fulfillPaidBooking(booking.order_code, method); });
  return true;
}


// Rekonsiliasi invoice online (cicilan/pelunasan via /invoice): bila invoice belum lunas
// tapi sudah settle di Midtrans (webhook telat/terlewat), proses sekarang. Idempotent.
export async function reconcileInvoiceOnline(code, inv) {
  if (!inv || inv.paid_at || inv.status === 'paid' || !inv.midtrans_order_id) return false;
  const st = await getTransactionStatus(code, inv.midtrans_order_id);
  if (!st || mapTransactionStatus(st) !== 'paid') return false;
  const method = midtransMethodLabel(st.payment_type);
  const gross = Number(st.gross_amount) || Number(inv.amount) || 0;
  await runWithBrand(code, async () => {
    if (String(inv.midtrans_order_id || '').startsWith('INVALLIN')) await applyInvoiceAllInPaid(inv.id, gross, method);
    else await applyInvoiceOnlinePaid(inv.id, gross, method);
  });
  return true;
}


// === ALL-IN: hitung sisa total = pelunasan pokok + visa + asuransi (yang di-include & belum dibayar) ===
async function _invoiceMembers(db, inv) {
  if (inv.is_family && Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length) return inv.covers_passenger_ids;
  return inv.passenger_id ? [inv.passenger_id] : [];
}
export async function invoiceAllInOutstanding(invId) {
  const db = svc(); if (!db) return { total: 0, members: [] };
  const { data: inv } = await db.from('invoices').select('*').eq('id', invId).maybeSingle();
  if (!inv) return { total: 0, members: [] };
  const ids = await _invoiceMembers(db, inv);
  const { data: trip } = await db.from('trips').select('price_breakdown, payment_template').eq('id', inv.trip_id).maybeSingle();
  const bd = trip?.price_breakdown || {};
  const tpl = (trip?.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};
  const _vPrice = Number(tpl.Visa ?? tpl.visa) || Number(bd.visa) || 0;
  const _aPrice = Number(tpl.Asuransi ?? tpl.asuransi) || Number(bd.asuransi) || 0;
  // All-in varian "Pelunasan + Visa" (tanpa Asuransi): milestone sebut Visa tapi bukan Asuransi → jangan tagih/ catat asuransi
  const _visaOnlyAllIn = /visa/i.test(String(inv.milestone || '')) && !/asuransi/i.test(String(inv.milestone || ''));
  let total = 0; const members = [];
  for (const pid of ids) {
    const { data: pax } = await db.from('trip_passengers').select('id, room_type, age_type, price_paid, discount_amount, include_visa, include_asuransi, visa_ready, visa_type').eq('id', pid).maybeSingle();
    if (!pax) continue;
    const { data: pays } = await db.from('participant_payments').select('type, amount').eq('passenger_id', pid);
    // Khasanah: visa & asuransi WAJIB → sudah masuk pokok, tidak ditambahkan lagi.
    const _khBrand = currentBrandCode() === 'khasanah' ? 'khasanah' : '';
    const mainExp = mainExpectedPerPassenger(pax, bd, _khBrand);
    const disc = Number(pax.discount_amount) || 0;
    const pokokExp = Math.max(mainExp - disc, 0);
    const pokokPaid = (pays || []).filter((x) => isPokokMilestone(x.type)
      || (_khBrand && ['visa', 'asuransi'].includes(String(x.type).toLowerCase()))).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const pokok = Math.max(pokokExp - pokokPaid, 0);
    const hasVisaPay = (pays || []).some((x) => String(x.type).toLowerCase() === 'visa');
    const hasAsrPay = (pays || []).some((x) => String(x.type).toLowerCase() === 'asuransi');
    const visa = _khBrand ? 0 : ((pax.include_visa && !pax.visa_ready && !hasVisaPay) ? visaPriceTpl(tpl, bd, pax.visa_type) : 0);
    const asuransi = _khBrand ? 0 : ((!_visaOnlyAllIn && pax.include_asuransi && !hasAsrPay) ? _aPrice : 0);
    members.push({ pid, pokok, visa, asuransi });
    total += pokok + visa + asuransi;
  }
  return { total, members, invoice: inv };
}
export async function applyInvoiceAllInPaid(invId, paidAmount, method) {
  const db = svc(); if (!db) return { error: 'no_service' };
  const out = await invoiceAllInOutstanding(invId);
  const inv = out.invoice; if (!inv) return { error: 'invoice_not_found' };
  const note = `Online ALL-IN ${inv.invoice_no || inv.id}`;
  const lbl = `Online${method ? ' · ' + method : ''}`;
  for (const m of out.members) {
    const ins = async (type, amt) => {
      if (amt <= 0) return;
      const { data: ex } = await db.from('participant_payments').select('id').eq('passenger_id', m.pid).eq('type', type).maybeSingle();
      if (ex) await db.from('participant_payments').update({ amount: amt, paid_at: today(), notes: note, label: lbl }).eq('id', ex.id);
      else await db.from('participant_payments').insert({ passenger_id: m.pid, type, amount: amt, paid_at: today(), notes: note, created_by: 'website', label: lbl });
    };
    await ins('Pelunasan', m.pokok);
    await ins('Visa', m.visa);
    await ins('Asuransi', m.asuransi);
  }
  await db.from('invoices').update({ paid_at: new Date().toISOString(), status: 'paid' }).eq('id', inv.id);
  // WA konfirmasi lengkap ke kepala
  try {
    const headPid = inv.passenger_id || (out.members[0] && out.members[0].pid);
    if (headPid) { const { sendPaymentReceivedWA } = await import('@/lib/actions/wa-payment-notif'); await runWithBrand(currentBrandCode(), async () => { await sendPaymentReceivedWA(headPid, false, { system: true, queueManual: true, queueKind: 'manual_pending_online', meta: { payment_type: 'All-in', amount: Number(paidAmount) || 0, method: method || '', paid_at: new Date().toISOString() } }); }); }
  } catch {}
  return { ok: true };
}
