// Cashflow per trip — Round 44: AUTO income projection dari peserta × price_breakdown
// Income projection LIVE — tidak perlu manual insert proyeksi income lagi

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import FinanceItemForm from '@/components/finance/FinanceItemForm';
import FinanceItemRow from '@/components/finance/FinanceItemRow';
import { computeIncomeProjection, ROOM_KEYS, AGE_KEYS, ADDON_KEYS } from '@/lib/utils/price-breakdown';

export const dynamic = 'force-dynamic';

const ALL_KEYS = [...ROOM_KEYS, ...AGE_KEYS, ...ADDON_KEYS];
const KEY_MAP = Object.fromEntries(ALL_KEYS.map((k) => [k.key, k]));

export default async function CashflowDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const [tripRes, itemsRes, passengersRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('item_type').order('category'),
    supabase.from('trip_passengers').select('id, room_type, price_paid').eq('trip_id', tripId),
  ]);

  if (!tripRes.data) notFound();
  const trip = tripRes.data;
  const items = itemsRes.data || [];
  const passengers = passengersRes.data || [];
  const breakdown = trip.price_breakdown || {};

  // LIVE income projection dari peserta × breakdown
  const projection = computeIncomeProjection(passengers, breakdown);

  // Manual income items (yang di-input manual)
  const incomeItemsManual = items.filter((i) => i.item_type === 'income');
  const hppItems = items.filter((i) => i.item_type === 'hpp');

  // Total income = auto projection + manual income
  const totalManualIncome = incomeItemsManual.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalIncome = projection.total + totalManualIncome;
  const totalHPP = hppItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const profit = totalIncome - totalHPP;
  const margin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : null;

  function groupByCategory(arr) {
    const grouped = {};
    for (const i of arr) {
      const k = i.category || 'Lainnya';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(i);
    }
    return grouped;
  }
  const incomeByCategory = groupByCategory(incomeItemsManual);
  const hppByCategory = groupByCategory(hppItems);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/finance/cashflow" className="text-sm text-brand-600 font-medium hover:underline">← Proyeksi Income per Group</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">Proyeksi Income (AUTO dari peserta × breakdown) & HPP. Real cashflow di /accounting.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Income" value={fmtRupiah(totalIncome)} sub={`Auto: ${fmtRupiah(projection.total)} + Manual: ${fmtRupiah(totalManualIncome)}`} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total HPP" value={fmtRupiah(totalHPP)} sub={`${hppItems.length} item`} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Profit" value={fmtRupiah(profit)} color={profit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={profit >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
        <StatCard label="Margin" value={margin == null ? '—' : `${margin}%`} color={margin == null ? 'text-slate-500' : margin >= 0 ? 'text-purple-700' : 'text-red-700'} bg={margin == null ? 'bg-slate-50' : margin >= 0 ? 'bg-purple-50' : 'bg-red-50'} />
      </div>

      {/* AUTO INCOME PROJECTION dari peserta */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-green-200 bg-green-50">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-green-800 flex items-center gap-2">
              <span>⚡</span> Auto Income Projection (dari Peserta)
            </h2>
            <p className="text-lg font-bold text-green-700">{fmtRupiah(projection.total)}</p>
          </div>
          <p className="text-xs text-green-700 mt-1">
            Live-compute: {passengers.length} peserta × harga per tipe room (dari Master Trip price breakdown). Otomatis update saat CS tambah peserta baru.
          </p>
        </div>

        {Object.keys(projection.byRoom).length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-500">
              Belum ada peserta yang ke-detect room type-nya.
              {Object.keys(breakdown).length === 0 && ' (Set price_breakdown di Master Trip dulu)'}
            </p>
            <div className="mt-3 flex gap-2 justify-center">
              <Link href={`/trips/${tripId}/edit`} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded">
                Edit Master Trip → Set Breakdown
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {Object.entries(projection.byRoom).map(([key, data]) => {
              const cfg = KEY_MAP[key];
              return (
                <div key={key} className="px-5 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {cfg?.icon} {cfg?.label || key} <span className="text-xs text-slate-500 ml-2">× {data.count} pax</span>
                    </p>
                    <p className="text-xs text-slate-500">@ {fmtRupiah(data.price)} per pax</p>
                  </div>
                  <p className="text-sm font-bold text-green-700">{fmtRupiah(data.subtotal)}</p>
                </div>
              );
            })}
            {projection.undefinedCount > 0 && (
              <div className="px-5 py-2 bg-amber-50">
                <p className="text-xs text-amber-700">
                  ⚠ {projection.undefinedCount} peserta tidak ke-detect room type-nya (atau pakai room type yang ga ada di breakdown).
                  Edit peserta atau lengkapi breakdown.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MANUAL INCOME ITEMS (tambahan diluar peserta) */}
      <FinanceSection
        title="Income Tambahan (Manual)"
        emoji="💸"
        color="green"
        items={incomeItemsManual}
        itemsByCategory={incomeByCategory}
        total={totalManualIncome}
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

      {items.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {Object.entries(itemsByCategory).map(([cat, list]) => (
            <div key={cat} className="px-5 py-3">
              <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">{cat}</p>
              <div className="space-y-1">
                {list.map((it) => <FinanceItemRow key={it.id} item={it} tripId={tripId} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-slate-500">Belum ada item. Klik + di bawah untuk tambah.</p>
      )}

      <div className="border-t border-slate-200 p-4 bg-slate-50/40">
        <FinanceItemForm tripId={tripId} defaultType={type} />
      </div>
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
