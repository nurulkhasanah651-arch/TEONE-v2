// Payment Checklist landing — list trips with payment progress

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';

export const dynamic = 'force-dynamic';

export default async function PaymentsListPage() {
  const supabase = createClient();

  const [tripsRes, passengersRes, paymentsRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, status, departure, quota, sold').order('departure', { ascending: true }),
    supabase.from('trip_passengers').select('id, trip_id, price_paid'),
    supabase.from('participant_payments').select('passenger_id, amount, type'),
  ]);

  const trips = tripsRes.data || [];
  const passengers = passengersRes.data || [];
  const payments = paymentsRes.data || [];

  // Compute per-trip totals
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Payment Checklist Peserta</h1>
        <p className="mt-1 text-slate-600">Tracking DP, Payment 1/2/3, Pelunasan, Visa, Asuransi per peserta.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Trip & Status Pembayaran Group</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2.5">Trip</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Peserta</th>
                <th className="px-3 py-2.5 text-right">Expected</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Lunas</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Belum ada trip.</td></tr>
              ) : sorted.map((t) => {
                const s = statusCfg(t.status);
                const progress = t.expected > 0 ? Math.round((t.paid / t.expected) * 100) : 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-brand-700">{t.kode_trip || `#${t.id}`}</p>
                      <p className="text-xs text-slate-500">{t.name}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(t.departure)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">{t.paxCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{fmtRupiah(t.expected)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-bold text-green-700">{fmtRupiah(t.paid)}</p>
                      <p className="text-[10px] text-slate-500">{progress}%</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-xs font-bold ${t.lunasCount === t.paxCount && t.paxCount > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                        {t.lunasCount} / {t.paxCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/finance/payments/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                        Detail →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
