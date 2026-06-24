// Round 159: Posisi Kas + DOWNLOAD (uang peserta vs perusahaan, per trip breakdown)
// Path: app/(app)/accounting/cash-position/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import { aggregateAccountBalances, computeTripCashBreakdown } from '@/lib/utils/accounting-aggregator';
import DownloadButtons from '@/components/common/DownloadButtons';
import { fetchAll } from '@/lib/supabase/fetch-all';

export const dynamic = 'force-dynamic';

export default async function CashPositionPage() {
  const supabase = createClient();
  const [accountsRes, entriesAll, payAll, passAll, finItemsAll, pnrRes, tripsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('active', true),
    fetchAll(() => supabase.from('accounting_entries').select('account_id, type, amount')),
    fetchAll(() => supabase.from('participant_payments').select('passenger_id, amount')),
    fetchAll(() => supabase.from('trip_passengers').select('id, trip_id')),
    fetchAll(() => supabase.from('trip_finance_items').select('trip_id, item_type, total_amount, payment_status')),
    supabase.from('flight_inventory').select('trip_id, deposit_total, payoff_amount'),
    supabase.from('trips').select('id, kode_trip, name, status, departure'),
  ]);

  const accounts = accountsRes.data || [];
  const balances = aggregateAccountBalances(accounts, entriesAll || []);
  const totalBank = Object.values(balances).reduce((s, b) => s + b.balance, 0);

  const trips = tripsRes.data || [];
  const breakdown = computeTripCashBreakdown({
    trips,
    passengers: passAll || [],
    payments: payAll || [],
    finItems: finItemsAll || [],
    pnrs: pnrRes.data || [],
  });

  const t = breakdown.totals;
  const uangPesertaInBank = t.titipan_locked + t.cicilan_mengendap;
  const uangPerusahaan = totalBank - uangPesertaInBank;

  const activeTrips = breakdown.perTrip.filter((p) => p.cicilanIn > 0 || p.hppTotal > 0).sort((a, b) =>
    (b.trip.departure || '').localeCompare(a.trip.departure || '')
  );

  // R159: prep summary rows untuk download
  const summaryRows = [
    { kategori: 'Bank/Kas', item: 'Total Saldo Bank/Kas', amount: totalBank },
    { kategori: 'Uang Peserta', item: 'Titipan Earmark Vendor', amount: t.titipan_locked },
    { kategori: 'Uang Peserta', item: 'Cicilan Mengendap (HPP belum di-set)', amount: t.cicilan_mengendap },
    { kategori: 'Uang Peserta', item: 'TOTAL Uang Peserta', amount: uangPesertaInBank },
    { kategori: 'Uang Perusahaan', item: 'Margin Locked (sudah pasti)', amount: t.margin_locked },
    { kategori: 'Uang Perusahaan', item: 'Capital/Lainnya', amount: uangPerusahaan - t.margin_locked },
    { kategori: 'Uang Perusahaan', item: 'TOTAL Uang Perusahaan', amount: uangPerusahaan },
    { kategori: 'Hutang', item: 'Hutang Vendor (HPP belum lunas)', amount: t.hppOwed },
  ];

  // R159: prep per-trip rows untuk download
  const perTripRows = activeTrips.map((p) => ({
    kode: p.trip.kode_trip || `#${p.trip.id}`,
    name: p.trip.name,
    departure: p.trip.departure || '-',
    status: p.trip.status || '-',
    cicilan_in: p.cicilanIn,
    hpp_paid: p.hppPaid,
    hpp_owed: p.hppOwed,
    titipan: p.titipan_locked,
    mengendap: p.cicilan_mengendap,
    margin_locked: p.margin_locked,
    projection_set: p.hasProjection ? 'YA' : 'BELUM',
  }));

  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Posisi Kas — Uang Peserta vs Uang Perusahaan</h1>
          <p className="mt-1 text-slate-600">Pisahkan mana cash yang earmark untuk vendor (titipan) vs yang sudah pasti milik perusahaan.</p>
        </div>
        {/* R159: Download FULL POSISI KAS */}
        <DownloadButtons
          filename={`posisi-kas-${new Date().toISOString().slice(0, 10)}`}
          title="Posisi Kas — Snapshot"
          subtitle={`Per ${new Date().toLocaleDateString('id-ID')}`}
          extraInfo={[
            { label: 'Total Saldo Bank/Kas', value: fmtMoney(totalBank) },
            { label: 'Uang Peserta (Titipan)', value: fmtMoney(uangPesertaInBank) },
            { label: 'Uang Perusahaan', value: fmtMoney(uangPerusahaan) },
            { label: 'Hutang Vendor', value: fmtMoney(t.hppOwed) },
          ]}
          columns={[
            { key: 'kategori', label: 'Kategori' },
            { key: 'item', label: 'Item' },
            { key: 'amount', label: 'Amount', align: 'right', format: 'rupiah' },
          ]}
          rows={summaryRows}
          summary={[
            { label: 'TOTAL BANK/KAS', value: fmtMoney(totalBank) },
            { label: 'TITIPAN PESERTA', value: fmtMoney(uangPesertaInBank) },
            { label: 'UANG PERUSAHAAN', value: fmtMoney(uangPerusahaan) },
            { label: 'HUTANG VENDOR', value: fmtMoney(t.hppOwed) },
          ]}
          buttonSize="md"
        />
      </div>

      {/* MAIN BREAKDOWN — visual stacked */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-bold text-brand-700 uppercase tracking-wider">🏦 Total Saldo Bank/Kas</h2>
          <p className="text-3xl font-bold text-brand-700">{fmtRupiah(totalBank)}</p>
        </div>

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
                <span>⏳ Mengendap</span>
                <span className="font-semibold">{fmtRupiah(t.cicilan_mengendap)}</span>
              </div>
            </div>
          </div>
        </div>

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

        <div className="rounded-xl shadow-card overflow-hidden bg-gradient-to-br from-red-500 to-red-700 text-white">
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">💼 HUTANG VENDOR</p>
            <p className="mt-2 text-3xl font-bold">{fmtRupiah(t.hppOwed)}</p>
            <p className="text-xs opacity-90 mt-2">HPP yang belum dibayar</p>
          </div>
        </div>
      </div>

      {/* PER TRIP BREAKDOWN */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-brand-700">📋 Detail per Trip — Uang Peserta vs Margin Locked</h2>
            <p className="text-xs text-slate-500 mt-0.5">Trip tanpa HPP proyeksi → cicilan = mengendap.</p>
          </div>
          {/* R159: Download per trip breakdown */}
          <DownloadButtons
            filename={`posisi-kas-per-trip-${new Date().toISOString().slice(0, 10)}`}
            title="Posisi Kas — Detail per Trip"
            subtitle={`${activeTrips.length} trip dengan activity`}
            columns={[
              { key: 'kode', label: 'Kode Trip' },
              { key: 'name', label: 'Nama Trip' },
              { key: 'departure', label: 'Departure', format: 'date' },
              { key: 'status', label: 'Status' },
              { key: 'cicilan_in', label: 'Cicilan Masuk', align: 'right', format: 'rupiah' },
              { key: 'hpp_paid', label: 'HPP Lunas', align: 'right', format: 'rupiah' },
              { key: 'hpp_owed', label: 'HPP Hutang', align: 'right', format: 'rupiah' },
              { key: 'titipan', label: 'Titipan', align: 'right', format: 'rupiah' },
              { key: 'mengendap', label: 'Mengendap', align: 'right', format: 'rupiah' },
              { key: 'margin_locked', label: 'Margin Locked', align: 'right', format: 'rupiah' },
              { key: 'projection_set', label: 'HPP Set?' },
            ]}
            rows={perTripRows}
            summary={[
              { label: 'TOTAL CICILAN', value: fmtMoney(t.cicilanIn) },
              { label: 'TOTAL TITIPAN', value: fmtMoney(t.titipan_locked) },
              { label: 'TOTAL MENGENDAP', value: fmtMoney(t.cicilan_mengendap) },
              { label: 'TOTAL MARGIN LOCKED', value: fmtMoney(t.margin_locked) },
            ]}
          />
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
                      <p className="text-[10px] text-yellow-700 font-semibold mt-0.5">⚠ HPP proyeksi belum di-set</p>
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
    </div>
  );
}
