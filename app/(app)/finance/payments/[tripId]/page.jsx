// Payment Checklist per trip — template form + matrix
// Round 123: Filter peserta yang transferred/refunded (gak relevan lagi di trip ini)

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import PaymentTemplateForm from '@/components/finance/PaymentTemplateForm';
import PaymentMatrix from '@/components/finance/PaymentMatrix';

export const dynamic = 'force-dynamic';

export default async function TripPaymentsPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  // Fetch trip
  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  // ROUND 123: Fetch ONLY active passengers (exclude transferred + refunded)
  const { data: tp } = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  const allPassengers = tp || [];

  // Filter: exclude transferred + refunded
  const passengers = allPassengers.filter((p) => {
    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isTransferred && !isRefunded;
  });

  // Count untuk info
  const transferredCount = allPassengers.filter((p) => p.transfer_status === 'transferred').length;
  const refundedCount = allPassengers.filter((p) => p.refund_status === 'refunded' || p.refund_status === 'partial_refund').length;

  const passengerIds = passengers.map((p) => p.id);
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);

  // Customers
  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('id, name, phone').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }
  const passengersWithCustomers = passengers.map((p) => ({ ...p, customers: customerMap[p.customer_id] || null }));

  // ROUND 123: Payments — filter is_transferred (defensive)
  let paymentsByPassenger = {};
  if (passengerIds.length > 0) {
    let payments = [];
    try {
      const r = await supabase.from('participant_payments')
        .select('*')
        .in('passenger_id', passengerIds)
        .eq('is_transferred', false);
      payments = r.data || [];
    } catch {
      const r = await supabase.from('participant_payments')
        .select('*')
        .in('passenger_id', passengerIds);
      payments = r.data || [];
    }
    for (const p of payments) {
      if (!paymentsByPassenger[p.passenger_id]) paymentsByPassenger[p.passenger_id] = [];
      paymentsByPassenger[p.passenger_id].push(p);
    }
  }

  const template = (trip.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};
  const totalExpected = passengers.reduce((s, p) => s + (p.price_paid || 0), 0);
  const totalPaid = Object.values(paymentsByPassenger).flat().reduce((s, p) => s + (p.amount || 0), 0);
  const progress = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;
  const templateTotal = Object.values(template).reduce((s, v) => s + (+v || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <Link href="/finance/payments" className="text-sm text-brand-600 font-medium hover:underline">← Payment Checklist</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">Set template payment group → checklist tiap peserta.</p>
        {(transferredCount > 0 || refundedCount > 0) && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <span>ⓘ</span>
            {transferredCount > 0 && <span><b>{transferredCount}</b> peserta pindah trip (di-hide)</span>}
            {transferredCount > 0 && refundedCount > 0 && <span>·</span>}
            {refundedCount > 0 && <span><b>{refundedCount}</b> peserta refunded (di-hide)</span>}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Peserta Aktif" value={passengers.length} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Template / Pax" value={fmtRupiah(templateTotal)} color="text-purple-700" bg="bg-purple-50" small />
        <StatCard label="Total Paid" value={fmtRupiah(totalPaid)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Progress Total" value={`${progress}%`} color="text-blue-700" bg="bg-blue-50" />
      </div>

      <PaymentTemplateForm tripId={tripId} template={template} />

      <PaymentMatrix
        tripId={tripId}
        passengers={passengersWithCustomers}
        paymentsByPassenger={paymentsByPassenger}
        template={template}
      />
    </div>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
