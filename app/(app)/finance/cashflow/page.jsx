// Cashflow LIST page — Round 126: Income include payment dari peserta refunded juga
// Hanya exclude payment yg is_transferred=true (sudah pindah ke trip lain)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';

export const dynamic = 'force-dynamic';

export default async function CashflowListPage() {
  const supabase = createClient();

  const [tripsRes, itemsRes, passengersRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, status, departure, quota, sold').order('departure', { ascending: true }),
    supabase.from('trip_finance_items').select('trip_id, item_type, total_amount'),
    supabase.from('trip_passengers').select('id, trip_id, transfer_status, refund_status'),
  ]);

  const trips = tripsRes.data || [];
  const items = itemsRes.data || [];
  const allPassengers = passengersRes.data || [];

  // ROUND 126: Map ALL passengers per trip (untuk hitung auto income TOTAL, include refunded)
  const allPaxByTrip = {};
  const activePaxByTrip = {};
  for (const p of allPassengers) {
    if (!allPaxByTrip[p.trip_id]) allPaxByTrip[p.trip_id] = [];
    allPaxByTrip[p.trip_id].push(p.id);

    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    if (!isTransferred && !isRefunded) {
      if (!activePaxByTrip[p.trip_id]) activePaxByTrip[p.trip_id] = [];
      activePaxByTrip[p.trip_id].push(p.id);
    }
  }

  // Fetch all payments yg is_transferred=false, group per trip
  const allPaxIds = Object.values(allPaxByTrip).flat();
  const autoIncomeByTrip = {};
  if (allPaxIds.length > 0) {
    try {
      const { data: pays } = await supabase
        .from('participant_payments')
        .select('passenger_id, amount, is_transferred')
        .in('passenger_id', allPaxIds);
      const validPays = (pays || []).filter((p) => p.is_transferred !== true);

      // Map passenger_id → trip_id
      const paxToTrip = {};
      for (const tid in allPaxByTrip) {
        for (const pid of allPaxByTrip[tid]) {
          paxToTrip[pid] = tid;
        }
      }

      for (const pay of validPays) {
        const tid = paxToTrip[pay.passenger_id];
        if (!tid) continue;
        autoIncomeByTrip[tid] = (autoIncomeByTrip[tid] || 0) + Number(pay.amount || 0);
      }
    } catch (e) {
      // defensive
    }
  }

  const byTrip = {};
  for (const t of trips) {
    byTrip[t.id] = {
      ...t,
      manualIncome: 0,
      autoIncome: autoIncomeByTrip[t.id] || 0,
      income: 0,
      hpp: 0,
      profit: 0,
      itemCount: 0,
      paxActive: (activePaxByTrip[t.id] || []).length,
      paxTotal: (allPaxByTrip[t.id] || []).length,
    };
  }
  for (const it of items) {
    if (!byTrip[it.trip_id]) continue;
    byTrip[it.trip_id].itemCount++;
    if (it.item_type === 'income') byTrip[it.trip_id].manualIncome += it.total_amount || 0;
    if (it.item_type === 'hpp') byTrip[it.trip_id].hpp += it.total_amount || 0;
  }
  for (const id in byTrip) {
    byTrip[id].income = byTrip[id].manualIncome + byTrip[id].autoIncome;
    byTrip[id].profit = byTrip[id].income - byTrip[id].hpp;
  }
  const sorted = Object.values(byTrip).sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));

  const grand = sorted.reduce((acc, t) => ({
    income: acc.income + t.income,
    autoIncome: acc.autoIncome + t.autoIncome,
    manualIncome: acc.manualIncome + t.manualIncome,
    hpp: acc.hpp + t.hpp,
    profit: acc.profit + t.profit,
  }), { income: 0, autoIncome: 0, manualIncome: 0, hpp: 0, profit: 0 });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Proyeksi Income per Group</h1>
        <p className="mt-1 text-slate-600">Auto Cash In (semua payment is_transferred=false) + Manual Income + HPP.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label="Total Income (semua trip)"
          value={fmtRupiah(grand.income)}
          sub={`Auto: ${fmtRupiah(grand.autoIncome)} · Manual: ${fmtRupiah(grand.manualIncome)}`}
          color="text-green-700" bg="bg-green-50"
        />
        <StatCard label="Total HPP (semua trip)" value={fmtRupiah(grand.hpp)} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Total Profit" value={fmtRupiah(grand.profit)} color={grand.profit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={grand.profit >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Cashflow per Trip</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2.5">Trip</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Income</th>
                <th className="px-3 py-2.5 text-right">HPP</th>
                <th className="px-3 py-2.5 text-right">Profit</th>
                <th className="px-3 py-2.5 text-right">Margin</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Belum ada trip.</td></tr>
              ) : sorted.map((t) => {
                const s = statusCfg(t.status);
                const margin = t.income > 0 ? Math.round((t.profit / t.income) * 100) : null;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-brand-700">{t.kode_trip || `#${t.id}`}</p>
                      <p className="text-xs text-slate-500">{t.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {fmtDate(t.departure)} · {t.paxActive}/{t.paxTotal} pax · {t.itemCount} item
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="text-green-700 font-semibold">{fmtRupiah(t.income)}</p>
                      {t.autoIncome > 0 && (
                        <p className="text-[10px] text-green-600">+ {fmtRupiah(t.autoIncome)} pax</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-amber-700 font-semibold">{fmtRupiah(t.hpp)}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${t.profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmtRupiah(t.profit)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${margin == null ? 'text-slate-400' : margin >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {margin == null ? '—' : `${margin}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/finance/cashflow/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
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

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
