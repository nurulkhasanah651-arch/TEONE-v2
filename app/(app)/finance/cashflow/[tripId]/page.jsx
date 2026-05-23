// Cashflow per trip — Round 84: HPP restructure dengan kategori + DP/Total/Sisa + Request Payment
// Section "Income Tambahan (Manual)" DIHAPUS — bikin confusing dengan auto income

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import FinanceItemForm from '@/components/finance/FinanceItemForm';
import FinanceItemRow from '@/components/finance/FinanceItemRow';
import { computeIncomeProjection, ROOM_KEYS, AGE_KEYS, ADDON_KEYS } from '@/lib/utils/price-breakdown';
import { HPP_CATEGORIES } from '@/lib/utils/finance-constants';

export const dynamic = 'force-dynamic';

const ALL_KEYS = [...ROOM_KEYS, ...AGE_KEYS, ...ADDON_KEYS];
const KEY_MAP = Object.fromEntries(ALL_KEYS.map((k) => [k.key, k]));

export default async function CashflowDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const [tripRes, itemsRes, passengersRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    supabase.from('trip_passengers').select('id, room_type, price_paid, age_type').eq('trip_id', tripId),
  ]);

  if (!tripRes.data) notFound();
  const trip = tripRes.data;
  const items = itemsRes.data || [];
  const passengers = passengersRes.data || [];
  const breakdown = trip.price_breakdown || {};

  // LIVE income projection dari peserta × breakdown
  const projection = computeIncomeProjection(passengers, breakdown);

  // HPP items only (income manual section dihapus)
  const hppItems = items.filter((i) => i.item_type === 'hpp');

  // Group HPP items by kategori (9 kategori HPP_CATEGORIES)
  const hppByCategory = {};
  for (const cat of Object.keys(HPP_CATEGORIES)) {
    hppByCategory[cat] = [];
  }
  hppByCategory['Lain-lain'] = []; // fallback
  for (const it of hppItems) {
    const cat = it.category || 'Lain-lain';
    if (!hppByCategory[cat]) hppByCategory[cat] = [];
    hppByCategory[cat].push(it);
  }

  const totalIncome = projection.total; // hanya auto-projection (manual income dihapus)
  const totalHPP = hppItems.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const totalHPPPaid = hppItems.reduce((s, i) => s + (Number(i.dp_paid) || 0), 0);
  const totalHPPSisa = Math.max(totalHPP - totalHPPPaid, 0);
  const profit = totalIncome - totalHPP;
  const margin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/finance/cashflow" className="text-sm text-brand-600 font-medium hover:underline">← Proyeksi Income per Group</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">Proyeksi Income (AUTO dari peserta) & HPP per kategori. Real cashflow di /accounting.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Income" value={fmtRupiah(totalIncome)} sub={`Auto: ${passengers.length} peserta`} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total HPP" value={fmtRupiah(totalHPP)} sub={`${hppItems.length} item · DP ${fmtRupiah(totalHPPPaid)}`} color="text-amber-700" bg="bg-amber-50" small />
        <StatCard label="Sisa HPP" value={fmtRupiah(totalHPPSisa)} sub="yang belum dilunasi" color={totalHPPSisa > 0 ? 'text-red-700' : 'text-blue-700'} bg={totalHPPSisa > 0 ? 'bg-red-50' : 'bg-blue-50'} small />
        <StatCard label="Profit (Margin)" value={fmtRupiah(profit)} sub={margin == null ? '—' : `${margin}%`} color={profit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={profit >= 0 ? 'bg-blue-50' : 'bg-red-50'} small />
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
            Live-compute: {passengers.length} peserta × harga per tipe room (dari Master Trip price breakdown).
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
                  ⚠ {projection.undefinedCount} peserta tidak ke-detect room type-nya.
                  Edit peserta atau lengkapi breakdown.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* HPP SECTION — kategori-based dengan DP/Total/Sisa + Request Payment */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-amber-800 flex items-center gap-2">
              <span>🧾</span> HPP (Cost)
            </h2>
            <div className="text-right">
              <p className="text-lg font-bold text-amber-700">{fmtRupiah(totalHPP)}</p>
              <p className="text-[10px] text-amber-600">DP: {fmtRupiah(totalHPPPaid)} · Sisa: {fmtRupiah(totalHPPSisa)}</p>
            </div>
          </div>
          <p className="text-xs text-amber-700 mt-1">
            Tambah item per kategori. Per item ada DP/Total/Sisa + Request Payment ke Finance untuk approval.
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Form tambah item baru */}
          <FinanceItemForm tripId={tripId} type="hpp" />

          {/* List items per kategori */}
          {hppItems.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500 italic">
              Belum ada HPP. Klik "+ Tambah Item HPP" di atas untuk mulai.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(hppByCategory)
                .filter(([cat, list]) => list.length > 0)
                .map(([cat, list]) => {
                  const subtotal = list.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
                  const dpSum = list.reduce((s, i) => s + (Number(i.dp_paid) || 0), 0);
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">{cat}</p>
                        <p className="text-xs text-slate-500">
                          {list.length} item · Total {fmtRupiah(subtotal)} · DP {fmtRupiah(dpSum)}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {list.map((it) => (
                          <FinanceItemRow key={it.id} item={it} tripId={tripId} isFinance={true} />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
