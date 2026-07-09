// R157 + R194b + R215y⁴: Payment Checklist LIST + filter bulanan + status + search
// R215y⁴ FIX: SINKRON ke peserta aktif — exclude transferred + refunded (sama dgn trip detail page)
// Path: app/(app)/finance/payments/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import DownloadButtons from '@/components/common/DownloadButtons';
import PaymentChecklistTable from '@/components/finance/PaymentChecklistTable';
import { expectedPerPassenger } from '@/lib/utils/price-breakdown';
import { currentBrandCode } from '@/lib/supabase/service-env';
import { getPicScope, filterTripsForPic } from '@/lib/auth/pic-scope';

export const dynamic = 'force-dynamic';

export default async function PaymentsListPage() {
  const _brand = (() => { try { return currentBrandCode() || ''; } catch { return ''; } })();
  const supabase = createClient();

  const [tripsRes, passengersRes, paymentsRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, status, departure, quota, sold, price_breakdown, pic, pic_email').order('departure', { ascending: true }),
    // R215y⁴: tambah transfer_status + refund_status biar bisa filter peserta aktif
    fetchAll(() => supabase.from('trip_passengers').select('id, trip_id, price_paid, room_type, discount_amount, transfer_status, refund_status')),
    // R215y⁴: tambah is_transferred biar bisa exclude payment yg udah dipindah
    fetchAll(() => supabase.from('participant_payments').select('passenger_id, amount, type, is_transferred')),
  ]);

  let trips = tripsRes.data || [];
  // KHASANAH: PIC hanya lihat trip miliknya (teone tak terpengaruh — brand-gated di helper)
  { const { data: { user } } = await supabase.auth.getUser(); const scope = await getPicScope(supabase, user); trips = filterTripsForPic(trips, scope); }
  const allPassengers = passengersRes || [];
  const allPayments = paymentsRes || [];

  // R215y⁴: FILTER peserta aktif (exclude transferred + refunded) — sama dgn detail page
  const passengers = allPassengers.filter((p) => {
    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isTransferred && !isRefunded;
  });

  // R215y⁴: FILTER payment yg belum di-transfer (defensive — kalau column gak ada, treat as false)
  const payments = allPayments.filter((p) => p.is_transferred !== true);

  const paidByPassenger = {};
  const paymentsByPax = {};
  for (const p of payments) {
    paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
    if (!paymentsByPax[p.passenger_id]) paymentsByPax[p.passenger_id] = [];
    paymentsByPax[p.passenger_id].push(p);
  }

  // Breakdown per trip (sumber SAMA dgn halaman detail & cashflow: trips.price_breakdown)
  const breakdownByTrip = {};
  for (const t of trips) {
    breakdownByTrip[t.id] = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
  }

  const byTrip = {};
  for (const t of trips) {
    byTrip[t.id] = { ...t, expected: 0, paid: 0, paxCount: 0, lunasCount: 0 };
  }
  for (const p of passengers) {
    if (!byTrip[p.trip_id]) continue;
    // EXPECTED per peserta:
    // - kalau "Harga Bayar" (price_paid) sudah diisi → pakai itu (harga deal; trip lama TIDAK berubah)
    // - kalau kosong/0 → fallback proyeksi harga kamar master (+ addons − diskon), biar tidak 0
    const priceFixed = Number(p.price_paid) || 0;
    const exp = priceFixed > 0
      ? priceFixed
      : expectedPerPassenger(p, breakdownByTrip[p.trip_id], paymentsByPax[p.id] || [], _brand);
    const paid = paidByPassenger[p.id] || 0;
    byTrip[p.trip_id].expected += exp;
    byTrip[p.trip_id].paid += paid;
    byTrip[p.trip_id].paxCount++;
    if (exp > 0 && paid >= exp) {
      byTrip[p.trip_id].lunasCount++;
    }
  }

  const sorted = Object.values(byTrip).sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));

  const grandExpected = sorted.reduce((s, t) => s + t.expected, 0);
  const grandPaid = sorted.reduce((s, t) => s + t.paid, 0);
  const grandPax = sorted.reduce((s, t) => s + t.paxCount, 0);
  const grandLunas = sorted.reduce((s, t) => s + t.lunasCount, 0);

  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
  const downloadRows = sorted.map((t) => ({
    kode: t.kode_trip || `#${t.id}`,
    name: t.name,
    status: t.status,
    departure: t.departure || '-',
    pax: t.paxCount,
    expected: t.expected,
    paid: t.paid,
    sisa: t.expected - t.paid,
    progress: t.expected > 0 ? `${Math.round((t.paid / t.expected) * 100)}%` : '-',
    lunas: `${t.lunasCount}/${t.paxCount}`,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Payment Checklist Peserta</h1>
          <p className="mt-1 text-slate-600">Filter per bulan keberangkatan biar dashboard ga panjang.</p>
        </div>
        <DownloadButtons
          filename={`payment-status-semua-trip-${new Date().toISOString().slice(0,10)}`}
          title="Payment Status — Semua Trip"
          subtitle={`${sorted.length} trip · ${grandPax} pax aktif · ${grandLunas} lunas`}
          extraInfo={[
            { label: 'Total Expected', value: fmtMoney(grandExpected) },
            { label: 'Total Paid', value: fmtMoney(grandPaid) },
            { label: 'Total Sisa', value: fmtMoney(grandExpected - grandPaid) },
          ]}
          columns={[
            { key: 'kode', label: 'Kode Trip' },
            { key: 'name', label: 'Trip' },
            { key: 'status', label: 'Status' },
            { key: 'departure', label: 'Departure' },
            { key: 'pax', label: 'Pax', align: 'right' },
            { key: 'expected', label: 'Expected', align: 'right', format: 'rupiah' },
            { key: 'paid', label: 'Paid', align: 'right', format: 'rupiah' },
            { key: 'sisa', label: 'Sisa', align: 'right', format: 'rupiah' },
            { key: 'progress', label: 'Progress', align: 'right' },
            { key: 'lunas', label: 'Lunas', align: 'right' },
          ]}
          rows={downloadRows}
          summary={[
            { label: 'GRAND TOTAL EXPECTED', value: fmtMoney(grandExpected) },
            { label: 'GRAND TOTAL PAID', value: fmtMoney(grandPaid) },
            { label: 'GRAND TOTAL SISA', value: fmtMoney(grandExpected - grandPaid) },
          ]}
          buttonSize="md"
        />
      </div>

      {/* R194b: filter + table — client component */}
      <PaymentChecklistTable trips={sorted} />
    </div>
  );
}
