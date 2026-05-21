// Real Cashflow Group — Round 47: pakai expectedPerPassenger (room + addons + customs)

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import { roomTypeToKey, expectedPerPassenger, computeIncomeProjection, ROOM_KEYS, AGE_KEYS, ADDON_KEYS } from '@/lib/utils/price-breakdown';

export const dynamic = 'force-dynamic';

const KEY_MAP = Object.fromEntries([...ROOM_KEYS, ...AGE_KEYS, ...ADDON_KEYS].map((k) => [k.key, k]));

export default async function GroupCashflowDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  const [passRes, finItemsRes, pnrRes, custRes, accEntRes] = await Promise.all([
    supabase.from('trip_passengers').select('*').eq('trip_id', tripId),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId),
    supabase.from('flight_inventory').select('*').eq('trip_id', tripId),
    supabase.from('customers').select('id, name'),
    supabase.from('accounting_entries').select('*').eq('trip_id', tripId).order('date', { ascending: false }),
  ]);

  const passengers = passRes.data || [];
  const passengerIds = passengers.map((p) => p.id);
  const customers = custRes.data || [];
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));
  const finItems = finItemsRes.data || [];
  const pnrs = pnrRes.data || [];
  const accEntries = accEntRes.data || [];
  const breakdown = trip.price_breakdown || {};

  let payments = [];
  if (passengerIds.length > 0) {
    const { data } = await supabase.from('participant_payments').select('*').in('passenger_id', passengerIds);
    payments = data || [];
  }

  // PAID per peserta
  const paidByPassenger = {};
  for (const p of payments) {
    paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
  }

  // Per peserta row — pakai expectedPerPassenger (room + addons + customs)
  const perPaxRows = passengers.map((p) => {
    const c = custMap[p.customer_id] || {};
    const key = roomTypeToKey(p.room_type);
    const cfg = key ? KEY_MAP[key] : null;
    const exp = expectedPerPassenger(p, breakdown);
    const paid = paidByPassenger[p.id] || 0;
    const remaining = exp - paid;
    let status = 'belum';
    if (paid >= exp && exp > 0) status = 'lunas';
    else if (paid > 0) status = 'cicilan';
    if (paid > exp && exp > 0) status = 'overpaid';
    return {
      id: p.id,
      name: c.name || `#${p.id}`,
      roomLabel: cfg?.label || p.room_type || '—',
      roomIcon: cfg?.icon || '',
      expected: exp,
      paid,
      remaining,
      status,
    };
  });

  const totalExpected = perPaxRows.reduce((s, r) => s + r.expected, 0);
  const totalPaid = perPaxRows.reduce((s, r) => s + r.paid, 0);
  const totalRemaining = totalExpected - totalPaid;
  const collectionRate = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;

  // Real cash flow
  const totalPaymentsIn = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const manualIn = accEntries.filter((e) => e.type === 'in' && !e.linked_payment_id).reduce((s, e) => s + (e.amount || 0), 0);
  const totalRealIn = totalPaymentsIn + manualIn;

  const hppLunas = finItems.filter((i) => i.item_type === 'hpp' && i.payment_status === 'lunas');
  const totalHppLunas = hppLunas.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalPnrPaid = pnrs.reduce((s, p) => s + (p.deposit_total || 0) + (p.payoff_amount || 0), 0);
  const manualOut = accEntries.filter((e) => e.type === 'out' && !e.linked_finance_item_id).reduce((s, e) => s + (e.amount || 0), 0);
  const totalRealOut = totalHppLunas + totalPnrPaid + manualOut;

  const realProfit = totalRealIn - totalRealOut;
  const proyHpp = finItems.filter((i) => i.item_type === 'hpp').reduce((s, i) => s + (i.total_amount || 0), 0);
  const proyProfit = totalExpected - proyHpp;
  const hppOwed = proyHpp - totalHppLunas;

  const s = statusCfg(trip.status);

  // Classification
  const netCash = totalRealIn - totalRealOut;
  let titipan = 0, marginLocked = 0, cicilanMengendap = 0;
  const hasProjection = proyHpp > 0;
  if (netCash > 0) {
    if (hasProjection) {
      titipan = Math.min(netCash, hppOwed);
      marginLocked = Math.max(0, netCash - hppOwed);
    } else {
      cicilanMengendap = netCash;
    }
  } else if (netCash < 0) {
    marginLocked = netCash;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/accounting/groups" className="text-sm text-brand-600 font-medium hover:underline">← Real Cashflow per Group</Link>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{trip.kode_trip || `#${trip.id}`}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.name}</h1>
        <p className="mt-1 text-slate-600">Expected (room + add-ons + customs) vs Paid · {passengers.length} peserta · {fmtDate(trip.departure)}</p>
      </div>

      <div className="bg-white rounded-xl border-2 border-brand-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-brand-200 bg-gradient-to-r from-brand-50 to-blue-50">
          <h2 className="font-bold text-brand-700">💎 Expected Cash In vs Paid</h2>
          <p className="text-xs text-slate-500 mt-0.5">Expected = harga room + add-ons (visa/asuransi/tips/etc) + custom items. Paid dari payment checklist.</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="💎 Expected" value={fmtRupiah(totalExpected)} sub={`${passengers.length} peserta`} color="text-brand-700" bg="bg-brand-50" />
            <SummaryCard label="✓ Sudah Bayar" value={fmtRupiah(totalPaid)} sub={`${collectionRate}% terkumpul`} color="text-green-700" bg="bg-green-50" />
            <SummaryCard label="⏳ Sisa Tagihan" value={fmtRupiah(totalRemaining)} sub={totalRemaining > 0 ? 'Belum dibayar' : '✓ Lunas semua'} color={totalRemaining > 0 ? 'text-amber-700' : 'text-green-700'} bg={totalRemaining > 0 ? 'bg-amber-50' : 'bg-green-50'} />
            <SummaryCard label="📊 Collection" value={`${collectionRate}%`} sub={collectionRate >= 80 ? 'On track' : 'Push payment'} color={collectionRate >= 80 ? 'text-green-700' : 'text-amber-700'} bg={collectionRate >= 80 ? 'bg-green-50' : 'bg-amber-50'} />
          </div>

          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-4">
            <div className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all" style={{ width: `${Math.min(collectionRate, 100)}%` }} />
          </div>

          {perPaxRows.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">Belum ada peserta di trip ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Nama Peserta</th>
                    <th className="px-3 py-2 text-left">Room</th>
                    <th className="px-3 py-2 text-right">Expected</th>
                    <th className="px-3 py-2 text-right">Sudah Bayar</th>
                    <th className="px-3 py-2 text-right">Sisa</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perPaxRows.map((r, idx) => (
                    <tr key={r.id} className={`hover:bg-slate-50 ${r.status === 'belum' && r.expected > 0 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2 text-xs text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-slate-800">{r.name}</td>
                      <td className="px-3 py-2 text-xs">{r.roomIcon} {r.roomLabel}</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-brand-700">{fmtRupiah(r.expected)}</td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-green-700">{fmtRupiah(r.paid)}</td>
                      <td className="px-3 py-2 text-right text-sm font-bold">
                        <span className={r.remaining > 0 ? 'text-amber-700' : r.remaining < 0 ? 'text-red-700' : 'text-slate-400'}>
                          {fmtRupiah(r.remaining)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold">
                  <tr>
                    <td colSpan="3" className="px-3 py-2 text-sm">TOTAL</td>
                    <td className="px-3 py-2 text-right text-sm text-brand-700">{fmtRupiah(totalExpected)}</td>
                    <td className="px-3 py-2 text-right text-sm text-green-700">{fmtRupiah(totalPaid)}</td>
                    <td className="px-3 py-2 text-right text-sm text-amber-700">{fmtRupiah(totalRemaining)}</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-500">{collectionRate}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/finance/payments/${tripId}`} className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white">💳 Buka Payment Checklist</Link>
            <Link href={`/finance/cashflow/${tripId}`} className="text-xs font-semibold px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700">📈 Proyeksi Income Finance</Link>
            <Link href={`/trips/${tripId}/edit`} className="text-xs font-semibold px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700">✏️ Edit Master Trip</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Real Cash In" value={fmtRupiah(totalRealIn)} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Real Cash Out" value={fmtRupiah(totalRealOut)} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Net Real Profit" value={fmtRupiah(realProfit)} color={realProfit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={realProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
        <StatCard label="Proyeksi Profit" value={fmtRupiah(proyProfit)} color="text-purple-700" bg="bg-purple-50" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">📊 Klasifikasi Uang Saat Ini</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ClassCard label="🔒 Titipan (vendor)" value={titipan} color="text-amber-700" bg="bg-amber-50" desc="HPP belum lunas yang akan dibayar dari cicilan" />
          <ClassCard label="⏳ Cicilan Mengendap" value={cicilanMengendap} color="text-yellow-700" bg="bg-yellow-50" desc={hasProjection ? 'HPP proyeksi sudah set' : 'HPP proyeksi BELUM set'} highlight={!hasProjection && cicilanMengendap > 0} />
          <ClassCard label="💼 Margin Locked" value={marginLocked} color="text-green-700" bg="bg-green-50" desc="Sudah pasti milik perusahaan" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-amber-50">
          <h2 className="font-bold text-amber-800 flex items-center gap-2">⬇ HPP & Vendor Cost <span className="text-sm ml-auto">{fmtRupiah(totalRealOut)}</span></h2>
        </div>
        <div className="p-5 space-y-3">
          {hppLunas.length > 0 && (
            <SubSection title="HPP Lunas" total={totalHppLunas} color="text-amber-700">
              {hppLunas.map((i) => (
                <div key={i.id} className="flex justify-between text-sm py-1">
                  <span className="text-slate-700">{i.component}{i.vendor_name && <span className="text-xs text-slate-400 ml-1">· {i.vendor_name}</span>}</span>
                  <span className="font-semibold text-amber-700">{fmtRupiah(i.total_amount)}</span>
                </div>
              ))}
            </SubSection>
          )}
          {pnrs.length > 0 && totalPnrPaid > 0 && (
            <SubSection title="Deposit PNR" total={totalPnrPaid} color="text-amber-700">
              {pnrs.map((p) => {
                const t = (p.deposit_total || 0) + (p.payoff_amount || 0);
                if (t === 0) return null;
                return (
                  <div key={p.id} className="flex justify-between text-sm py-1">
                    <span className="text-slate-700">{p.pnr}{p.vendor && <span className="text-xs text-slate-400 ml-1">· {p.vendor}</span>}</span>
                    <span className="font-semibold text-amber-700">{fmtRupiah(t)}</span>
                  </div>
                );
              })}
            </SubSection>
          )}
          {manualOut > 0 && (
            <SubSection title="Manual Cash Out" total={manualOut} color="text-amber-700">
              {accEntries.filter((e) => e.type === 'out' && !e.linked_finance_item_id).map((e) => (
                <div key={e.id} className="flex justify-between text-sm py-1">
                  <span className="text-slate-700">{e.description}{e.category && <span className="text-xs text-slate-400 ml-1">({e.category})</span>}</span>
                  <span className="font-semibold text-amber-700">{fmtRupiah(e.amount)}</span>
                </div>
              ))}
            </SubSection>
          )}
          {hppOwed > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              <p className="font-bold">💼 Hutang vendor belum dibayar: {fmtRupiah(hppOwed)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    lunas:    { label: 'LUNAS ✓',  color: 'bg-green-100 text-green-700' },
    cicilan:  { label: 'Cicilan',  color: 'bg-amber-100 text-amber-700' },
    belum:    { label: 'Belum',    color: 'bg-red-100 text-red-700' },
    overpaid: { label: 'Overpaid', color: 'bg-blue-100 text-blue-700' },
  };
  const c = cfg[status] || cfg.belum;
  return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${c.color}`}>{c.label}</span>;
}

function SummaryCard({ label, value, sub, color, bg }) {
  return (
    <div className={`rounded-lg p-3 ${bg}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ClassCard({ label, value, color, bg, desc, highlight }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-slate-200'} ${bg}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{fmtRupiah(value)}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
    </div>
  );
}

function SubSection({ title, total, color, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{title}</p>
        <p className={`text-xs font-bold ${color}`}>{fmtRupiah(total)}</p>
      </div>
      {children}
    </div>
  );
}
