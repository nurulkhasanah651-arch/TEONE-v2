// Payment Checklist — pick trip first, then go to detail

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';

export const dynamic = 'force-dynamic';

export default async function PaymentsListPage() {
  const supabase = createClient();

  const [tripsRes, passengersRes, paymentsRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, status, departure, quota, sold').order('departure', { ascending: true, nullsFirst: false }),
    supabase.from('trip_passengers').select('id, trip_id, price_paid'),
    supabase.from('participant_payments').select('passenger_id, amount, type'),
  ]);

  const trips = tripsRes.data || [];
  const passengers = passengersRes.data || [];
  const payments = paymentsRes.data || [];

  const paidByPassenger = {};
  for (const p of payments) {
    paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
  }

  const byTrip = {};
  for (const t of trips) {
    byTrip[t.id] = { ...t, expected: 0, paid: 0, paxCount: 0, lunasCount: 0 };
  }
  for (const p of passengers) {
    if (!byTrip[p.trip_id]) continue;
    byTrip[p.trip_id].expected += p.price_paid || 0;
    byTrip[p.trip_id].paid += paidByPassenger[p.id] || 0;
    byTrip[p.trip_id].paxCount++;
    if ((paidByPassenger[p.id] || 0) >= (p.price_paid || 0) && (p.price_paid || 0) > 0) {
      byTrip[p.trip_id].lunasCount++;
    }
  }

  const sorted = Object.values(byTrip).sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));
  // Active (not completed) first
  const active = sorted.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const archived = sorted.filter((t) => t.status === 'completed' || t.status === 'cancelled');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Payment Checklist Peserta</h1>
        <p className="mt-1 text-slate-600">Pilih trip → set template nominal payment group → checklist tiap peserta.</p>
      </div>

      {/* Active trips */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Trip Aktif</h2>
          <p className="text-xs text-slate-500 mt-0.5">{active.length} trip aktif. Pilih untuk masuk payment checklist.</p>
        </div>
        {active.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Belum ada trip aktif.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {active.map((t) => <TripRow key={t.id} trip={t} />)}
          </div>
        )}
      </section>

      {/* Archived */}
      {archived.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden opacity-75">
          <div className="px-5 py-3 border-b border-slate-200">
            <h2 className="font-bold text-slate-600">Trip Selesai / Cancelled ({archived.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {archived.map((t) => <TripRow key={t.id} trip={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function TripRow({ trip: t }) {
  const s = statusCfg(t.status);
  const progress = t.expected > 0 ? Math.round((t.paid / t.expected) * 100) : 0;
  const hasTemplate = false; // template badge only shown after entering detail page
  const days = daysUntil(t.departure);

  return (
    <Link href={`/finance/payments/${t.id}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
            {!hasTemplate && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Template belum di-set</span>
            )}
            {days != null && days >= 0 && days <= 30 && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-1.5 py-0.5 rounded">⏰ {days}h lagi</span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-slate-800">{t.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(t.departure)} · {t.paxCount} peserta · Expected {fmtRupiah(t.expected)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-green-700">{fmtRupiah(t.paid)}</p>
          <p className={`text-xs font-semibold ${progress >= 100 ? 'text-green-700' : 'text-amber-700'}`}>{progress}% · {t.lunasCount}/{t.paxCount} lunas</p>
          <span className="text-xs text-brand-600 font-semibold mt-1 inline-block">Buka →</span>
        </div>
      </div>
    </Link>
  );
}
