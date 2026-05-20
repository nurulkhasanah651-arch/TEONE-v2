// Cashflow per trip — HPP + Cash In items, profit summary

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

  const [tripRes, itemsRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('item_type').order('category'),
  ]);

  if (!tripRes.data) notFound();
  const trip = tripRes.data;
  const items = itemsRes.data || [];

  const incomeItems = items.filter((i) => i.item_type === 'income');
  const hppItems = items.filter((i) => i.item_type === 'hpp');
  const totalIncome = incomeItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalHPP = hppItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const profit = totalIncome - totalHPP;
  const margin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : null;

  // Group by category
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
        <Link href="/finance/cashflow" className="text-sm text-brand-600 font-medium hover:underline">← Cashflow per Group</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">Cashflow: Income & HPP items</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Income" value={fmtRupiah(totalIncome)} sub={`${incomeItems.length} item`} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total HPP" value={fmtRupiah(totalHPP)} sub={`${hppItems.length} item`} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Profit" value={fmtRupiah(profit)} color={profit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={profit >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
        <StatCard label="Margin" value={margin == null ? '—' : `${margin}%`} color={margin == null ? 'text-slate-500' : margin >= 0 ? 'text-purple-700' : 'text-red-700'} bg={margin == null ? 'bg-slate-50' : margin >= 0 ? 'bg-purple-50' : 'bg-red-50'} />
      </div>

      {/* INCOME section */}
      <FinanceSection
        title="Cash In (Income)"
        emoji="💸"
        color="green"
        items={incomeItems}
        itemsByCategory={incomeByCategory}
        total={totalIncome}
        tripId={tripId}
        type="income"
      />

      {/* HPP section */}
      <FinanceSection
        title="HPP (Cost)"
        emoji="🧾"
        color="amber"
        items={hppItems}
        itemsByCategory={hppByCategory}
        total={totalHPP}
        tripId={tripId}
        type="hpp"
      />
    </div>
  );
}

function FinanceSection({ title, emoji, color, items, itemsByCategory, total, tripId, type }) {
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

      {/* Add form */}
      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <FinanceItemForm tripId={tripId} type={type} />
      </div>

      {/* Items by category */}
      {items.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-sm">Belum ada item {type === 'income' ? 'income' : 'HPP'} untuk trip ini.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {Object.entries(itemsByCategory).map(([category, list]) => (
            <div key={category} className="p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{category}</h3>
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
