// Fulfillment: saat pembayaran web BERHASIL → sinkron ke sistem internal.
// 1) bookings → paid  2) peserta masuk trip_passengers  3) participant_payments (Income)
// 4) accounting cash-in (Real Cashflow)  5) cs_daily_closings (lead_source=website)  6) seat
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { roomPriceFor } from '@/lib/shop/data';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
const today = () => new Date().toISOString().slice(0, 10);
const SPECIAL_AGE = { child_no_bed: 'child_no_bed', infant: 'infant' };
function parseNotes(b) { try { const j = JSON.parse(b?.notes || '{}'); return (j && typeof j === 'object') ? j : {}; } catch { return {}; } }

export async function fulfillPaidBooking(orderCode) {
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

  // peserta di master trip — pecah dari komposisi (1 baris per orang). Idempotent: dijaga oleh
  // guard booking.status==='paid' di atas (sekali jalan).
  const meta = parseNotes(booking);
  const adminFee = Number(meta.admin_fee || 0);
  const comp = Array.isArray(meta.composition) ? meta.composition : [];
  let passengerId = null;
  if (customerId) {
    // bangun daftar peserta dari komposisi
    const specs = [];
    if (comp.length) {
      for (const it of comp) {
        const q = Math.max(parseInt(it.qty) || 0, 0);
        const isSpecial = !!SPECIAL_AGE[it.key] || it.key === 'land_tour_only';
        for (let i = 0; i < q; i++) {
          specs.push({
            room_type: SPECIAL_AGE[it.key] ? null : (it.key === 'land_tour_only' ? 'Land Tour Only' : it.label),
            age_type: SPECIAL_AGE[it.key] || null,
            price_paid: Number(it.price) || 0,
          });
        }
      }
    }
    if (!specs.length) {
      specs.push({ room_type: booking.room_type || null, age_type: null, price_paid: roomPriceFor(trip, booking.room_type) || 0 });
    }

    // cek apakah sudah pernah dibuat (hindari dobel jika fulfillment terpanggil 2x sebelum status paid)
    const { count: existCount } = await db.from('trip_passengers')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', booking.trip_id).eq('customer_id', customerId).eq('lead_source', 'website');
    if (!existCount) {
      for (const sp of specs) {
        const { data: p } = await db.from('trip_passengers').insert({
          trip_id: booking.trip_id, customer_id: customerId,
          room_type: sp.room_type, age_type: sp.age_type, price_paid: sp.price_paid,
          status: 'confirmed', lead_source: 'website', closing_date: today(),
        }).select('id').single();
        if (!passengerId) passengerId = p?.id || null;
      }
    } else {
      const { data: any } = await db.from('trip_passengers').select('id').eq('trip_id', booking.trip_id).eq('customer_id', customerId).limit(1).maybeSingle();
      passengerId = any?.id || null;
    }
  }
  // porsi trip (income) = total bayar - biaya admin
  const tripPortion = Math.max((Number(booking.amount) || 0) - adminFee, 0);

  // participant_payments → Proyeksi Income (idempotent via notes order_code)
  let paymentId = null;
  if (passengerId) {
    const payType = booking.payment_type === 'full' ? 'Pelunasan' : 'DP';
    const { data: dup } = await db.from('participant_payments').select('id').eq('passenger_id', passengerId).eq('notes', booking.order_code).limit(1).maybeSingle();
    if (dup) paymentId = dup.id;
    else {
      const { data: pay } = await db.from('participant_payments').insert({
        passenger_id: passengerId, type: payType, label: 'Midtrans (web)',
        amount: tripPortion, paid_at: today(), notes: booking.order_code, created_by: 'website',
      }).select('id').maybeSingle();
      paymentId = pay?.id || null;
    }
  }

  // accounting cash-in → Real Cashflow (best-effort)
  try {
    if (paymentId && Number(booking.amount) > 0) {
      const { data: accs } = await db.from('accounts').select('id, type, active');
      const active = (accs || []).filter((a) => a.active !== false);
      const acct = active.find((a) => a.type === 'bank') || active[0];
      if (acct) {
        const { data: exist } = await db.from('accounting_entries').select('id').eq('linked_payment_id', paymentId).limit(1).maybeSingle();
        if (!exist) {
          await db.from('accounting_entries').insert({
            type: 'in', amount: Number(booking.amount) || 0, category: 'Payment Peserta',
            description: `${booking.payment_type === 'full' ? 'Pelunasan' : 'DP'} web - ${booking.lead_name || 'peserta'}${trip?.kode_trip ? ' - ' + trip.kode_trip : ''}`,
            trip_id: booking.trip_id, account_id: acct.id, date: today(), created_by: 'website', linked_payment_id: paymentId,
          });
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
      const { data: du } = await db.from('cs_daily_updates').select('id').eq('tanggal', today()).eq('trip_id', booking.trip_id).limit(1).maybeSingle();
      if (du) csDailyId = du.id;
      else {
        const { data: ndu } = await db.from('cs_daily_updates').insert({ tanggal: today(), trip_id: booking.trip_id, trip_name: trip?.name || null, updated_by: 'website' }).select('id').maybeSingle();
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

  return { ok: true, passengerId, paymentId };
}
