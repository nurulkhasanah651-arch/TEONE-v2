// R157 + R215c: Cashflow LIST page (Proyeksi Income per Group)
// R215c: TAMBAH filter bulan + tombol Download "Monthly Projection" (format kayak Google Sheet Report)
// EXISTING: download Semua Trip + Stats Card + Tabel → TETAP UTUH (gak nyentuh)
// Path: app/(app)/finance/cashflow/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import DownloadButtons from '@/components/common/DownloadButtons';

export const dynamic = 'force-dynamic';

// R215c — status threshold helper
function getProjectionStatus(marginPct) {
  if (marginPct == null) return '-';
  if (marginPct <= 12) return 'EVALUASI';
  if (marginPct <= 18) return 'WASPADA';
  if (marginPct <= 25) return 'SEHAT';
  return 'EXCELLENT';
}

// R215c — bulan label Indonesia
function monthLabelId(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

export default async function CashflowListPage({ searchParams }) {
  const supabase = createClient();

  // R215c — filter bulan dari URL
  const sp = await searchParams;
  const filterMonth = sp?.month || ''; // format YYYY-MM
  const filterYear = sp?.year || '';   // format YYYY

  const [tripsRes, itemsRes, passengersRes, landtourRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, status, departure, quota, sold').order('departure', { ascending: true }),
    supabase.from('trip_finance_items').select('trip_id, item_type, total_amount'),
    supabase.from('trip_passengers').select('id, trip_id, transfer_status, refund_status'),
    // R215c — fetch Landtour vendor untuk "Operated by"
    supabase.from('trip_finance_items')
      .select('trip_id, vendor_name, component, category')
      .eq('item_type', 'hpp'),
  ]);

  const trips = tripsRes.data || [];
  const items = itemsRes.data || [];
  const allPassengers = passengersRes.data || [];
  const hppItemsForOperator = landtourRes.data || [];

  // R215c — derive "Operated by" per trip dari vendor Landtour
  const operatorByTrip = {};
  for (const item of hppItemsForOperator) {
    if (!item.vendor_name) continue;
    const cat = String(item.category || '').toLowerCase();
    const comp = String(item.component || '').toLowerCase();
    // Prefer Landtour vendor, fallback ke component yg contains "landtour" / "dmc"
    if (cat.includes('landtour') || cat.includes('land tour') || comp.includes('landtour') || comp.includes('dmc')) {
      if (!operatorByTrip[item.trip_id]) {
        operatorByTrip[item.trip_id] = item.vendor_name;
      }
    }
  }

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

  const allPaxIds = Object.values(allPaxByTrip).flat();
  const autoIncomeByTrip = {};
  if (allPaxIds.length > 0) {
    try {
      const { data: pays } = await supabase
        .from('participant_payments')
        .select('passenger_id, amount, is_transferred')
        .in('passenger_id', allPaxIds);
      const validPays = (pays || []).filter((p) => p.is_transferred !== true);

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

  // R215c — filter by month/year (untuk tabel + monthly download)
  let filteredSorted = sorted;
  if (filterMonth) {
    filteredSorted = sorted.filter((t) => (t.departure || '').slice(0, 7) === filterMonth);
  } else if (filterYear) {
    filteredSorted = sorted.filter((t) => (t.departure || '').slice(0, 4) === filterYear);
  }

  const grand = sorted.reduce((acc, t) => ({
    income: acc.income + t.income,
    autoIncome: acc.autoIncome + t.autoIncome,
    manualIncome: acc.manualIncome + t.manualIncome,
    hpp: acc.hpp + t.hpp,
    profit: acc.profit + t.profit,
  }), { income: 0, autoIncome: 0, manualIncome: 0, hpp: 0, profit: 0 });

  // R215c — grand utk filter result (dipakai di Monthly Projection summary)
  const filteredGrand = filteredSorted.reduce((acc, t) => ({
    income: acc.income + t.income,
    autoIncome: acc.autoIncome + t.autoIncome,
    hpp: acc.hpp + t.hpp,
    profit: acc.profit + t.profit,
  }), { income: 0, autoIncome: 0, hpp: 0, profit: 0 });

  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

  // Existing — download semua trip (TETAP UTUH)
  const downloadRows = sorted.map((t) => ({
    kode: t.kode_trip || `#${t.id}`,
    name: t.name,
    status: t.status,
    departure: t.departure || '-',
    pax_active: t.paxActive,
    pax_total: t.paxTotal,
    auto_income: t.autoIncome,
    manual_income: t.manualIncome,
    total_income: t.income,
    hpp: t.hpp,
    profit: t.profit,
    margin: t.income > 0 ? `${Math.round((t.profit / t.income) * 100)}%` : '-',
  }));

  // R215c — rows untuk Monthly Projection (format kayak Google Sheet Report)
  const monthlyRows = filteredSorted.map((t, idx) => {
    const marginPct = t.income > 0 ? Math.round((t.profit / t.income) * 100) : null;
    return {
      no: idx + 1,
      kode: t.kode_trip || `#${t.id}`,
      name: t.name || '-',
      departure: t.departure || '-',
      total_margin: t.profit,
      dana_masuk: t.autoIncome,
      profit_pct: marginPct == null ? '-' : `${marginPct}%`,
      status: getProjectionStatus(marginPct),
      operator: operatorByTrip[t.id] || '-',
    };
  });

  // R215c — tahun list untuk dropdown (auto-derived)
  const yearSet = new Set();
  for (const t of sorted) {
    if (t.departure) yearSet.add(t.departure.slice(0, 4));
  }
  const allYears = Array.from(yearSet).sort().reverse();

  const monthlyTitle = filterMonth
    ? `MONTHLY PROJECTION — ${monthLabelId(filterMonth)}`
    : filterYear
      ? `YEARLY PROJECTION — ${filterYear}`
      : 'MONTHLY PROJECTION — Semua Trip';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Proyeksi Income per Group</h1>
          <p className="mt-1 text-slate-600">Auto Cash In (semua payment is_transferred=false) + Manual Income + HPP.</p>
        </div>
        <DownloadButtons
          filename={`proyeksi-income-semua-trip-${new Date().toISOString().slice(0,10)}`}
          title="Proyeksi Income per Group — Semua Trip"
          subtitle={`${sorted.length} trip · Generated ${new Date().toLocaleDateString('id-ID')}`}
          extraInfo={[
            { label: 'Total Income (semua trip)', value: fmtMoney(grand.income) },
            { label: 'Total HPP (semua trip)', value: fmtMoney(grand.hpp) },
            { label: 'Total Profit', value: fmtMoney(grand.profit) },
          ]}
          columns={[
            { key: 'kode', label: 'Kode Trip' },
            { key: 'name', label: 'Trip' },
            { key: 'status', label: 'Status' },
            { key: 'departure', label: 'Departure' },
            { key: 'pax_active', label: 'Pax Active', align: 'right' },
            { key: 'pax_total', label: 'Pax Total', align: 'right' },
            { key: 'auto_income', label: 'Auto Income', align: 'right', format: 'rupiah' },
            { key: 'manual_income', label: 'Manual Income', align: 'right', format: 'rupiah' },
            { key: 'total_income', label: 'Total Income', align: 'right', format: 'rupiah' },
            { key: 'hpp', label: 'HPP', align: 'right', format: 'rupiah' },
            { key: 'profit', label: 'Profit', align: 'right', format: 'rupiah' },
            { key: 'margin', label: 'Margin', align: 'right' },
          ]}
          rows={downloadRows}
          summary={[
            { label: 'GRAND TOTAL INCOME', value: fmtMoney(grand.income) },
            { label: 'GRAND TOTAL HPP', value: fmtMoney(grand.hpp) },
            { label: 'GRAND TOTAL PROFIT', value: fmtMoney(grand.profit) },
          ]}
          buttonSize="md"
        />
      </div>

      {/* R215c — MONTHLY FILTER + DOWNLOAD PANEL */}
      <div className="bg-white rounded-xl border-2 border-amber-200 shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">📅 Monthly Projection</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Filter trip berdasarkan bulan keberangkatan + download format Monthly Projection (kayak Google Sheet Report)</p>
          </div>
          <DownloadButtons
            filename={`monthly-projection-${filterMonth || filterYear || 'all'}-${new Date().toISOString().slice(0,10)}`}
            title={monthlyTitle}
            subtitle={`${filteredSorted.length} trip · Generated ${new Date().toLocaleDateString('id-ID')}`}
            extraInfo={[
              { label: 'Periode', value: filterMonth ? monthLabelId(filterMonth) : (filterYear || 'Semua Trip') },
              { label: 'Jumlah Trip', value: String(filteredSorted.length) },
              { label: 'Total Profit', value: fmtMoney(filteredGrand.profit) },
              { label: 'Total Dana Masuk', value: fmtMoney(filteredGrand.autoIncome) },
              { label: 'NOTED', value: '1-12% EVALUASI · 13-18% WASPADA · 18-25% SEHAT · >25% EXCELLENT' },
            ]}
            columns={[
              { key: 'no', label: 'No', align: 'center' },
              { key: 'kode', label: 'Trip Code' },
              { key: 'name', label: 'Package' },
              { key: 'departure', label: 'Departure Date', format: 'date' },
              { key: 'total_margin', label: 'Total Margin (Rp)', align: 'right', format: 'rupiah' },
              { key: 'dana_masuk', label: 'Dana Masuk (Rp)', align: 'right', format: 'rupiah' },
              { key: 'profit_pct', label: 'Profit (%)', align: 'center' },
              { key: 'status', label: 'Status', align: 'center' },
              { key: 'operator', label: 'Operated by' },
            ]}
            rows={monthlyRows}
            summary={[
              { label: 'TOTAL PROFIT', value: fmtMoney(filteredGrand.profit) },
              { label: 'TOTAL DANA MASUK', value: fmtMoney(filteredGrand.autoIncome) },
              { label: 'TOTAL HPP', value: fmtMoney(filteredGrand.hpp) },
              { label: 'NOTED', value: '1-12% EVALUASI · 13-18% WASPADA · 18-25% SEHAT · >25% EXCELLENT' },
            ]}
            buttonSize="md"
          />
        </div>

        <form action="/finance/cashflow" method="get" className="flex flex-wrap gap-2 items-end pt-2 border-t border-amber-100">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
              📅 Bulan (YYYY-MM):
            </label>
            <input
              type="month"
              name="month"
              defaultValue={filterMonth}
              className="px-3 py-1.5 border border-slate-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
              📆 Atau Tahun:
            </label>
            <select
              name="year"
              defaultValue={filterYear}
              className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
            >
              <option value="">— Semua Tahun —</option>
              {allYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded"
          >
            🔍 Apply Filter
          </button>
          {(filterMonth || filterYear) && (
            <Link
              href="/finance/cashflow"
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded"
            >
              ✕ Reset
            </Link>
          )}
        </form>

        {(filterMonth || filterYear) && (
          <div className="text-xs bg-amber-50 border border-amber-200 px-3 py-2 rounded space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-800">📊 Filter aktif:</span>
              <span className="font-mono text-amber-700 bg-white px-1.5 py-0.5 rounded border border-amber-300">
                {filterMonth ? monthLabelId(filterMonth) : filterYear}
              </span>
              <span className="text-amber-700">
                → <strong>{filteredSorted.length}</strong> trip · Total Profit <strong>{fmtMoney(filteredGrand.profit)}</strong>
              </span>
            </div>
          </div>
        )}
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
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-brand-700">
              Cashflow per Trip ({filteredSorted.length})
              {(filterMonth || filterYear) && (
                <span className="text-xs ml-2 text-amber-700 font-semibold">
                  [FILTERED: {filterMonth ? monthLabelId(filterMonth) : filterYear}]
                </span>
              )}
            </h2>
          </div>
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
                <th className="px-3 py-2.5">Operated by</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSorted.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                  {(filterMonth || filterYear) ? 'Tidak ada trip di periode ini.' : 'Belum ada trip.'}
                </td></tr>
              ) : filteredSorted.map((t) => {
                const s = statusCfg(t.status);
                const margin = t.income > 0 ? Math.round((t.profit / t.income) * 100) : null;
                const projStatus = getProjectionStatus(margin);
                const projColor =
                  projStatus === 'EXCELLENT' ? 'bg-emerald-100 text-emerald-800' :
                  projStatus === 'SEHAT' ? 'bg-green-100 text-green-800' :
                  projStatus === 'WASPADA' ? 'bg-amber-100 text-amber-800' :
                  projStatus === 'EVALUASI' ? 'bg-red-100 text-red-800' :
                  'bg-slate-100 text-slate-600';
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
                      {margin != null && (
                        <span className={`block text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${projColor}`}>
                          {projStatus}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{operatorByTrip[t.id] || '—'}</td>
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
