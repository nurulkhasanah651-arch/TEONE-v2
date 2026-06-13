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

  // peserta di master trip (idempotent)
  let passengerId = null;
  if (customerId) {
    const { data: existing } = await db.from('trip_passengers')
      .select('id, lead_source, closing_date, price_paid, room_type')
      .eq('trip_id', booking.trip_id).eq('customer_id', customerId)
      .neq('transfer_status', 'transferred').limit(1).maybeSingle();
    const fullPrice = roomPriceFor(trip, booking.room_type) || Number(booking.amount) || 0;
    if (existing) {
      passengerId = existing.id;
      const upd = {};
      if (!existing.room_type && booking.room_type) upd.room_type = booking.room_type;
      if (!existing.price_paid) upd.price_paid = fullPrice;
      if (!existing.lead_source) upd.lead_source = 'website';
      if (!existing.closing_date) upd.closing_date = today();
      if (Object.keys(upd).length) await db.from('trip_passengers').update(upd).eq('id', existing.id);
    } else {
      const { data: p } = await db.from('trip_passengers').insert({
        trip_id: booking.trip_id, customer_id: customerId,
        room_type: booking.room_type || null, price_paid: fullPrice,
        status: 'confirmed', lead_source: 'website', closing_date: today(),
      }).select('id').single();
      passengerId = p?.id || null;
    }
  }

  // participant_payments → Proyeksi Income (idempotent via notes order_code)
  let paymentId = null;
  if (passengerId) {
    const payType = booking.payment_type === 'full' ? 'Pelunasan' : 'DP';
    const { data: dup } = await db.from('participant_payments').select('id').eq('passenger_id', passengerId).eq('notes', booking.order_code).limit(1).maybeSingle();
    if (dup) paymentId = dup.id;
    else {
      const { data: pay } = await db.from('participant_payments').insert({
        passenger_id: passengerId, type: payType, label: 'Midtrans (web)',
        amount: Number(booking.amount) || 0, paid_at: today(), notes: booking.order_code, created_by: 'website',
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
