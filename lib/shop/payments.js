// Rencana pembayaran peserta web — mengikuti payment_template (milestone P1, P2, ... Pelunasan)
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { getExpectedAndPaidForPassenger } from '@/lib/actions/invoices';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Urutan milestone pokok
export const POKOK_ORDER = ['DP', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'Pelunasan'];

// Bangun rencana pembayaran sebuah booking (per milestone, total = perPax × jumlah peserta)
export async function getBookingPaymentPlan(booking) {
  const db = svc();
  if (!db || !booking) return null;
  const { data: trip } = await db.from('trips').select('id, name, kode_trip, dp_amount, payment_template, payment_deadlines, departure, return_date').eq('id', booking.trip_id).maybeSingle();
  const tpl = (trip?.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};

  // peserta booking ini
  const { data: pax } = await db.from('trip_passengers').select('id').eq('room_notes', 'web:' + booking.order_code);
  const pids = (pax || []).map((p) => p.id);
  const paxCount = pids.length || Number(booking.pax_count) || 1;

  // pembayaran yg sudah ada
  let payments = [];
  if (pids.length) {
    const { data } = await db.from('participant_payments').select('type, amount, passenger_id').in('passenger_id', pids);
    payments = data || [];
  }
  const paidCountByType = {};
  for (const p of payments) paidCountByType[p.type] = (paidCountByType[p.type] || 0) + 1;

  // susun milestone: DP (dari dp_amount) + yg ada di template (pokok)
  const milestones = [];
  for (const type of POKOK_ORDER) {
    let perPax = 0;
    if (type === 'DP') perPax = Number(trip?.dp_amount) || 0;
    else if (tpl[type] != null) perPax = Number(tpl[type]) || 0;
    else continue;
    if (perPax <= 0 && type !== 'DP') continue;
    const paid = (paidCountByType[type] || 0) >= paxCount && paxCount > 0;
    milestones.push({ type, label: type === 'DP' ? 'DP' : type === 'Pelunasan' ? 'Pelunasan' : `Cicilan ${type}`, perPax, total: perPax * paxCount, paid });
  }
  const nextUnpaid = milestones.find((m) => !m.paid && m.total > 0) || null;

  // Deadline ditampilkan dari yang diisi CS (trip.payment_deadlines = {type: 'YYYY-MM-DD'}).
  const dlMap = (trip?.payment_deadlines && typeof trip.payment_deadlines === 'object') ? trip.payment_deadlines : {};
  for (const m of milestones) { m.deadline = dlMap[m.type] || null; }

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const milestoneTotal = milestones.reduce((s, m) => s + m.total, 0);
  const sisa = Math.max(milestoneTotal - totalPaid, 0);

  // POKOK (sinkron checklist/invoice): total harga, sudah dibayar pokok, sisa — agregat semua peserta booking
  let pokokTotal = 0, pokokPaid = 0, pokokSisa = 0;
  for (const pid of pids) {
    try {
      const e = await getExpectedAndPaidForPassenger(db, booking.trip_id, pid);
      pokokTotal += Number(e.expectedTotal) || 0;
      pokokPaid += Number(e.pokokPaid) || 0;
    } catch {}
  }
  // Sisa dihitung di level booking (bukan jumlah sisa per-peserta yg di-clamp >=0),
  // supaya kelebihan bayar 1 peserta menutup kekurangan peserta lain dalam 1 keluarga.
  // Tanpa ini, diskon pada satu peserta bisa menyisakan "sisa" palsu walau total sudah lunas.
  pokokSisa = Math.max(pokokTotal - pokokPaid, 0);

  return { paxCount, milestones, nextUnpaid, totalPaid, milestoneTotal, sisa, pokokTotal, pokokPaid, pokokSisa, trip };
}
