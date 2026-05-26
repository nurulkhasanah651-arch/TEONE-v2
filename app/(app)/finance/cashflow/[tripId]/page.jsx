// Cashflow per trip — Round 127: pass paxCount ke FinanceItemForm untuk auto-fill qty
// + Round 126: Cash In include payment refunded (exclude is_transferred=true)

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import FinanceItemForm from '@/components/finance/FinanceItemForm';
import FinanceItemRow from '@/components/finance/FinanceItemRow';

export const dynamic = 'force-dynamic';

export default async function CashflowDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const [tripRes, itemsRes, passengersRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('item_type').order('category'),
    supabase.from('trip_passengers').select('id, transfer_status, refund_status').eq('trip_id', tripId),
  ]);

  if (!tripRes.data) notFound();
  const trip = tripRes.data;
  const items = itemsRes.data || [];

  const allPassengers = passengersRes.data || [];
  const activePassengers = allPassengers.filter((p) => {
    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isTransferred && !isRefunded;
  });
  const paxCount = activePassengers.length;

  const allPaxIds = allPassengers.map((p) => p.id);
  let autoCashIn = 0;
  let actualPaymentCount = 0;
  if (allPaxIds.length > 0) {
    try {
      const { data: pays } = await supabase
        .from('participant_payments')
        .select('amount, is_transferred, passenger_id')
        .in('passenger_id', allPaxIds);
      const validPays = (pays || []).filter((p) => p.is_transferred !== true);
      autoCashIn = validPays.reduce((s, p) => s + Number(p.amount || 0), 0);
      actualPaymentCount = validPays.length;
    } catch (e) {
      // defensive
    }
  }

  const incomeItems = items.filter((i) => i.item_type === 'income');
  const hppItems = items.filter((i) => i.item_type === 'hpp');
  const manualIncome = incomeItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalIncome = manualIncome + autoCashIn;
  const totalHPP = hppItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const profit = totalIncome - totalHPP;
  const margin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : null;

  const refundHpp = hppItems.filter((i) => i.category === 'Refund');
  const totalRefundHpp = refundHpp.reduce((s, i) => s + (i.total_amount || 0), 0);

  function groupByCategory(arr) {
    const grouped = {};
    for (const i of arr) {
      const k = i.category || 'Lainnya';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(i);
    }
    return grouped;
  }
  const incomeByCategory = groupByCategory(incomeItems);
  const hppByCategory = groupByCategory(hppItems);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/finance/cashflow" className="text-sm text-brand-600 font-medium hover:underline">← Proyeksi Income per Group</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">
          Cash In peserta + Manual Income + HPP.
          <span className="ml-2 text-xs font-semibold text-brand-600">📊 {paxCount} pax aktif</span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Income" value={fmtRupiah(totalIncome)} sub={`${actualPaymentCount} payment · ${paxCount} pax aktif`} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total HPP" value={fmtRupiah(totalHPP)} sub={`${hppItems.length} item${refundHpp.length > 0 ? ` (${refundHpp.length} refund)` : ''}`} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Profit" value={fmtRupiah(profit)} color={profit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={profit >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
        <StatCard label="Margin" value={margin == null ? '—' : `${margin}%`} color={margin == null ? 'text-slate-500' : margin >= 0 ? 'text-purple-700' : 'text-red-700'} bg={margin == null ? 'bg-slate-50' : margin >= 0 ? 'bg-purple-50' : 'bg-red-50'} />
      </div>

      {/* Cash In Peserta (Auto) */}
      <div className="bg-white rounded-xl border-2 border-green-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b bg-green-50 border-green-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-green-800 flex items-center gap-2">
            <span>💰</span> Cash In Peserta (Auto)
          </h2>
          <p className="text-lg font-bold text-green-700">{fmtRupiah(autoCashIn)}</p>
        </div>
        <div className="p-4 text-sm text-slate-600">
          <p>Auto-aggregated dari <span className="font-mono">participant_payments</span>.</p>
          <p className="mt-1 text-xs text-slate-500">
            • {actualPaymentCount} payment terhitung (exclude payment yang udah dipindah ke trip lain)
            <br />
            • {paxCount} peserta aktif (selain itu peserta transferred-out atau refunded)
            <br />
            • Refund cash out: {fmtRupiah(totalRefundHpp)} (lihat di HPP kategori "Refund")
            <br />
            • Net peserta cash flow (after refund): <b>{fmtRupiah(autoCashIn - totalRefundHpp)}</b>
          </p>
        </div>
      </div>

      {/* Manual Income — pass paxCount */}
      <FinanceSection
        title="Manual Income (Vendor/Lain-lain)"
        emoji="💸"
        color="green"
        items={incomeItems}
        itemsByCategory={incomeByCategory}
        total={manualIncome}
        tripId={tripId}
        type="income"
        paxCount={paxCount}
      />

      {/* HPP — pass paxCount untuk auto-fill qty */}
      <FinanceSection
        title="HPP (Cost) — termasuk Refund"
        emoji="🧾"
        color="amber"
        items={hppItems}
        itemsByCategory={hppByCategory}
        total={totalHPP}
        tripId={tripId}
        type="hpp"
        paxCount={paxCount}
      />
    </div>
  );
}

function FinanceSection({ title, emoji, color, items, itemsByCategory, total, tripId, type, paxCount }) {
  const headerBg = color === 'green' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200';
  const titleColor = color === 'green' ? 'text-green-800' : 'text-amber-800';
  const totalColor = color === 'green' ? 'text-green-700' : 'text-amber-700';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className={`px-5 py-3 border-b ${headerBg}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className={`font-bold ${titleColor} flex items-center gap-2`}>
            <span>{emoji}</span> {title}
          </h2>
          <p className={`text-lg font-bold ${totalColor}`}>{fmtRupiah(total)}</p>
        </div>
      </div>

      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <FinanceItemForm tripId={tripId} type={type} paxCount={paxCount} />
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-sm">Belum ada item {type === 'income' ? 'income' : 'HPP'} untuk trip ini.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {Object.entries(itemsByCategory).map(([category, list]) => (
            <div key={category} className="p-4">
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${category === 'Refund' ? 'text-red-600' : 'text-slate-500'}`}>
                {category === 'Refund' ? '💸 Refund' : category}
              </h3>
              <div className="space-y-2">
                {list.map((it) => (
                  <FinanceItemRow key={it.id} item={it} tripId={tripId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
