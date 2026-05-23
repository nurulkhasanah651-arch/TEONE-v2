// Cashflow per trip — Round 86: fix age_type query bug + 2-step payment workflow

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

  // FIX bug: SELECT '*' agar tidak crash kalau ada kolom yang tidak ada
  const [tripRes, itemsRes, passengersRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    supabase.from('trip_passengers').select('*').eq('trip_id', tripId),
  ]);

  if (!tripRes.data) notFound();
  const trip = tripRes.data;
  const items = itemsRes.data || [];
  const passengers = passengersRes.data || [];
  const breakdown = trip.price_breakdown || {};

  // LIVE income projection
  let projection = { byRoom: {}, total: 0, undefinedCount: 0 };
  try {
    projection = computeIncomeProjection(passengers, breakdown);
  } catch (e) {
    console.error('computeIncomeProjection error', e);
  }

  const hppItems = items.filter((i) => i.item_type === 'hpp');

  const hppByCategory = {};
  for (const cat of Object.keys(HPP_CATEGORIES)) hppByCategory[cat] = [];
  hppByCategory['Lain-lain'] = [];
  for (const it of hppItems) {
    const cat = it.category || 'Lain-lain';
    if (!hppByCategory[cat]) hppByCategory[cat] = [];
    hppByCategory[cat].push(it);
  }

  const totalIncome = projection.total;
  const totalHPP = hppItems.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const totalHPPPaid = hppItems.reduce((s, i) => s + (Number(i.dp_paid) || 0), 0);
  const totalHPPSisa = Math.max(totalHPP - totalHPPPaid, 0);
  const profit = totalIncome - totalHPP;
  const margin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : null;

  // Diagnostic: detect kenapa projection 0
  const hasBreakdown = Object.keys(breakdown).length > 0;
  const hasPeserta = passengers.length > 0;
  const pesertaWithRoom = passengers.filter((p) => p.room_type).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/finance/cashflow" className="text-sm text-brand-600 font-medium hover:underline">← Proyeksi Income per Group</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">Proyeksi Income (AUTO) & HPP per kategori. Real cashflow di /accounting.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Income" value={fmtRupiah(totalIncome)} sub={`Auto: ${passengers.length} peserta`} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total HPP" value={fmtRupiah(totalHPP)} sub={`${hppItems.length} item · DP ${fmtRupiah(totalHPPPaid)}`} color="text-amber-700" bg="bg-amber-50" small />
        <StatCard label="Sisa HPP" value={fmtRupiah(totalHPPSisa)} sub="yang belum dilunasi" color={totalHPPSisa > 0 ? 'text-red-700' : 'text-blue-700'} bg={totalHPPSisa > 0 ? 'bg-red-50' : 'bg-blue-50'} small />
        <StatCard label="Profit (Margin)" value={fmtRupiah(profit)} sub={margin == null ? '—' : `${margin}%`} color={profit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={profit >= 0 ? 'bg-blue-50' : 'bg-red-50'} small />
      </div>

      {/* Diagnostic banner kalau projection 0 */}
      {hasPeserta && projection.total === 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-1">
          <p className="text-sm font-bold text-amber-800">⚠ Income Projection = 0 padahal ada {passengers.length} peserta. Kemungkinan:</p>
          <ul className="text-xs text-amber-700 list-disc pl-5 space-y-0.5">
            {!hasBreakdown && (
              <li>
                <span className="font-bold">price_breakdown trip kosong.</span> Buka{' '}
                <Link href={`/trips/${tripId}/edit`} className="underline font-bold">Edit Trip</Link> → scroll "💰 Harga per Tipe" → isi Double Room (atau tipe lain) → Save.
              </li>
            )}
            {hasBreakdown && pesertaWithRoom === 0 && (
              <li>
                <span className="font-bold">Semua peserta belum punya room_type.</span> Buka{' '}
                <Link href={`/trips/${tripId}`} className="underline font-bold">Master Trip</Link> → Edit peserta → pilih Tipe Kamar → Save.
              </li>
            )}
            {hasBreakdown && pesertaWithRoom > 0 && projection.undefinedCount > 0 && (
              <li>
                <span className="font-bold">{projection.undefinedCount} peserta room_type tidak match breakdown.</span> Cek apakah breakdown ada key yang sesuai (e.g. "double" untuk Double/Twin).
              </li>
            )}
          </ul>
        </div>
      )}

      {/* AUTO INCOME PROJECTION */}
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
            <p className="text-sm text-slate-500">Belum ada peserta yang ke-detect room type-nya.</p>
            <div className="mt-3 flex gap-2 justify-center flex-wrap">
              <Link href={`/trips/${tripId}/edit`} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded">
                Edit Master Trip → Set Breakdown
              </Link>
              <Link href={`/trips/${tripId}`} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded">
                Master Trip → Edit Peserta
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
                  ⚠ {projection.undefinedCount} peserta tidak ke-detect room type-nya. Edit peserta atau lengkapi breakdown.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* HPP SECTION */}
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
            Per item: Total + Deposit + Deadline Pelunasan. Workflow: Request Deposit → Approve → Request Pelunasan → Lunas.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <FinanceItemForm tripId={tripId} type="hpp" />

          {hppItems.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500 italic">
              Belum ada HPP. Klik "+ Tambah Item HPP" untuk mulai.
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
                          {list.length} item · Total {fmtRupiah(subtotal)} · Paid {fmtRupiah(dpSum)}
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
