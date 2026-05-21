// Posisi Kas — Klasifikasi uang peserta (titipan + mengendap) vs uang perusahaan

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import { aggregateAccountBalances, computeTripCashBreakdown } from '@/lib/utils/accounting-aggregator';

export const dynamic = 'force-dynamic';

export default async function CashPositionPage() {
  const supabase = createClient();
  const [accountsRes, entriesRes, payRes, passRes, finItemsRes, pnrRes, tripsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('active', true),
    supabase.from('accounting_entries').select('account_id, type, amount'),
    supabase.from('participant_payments').select('passenger_id, amount'),
    supabase.from('trip_passengers').select('id, trip_id'),
    supabase.from('trip_finance_items').select('trip_id, item_type, total_amount, payment_status'),
    supabase.from('flight_inventory').select('trip_id, deposit_total, payoff_amount'),
    supabase.from('trips').select('id, kode_trip, name, status, departure'),
  ]);

  const accounts = accountsRes.data || [];
  const balances = aggregateAccountBalances(accounts, entriesRes.data || []);
  const totalBank = Object.values(balances).reduce((s, b) => s + b.balance, 0);

  const trips = tripsRes.data || [];
  const breakdown = computeTripCashBreakdown({
    trips,
    passengers: passRes.data || [],
    payments: payRes.data || [],
    finItems: finItemsRes.data || [],
    pnrs: pnrRes.data || [],
  });

  const t = breakdown.totals;
  // Total "uang peserta" yang ada di kas = titipan_locked + cicilan_mengendap
  const uangPesertaInBank = t.titipan_locked + t.cicilan_mengendap;
  // Uang perusahaan = Bank - uang peserta in bank
  const uangPerusahaan = totalBank - uangPesertaInBank;

  // Filter trips that have activity
  const activeTrips = breakdown.perTrip.filter((p) => p.cicilanIn > 0 || p.hppTotal > 0).sort((a, b) =>
    (b.trip.departure || '').localeCompare(a.trip.departure || '')
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Posisi Kas — Uang Peserta vs Uang Perusahaan</h1>
        <p className="mt-1 text-slate-600">Pisahkan mana cash yang earmark untuk vendor (titipan) vs yang sudah pasti milik perusahaan.</p>
      </div>

      {/* MAIN BREAKDOWN — visual stacked */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-bold text-brand-700 uppercase tracking-wider">🏦 Total Saldo Bank/Kas</h2>
          <p className="text-3xl font-bold text-brand-700">{fmtRupiah(totalBank)}</p>
        </div>

        {/* Stacked bar */}
        {totalBank > 0 && (
          <div className="h-8 rounded-lg overflow-hidden flex border border-slate-200 mb-2">
            {t.titipan_locked > 0 && (
              <div className="bg-amber-400 flex items-center justify-center text-xs font-bold text-white"
                style={{ width: `${(t.titipan_locked / totalBank) * 100}%` }}
                title={`Titipan terikat: ${fmtRupiah(t.titipan_locked)}`}>
                {((t.titipan_locked / totalBank) * 100) > 8 ? '🔒' : ''}
              </div>
            )}
            {t.cicilan_mengendap > 0 && (
              <div className="bg-yellow-300 flex items-center justify-center text-xs font-bold text-yellow-900"
                style={{ width: `${(t.cicilan_mengendap / totalBank) * 100}%` }}
                title={`Cicilan mengendap: ${fmtRupiah(t.cicilan_mengendap)}`}>
                {((t.cicilan_mengendap / totalBank) * 100) > 8 ? '⏳' : ''}
              </div>
            )}
            {uangPerusahaan > 0 && (
              <div className="bg-green-500 flex items-center justify-center text-xs font-bold text-white"
                style={{ width: `${(uangPerusahaan / totalBank) * 100}%` }}
                title={`Uang Perusahaan: ${fmtRupiah(uangPerusahaan)}`}>
                {((uangPerusahaan / totalBank) * 100) > 8 ? '💼' : ''}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-400 rounded" /> Titipan terikat</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-300 rounded" /> Cicilan mengendap</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-green-500 rounded" /> Uang perusahaan</span>
        </div>
      </div>

      {/* 3 BIG CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Uang Peserta Total */}
        <div className="rounded-xl shadow-card overflow-hidden bg-gradient-to-br from-amber-500 to-amber-700 text-white">
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">🔒 UANG PESERTA (Titipan)</p>
            <p className="mt-2 text-3xl font-bold">{fmtRupiah(uangPesertaInBank)}</p>
            <p className="text-xs opacity-90 mt-2">Bagian saldo bank yang BUKAN milik perusahaan</p>
            <div className="mt-3 text-xs space-y-1 opacity-95">
              <div className="flex justify-between">
                <span>🔐 Earmark vendor</span>
                <span className="font-semibold">{fmtRupiah(t.titipan_locked)}</span>
              </div>
              <div className="flex justify-between">
                <span>⏳ Mengendap (HPP belum di-set)</span>
                <span className="font-semibold">{fmtRupiah(t.cicilan_mengendap)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Uang Perusahaan */}
        <div className={`rounded-xl shadow-card overflow-hidden ${uangPerusahaan >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-700' : 'bg-gradient-to-br from-red-500 to-red-700'} text-white`}>
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">💼 UANG PERUSAHAAN</p>
            <p className="mt-2 text-3xl font-bold">{fmtRupiah(uangPerusahaan)}</p>
            <p className="text-xs opacity-90 mt-2">Cash yang sudah PASTI milik perusahaan</p>
            <div className="mt-3 text-xs space-y-1 opacity-95">
              <div className="flex justify-between">
                <span>🔓 Margin sudah pasti</span>
                <span className="font-semibold">{fmtRupiah(t.margin_locked)}</span>
              </div>
              <div className="flex justify-between">
                <span>📊 Capital/lainnya</span>
                <span className="font-semibold">{fmtRupiah(uangPerusahaan - t.margin_locked)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hutang Vendor */}
        <div className="rounded-xl shadow-card overflow-hidden bg-gradient-to-br from-red-500 to-red-700 text-white">
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">💼 HUTANG VENDOR</p>
            <p className="mt-2 text-3xl font-bold">{fmtRupiah(t.hppOwed)}</p>
            <p className="text-xs opacity-90 mt-2">HPP yang belum dibayar (akan keluar dari bank)</p>
            <div className="mt-3 text-xs opacity-95">
              {t.hppOwed > t.titipan_locked && (
                <div className="p-2 bg-red-900/30 rounded">
                  <p>⚠ Titipan ({fmtRupiah(t.titipan_locked)}) tidak cukup untuk bayar hutang ({fmtRupiah(t.hppOwed)})</p>
                  <p className="mt-1">Selisih {fmtRupiah(t.hppOwed - t.titipan_locked)} harus dari uang perusahaan</p>
                </div>
              )}
              {t.hppOwed <= t.titipan_locked && t.hppOwed > 0 && (
                <p>✓ Titipan cukup untuk bayar hutang vendor</p>
              )}
              {t.hppOwed === 0 && (
                <p>✓ Tidak ada hutang vendor</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PER TRIP BREAKDOWN */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">📋 Detail per Trip — Uang Peserta vs Margin Locked</h2>
          <p className="text-xs text-slate-500 mt-0.5">Trip tanpa HPP proyeksi → cicilan = mengendap (kuning). Klik trip untuk detail.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2.5">Trip</th>
                <th className="px-3 py-2.5 text-right">Cicilan Masuk</th>
                <th className="px-3 py-2.5 text-right">HPP Lunas</th>
                <th className="px-3 py-2.5 text-right">HPP Hutang</th>
                <th className="px-3 py-2.5 text-right">🔒 Titipan</th>
                <th className="px-3 py-2.5 text-right">⏳ Mengendap</th>
                <th className="px-3 py-2.5 text-right">💼 Margin Locked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTrips.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Belum ada trip dengan payment / HPP.</td></tr>
              ) : activeTrips.map((p) => (
                <tr key={p.trip.id} className={`hover:bg-slate-50 ${!p.hasProjection ? 'bg-yellow-50/40' : ''}`}>
                  <td className="px-4 py-2.5">
                    <Link href={`/finance/cashflow/${p.trip.id}`} className="font-bold text-brand-700 hover:underline">
                      {p.trip.kode_trip || `#${p.trip.id}`}
                    </Link>
                    <p className="text-xs text-slate-500">{p.trip.name}</p>
                    {!p.hasProjection && p.cicilanIn > 0 && (
                      <p className="text-[10px] text-yellow-700 font-semibold mt-0.5">⚠ HPP proyeksi belum di-set di Finance</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-green-700">{fmtRupiah(p.cicilanIn)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-700">{fmtRupiah(p.hppPaid)}</td>
                  <td className="px-3 py-2.5 text-right text-red-700">{fmtRupiah(p.hppOwed)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-amber-700">{fmtRupiah(p.titipan_locked)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${p.cicilan_mengendap > 0 ? 'text-yellow-700' : 'text-slate-400'}`}>{fmtRupiah(p.cicilan_mengendap)}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${p.margin_locked >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtRupiah(p.margin_locked)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
              <tr>
                <td className="px-4 py-2.5">TOTAL</td>
                <td className="px-3 py-2.5 text-right text-green-700">{fmtRupiah(t.cicilanIn)}</td>
                <td className="px-3 py-2.5 text-right">{fmtRupiah(t.hppPaid)}</td>
                <td className="px-3 py-2.5 text-right text-red-700">{fmtRupiah(t.hppOwed)}</td>
                <td className="px-3 py-2.5 text-right text-amber-700">{fmtRupiah(t.titipan_locked)}</td>
                <td className="px-3 py-2.5 text-right text-yellow-700">{fmtRupiah(t.cicilan_mengendap)}</td>
                <td className={`px-3 py-2.5 text-right ${t.margin_locked >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtRupiah(t.margin_locked)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-bold text-blue-800 mb-2">💡 Cara Baca</h3>
        <div className="text-sm text-blue-900 space-y-2">
          <p><strong>Per trip:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>🔒 Titipan</strong>: Cicilan peserta yang sudah pasti akan dibayar ke vendor (HPP proyeksi belum lunas)</li>
            <li><strong>⏳ Mengendap</strong>: Cicilan peserta yang BELUM bisa dialokasi karena HPP proyeksi belum di-set di Finance — uang masih "menggantung", BUKAN milik perusahaan, BUKAN titipan vendor (belum tau jadinya berapa)</li>
            <li><strong>💼 Margin Locked</strong>: Cicilan peserta yang LEBIH dari HPP proyeksi — sudah pasti jadi profit perusahaan</li>
          </ul>
          <p className="mt-2"><strong>Cara nge-set HPP proyeksi:</strong> Buka <Link href="/finance/cashflow" className="text-brand-600 hover:underline font-semibold">Finance → Proyeksi Income per Group</Link>, klik trip, tambah item HPP. Begitu HPP di-set, "mengendap" akan otomatis jadi "titipan" atau "margin locked".</p>
        </div>
      </div>
    </div>
  );
}
