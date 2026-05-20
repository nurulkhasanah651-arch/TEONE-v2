// Payment Checklist per trip — list peserta dengan payment timeline masing-masing

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import PaymentTimeline from '@/components/finance/PaymentTimeline';
import { PAYMENT_TYPES } from '@/lib/utils/payment-types';

export const dynamic = 'force-dynamic';

export default async function TripPaymentsPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  // Fetch trip
  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  // Fetch passengers (manual join customers)
  const { data: tp } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
  const passengers = tp || [];
  const passengerIds = passengers.map((p) => p.id);
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);

  // Fetch all customers in one query
  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }
  const passengersWithCustomers = passengers.map((p) => ({ ...p, customers: customerMap[p.customer_id] || null }));

  // Fetch all payments for these passengers
  let paymentsByPassenger = {};
  if (passengerIds.length > 0) {
    const { data: pays } = await supabase.from('participant_payments')
      .select('*')
      .in('passenger_id', passengerIds)
      .order('paid_at', { ascending: true, nullsFirst: false });
    paymentsByPassenger = {};
    for (const p of (pays || [])) {
      if (!paymentsByPassenger[p.passenger_id]) paymentsByPassenger[p.passenger_id] = [];
      paymentsByPassenger[p.passenger_id].push(p);
    }
  }

  // Compute group summary per milestone type
  const summary = {};
  for (const t of PAYMENT_TYPES) {
    if (t.value === 'Custom') continue;
    summary[t.value] = { paid: 0, total: passengers.length };
  }
  for (const pid of passengerIds) {
    const pays = paymentsByPassenger[pid] || [];
    const typesUsed = new Set(pays.map((p) => p.type));
    for (const type in summary) {
      if (typesUsed.has(type)) summary[type].paid++;
    }
  }

  const totalExpected = passengers.reduce((s, p) => s + (p.price_paid || 0), 0);
  const totalPaid = Object.values(paymentsByPassenger).flat().reduce((s, p) => s + (p.amount || 0), 0);
  const progress = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/finance/payments" className="text-sm text-brand-600 font-medium hover:underline">← Payment Checklist</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">Payment tracking per peserta</p>
      </div>

      {/* Top summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Peserta" value={passengers.length} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Total Expected" value={fmtRupiah(totalExpected)} color="text-slate-700" bg="bg-slate-50" small />
        <StatCard label="Total Paid" value={fmtRupiah(totalPaid)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Progress" value={`${progress}%`} color="text-blue-700" bg="bg-blue-50" />
      </div>

      {/* Milestone summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">Status Milestone per Group</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {Object.entries(summary).map(([type, s]) => {
            const allDone = s.paid === s.total && s.total > 0;
            const noneDone = s.paid === 0;
            return (
              <div key={type} className={`rounded-lg p-2.5 border ${
                allDone ? 'bg-green-50 border-green-200' :
                noneDone ? 'bg-slate-50 border-slate-200' :
                'bg-amber-50 border-amber-200'
              }`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{type}</p>
                <p className={`mt-0.5 text-sm font-bold ${allDone ? 'text-green-700' : noneDone ? 'text-slate-500' : 'text-amber-700'}`}>
                  {s.paid} / {s.total}
                </p>
                {!allDone && !noneDone && s.total > 0 && (
                  <p className="text-[10px] text-amber-700 mt-0.5">{s.total - s.paid} blm bayar</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-passenger timelines */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-brand-700">Daftar Peserta ({passengers.length})</h2>
        {passengersWithCustomers.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-lg font-bold text-slate-700">Belum ada peserta</p>
            <Link href={`/trips/${tripId}`} className="mt-3 inline-block text-sm text-brand-600 hover:underline font-semibold">
              Tambah peserta di trip detail →
            </Link>
          </div>
        ) : (
          passengersWithCustomers.map((p) => (
            <PaymentTimeline
              key={p.id}
              passenger={p}
              tripId={tripId}
              payments={paymentsByPassenger[p.id] || []}
            />
          ))
        )}
      </div>
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
