// Real Cashflow per Group — final numbers per trip (vs Finance Proyeksi which is plan)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';

export const dynamic = 'force-dynamic';

export default async function RealCashflowGroupPage() {
  const supabase = createClient();

  const [tripsRes, passRes, payRes, finItemsRes, accEntriesRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, status, departure').order('departure', { ascending: false, nullsFirst: false }),
    fetchAll(() => supabase.from('trip_passengers').select('id, trip_id, price_paid')),
    fetchAll(() => supabase.from('participant_payments').select('passenger_id, amount')),
    fetchAll(() => supabase.from('trip_finance_items').select('trip_id, item_type, total_amount, payment_status')),
    fetchAll(() => supabase.from('accounting_entries').select('trip_id, type, amount')),
  ]);

  const trips = tripsRes.data || [];
  const passengers = passRes || [];
  const payments = payRes || [];
  const finItems = finItemsRes || [];
  const accEntries = accEntriesRes || [];

  // Build paid-by-passenger lookup
  const paidByPassenger = {};
  for (const p of payments) {
    paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
  }

  // Aggregate per trip
  const byTrip = {};
  for (const t of trips) {
    byTrip[t.id] = {
      ...t,
      proyIncome: 0,    // Finance proyeksi income
      proyHpp: 0,       // Finance proyeksi HPP
      realIn: 0,        // Real cash in (from payments)
      realOut: 0,       // Real cash out (HPP lunas + accounting out)
      realIncomeExpected: 0,  // Sum of trip_passengers.price_paid
      paxCount: 0,
    };
  }

  // Passengers + payments → real income
  for (const p of passengers) {
    if (!byTrip[p.trip_id]) continue;
    byTrip[p.trip_id].paxCount++;
    byTrip[p.trip_id].realIncomeExpected += p.price_paid || 0;
    byTrip[p.trip_id].realIn += paidByPassenger[p.id] || 0;
  }

  // Finance items: proyeksi income + proyeksi hpp + real out (hpp lunas)
  for (const it of finItems) {
    if (!byTrip[it.trip_id]) continue;
    if (it.item_type === 'income') byTrip[it.trip_id].proyIncome += it.total_amount || 0;
    if (it.item_type === 'hpp') {
      byTrip[it.trip_id].proyHpp += it.total_amount || 0;
      if (it.payment_status === 'lunas') byTrip[it.trip_id].realOut += it.total_amount || 0;
    }
  }

  // Manual accounting entries linked to trip
  for (const a of accEntries) {
    if (!a.trip_id || !byTrip[a.trip_id]) continue;
    if (a.type === 'in') byTrip[a.trip_id].realIn += a.amount || 0;
    if (a.type === 'out') byTrip[a.trip_id].realOut += a.amount || 0;
  }

  const sorted = Object.values(byTrip)
    .filter((t) => t.paxCount > 0 || t.proyIncome > 0 || t.proyHpp > 0)
    .sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));

  // Grand totals
  const grand = sorted.reduce((acc, t) => ({
    realIn: acc.realIn + t.realIn,
    realOut: acc.realOut + t.realOut,
    proyIncome: acc.proyIncome + t.proyIncome,
    proyHpp: acc.proyHpp + t.proyHpp,
  }), { realIn: 0, realOut: 0, proyIncome: 0, proyHpp: 0 });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Real Cashflow per Group</h1>
        <p className="mt-1 text-slate-600">Angka real cashflow per trip — dari payment peserta + HPP lunas. Bandingkan dengan proyeksi di Finance.</p>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Real Cash In" value={fmtRupiah(grand.realIn)} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Real Cash Out" value={fmtRupiah(grand.realOut)} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Real Net Profit" value={fmtRupiah(grand.realIn - grand.realOut)} color={grand.realIn - grand.realOut >= 0 ? 'text-blue-700' : 'text-red-700'} bg={grand.realIn - grand.realOut >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
        <StatCard label="Proyeksi Profit" value={fmtRupiah(grand.proyIncome - grand.proyHpp)} color="text-purple-700" bg="bg-purple-50" small />
      </div>

      {/* Per-trip table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Cashflow Real per Trip</h2>
          <p className="text-xs text-slate-500 mt-0.5">Klik detail untuk breakdown lengkap.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2.5">Trip</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Real In</th>
                <th className="px-3 py-2.5 text-right">Real Out</th>
                <th className="px-3 py-2.5 text-right">Real Profit</th>
                <th className="px-3 py-2.5 text-right">Proyeksi Profit</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Belum ada trip dengan data finance/payment.</td></tr>
              ) : sorted.map((t) => {
                const s = statusCfg(t.status);
                const realProfit = t.realIn - t.realOut;
                const proyProfit = t.proyIncome - t.proyHpp;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-brand-700">{t.kode_trip || `#${t.id}`}</p>
                      <p className="text-xs text-slate-500">{t.name}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(t.departure)} · {t.paxCount} peserta</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-bold text-green-700">{fmtRupiah(t.realIn)}</p>
                      <p className="text-[10px] text-slate-400">expected {fmtRupiah(t.realIncomeExpected)}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-bold text-amber-700">{fmtRupiah(t.realOut)}</p>
                      <p className="text-[10px] text-slate-400">proy {fmtRupiah(t.proyHpp)}</p>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold ${realProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmtRupiah(realProfit)}</td>
                    <td className={`px-3 py-2.5 text-right text-xs ${proyProfit >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{fmtRupiah(proyProfit)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/accounting/groups/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
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

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
