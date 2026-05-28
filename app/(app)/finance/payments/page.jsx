// Round 157 HOTFIX: Payment Checklist LIST + DOWNLOAD BUTTONS
// Path: app/(app)/finance/payments/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import DownloadButtons from '@/components/common/DownloadButtons';

export const dynamic = 'force-dynamic';

export default async function PaymentsListPage() {
  const supabase = createClient();

  const [tripsRes, passengersRes, paymentsRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, status, departure, quota, sold').order('departure', { ascending: true }),
    supabase.from('trip_passengers').select('id, trip_id, price_paid'),
    supabase.from('participant_payments').select('passenger_id, amount, type'),
  ]);

  const trips = tripsRes.data || [];
  const passengers = passengersRes.data || [];
  const payments = paymentsRes.data || [];

  const paidByPassenger = {};
  for (const p of payments) {
    paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
  }

  const byTrip = {};
  for (const t of trips) {
    byTrip[t.id] = { ...t, expected: 0, paid: 0, paxCount: 0, lunasCount: 0 };
  }
  for (const p of passengers) {
    if (!byTrip[p.trip_id]) continue;
    byTrip[p.trip_id].expected += p.price_paid || 0;
    byTrip[p.trip_id].paid += paidByPassenger[p.id] || 0;
    byTrip[p.trip_id].paxCount++;
    if ((paidByPassenger[p.id] || 0) >= (p.price_paid || 0) && (p.price_paid || 0) > 0) {
      byTrip[p.trip_id].lunasCount++;
    }
  }

  const sorted = Object.values(byTrip).sort((a, b) => (b.departure || '').localeCompare(a.departure || ''));

  const grandExpected = sorted.reduce((s, t) => s + t.expected, 0);
  const grandPaid = sorted.reduce((s, t) => s + t.paid, 0);
  const grandPax = sorted.reduce((s, t) => s + t.paxCount, 0);
  const grandLunas = sorted.reduce((s, t) => s + t.lunasCount, 0);

  // R156: prep rows untuk download
  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
  const downloadRows = sorted.map((t) => ({
    kode: t.kode_trip || `#${t.id}`,
    name: t.name,
    status: t.status,
    departure: t.departure || '-',
    pax: t.paxCount,
    expected: t.expected,
    paid: t.paid,
    sisa: t.expected - t.paid,
    progress: t.expected > 0 ? `${Math.round((t.paid / t.expected) * 100)}%` : '-',
    lunas: `${t.lunasCount}/${t.paxCount}`,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Payment Checklist Peserta</h1>
          <p className="mt-1 text-slate-600">Tracking DP, Payment 1/2/3, Pelunasan, Visa, Asuransi per peserta.</p>
        </div>
        {/* R156: Download Payment Status SEMUA TRIP */}
        <DownloadButtons
          filename={`payment-status-semua-trip-${new Date().toISOString().slice(0,10)}`}
          title="Payment Status — Semua Trip"
          subtitle={`${sorted.length} trip · ${grandPax} pax · ${grandLunas} lunas`}
          extraInfo={[
            { label: 'Total Expected', value: fmtMoney(grandExpected) },
            { label: 'Total Paid', value: fmtMoney(grandPaid) },
            { label: 'Total Sisa', value: fmtMoney(grandExpected - grandPaid) },
          ]}
          columns={[
            { key: 'kode', label: 'Kode Trip' },
            { key: 'name', label: 'Trip' },
            { key: 'status', label: 'Status' },
            { key: 'departure', label: 'Departure' },
            { key: 'pax', label: 'Pax', align: 'right' },
            { key: 'expected', label: 'Expected', align: 'right', format: 'rupiah' },
            { key: 'paid', label: 'Paid', align: 'right', format: 'rupiah' },
            { key: 'sisa', label: 'Sisa', align: 'right', format: 'rupiah' },
            { key: 'progress', label: 'Progress', align: 'right' },
            { key: 'lunas', label: 'Lunas', align: 'right' },
          ]}
          rows={downloadRows}
          summary={[
            { label: 'GRAND TOTAL EXPECTED', value: fmtMoney(grandExpected) },
            { label: 'GRAND TOTAL PAID', value: fmtMoney(grandPaid) },
            { label: 'GRAND TOTAL SISA', value: fmtMoney(grandExpected - grandPaid) },
          ]}
          buttonSize="md"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Trip & Status Pembayaran Group</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2.5">Trip</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Peserta</th>
                <th className="px-3 py-2.5 text-right">Expected</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Lunas</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Belum ada trip.</td></tr>
              ) : sorted.map((t) => {
                const s = statusCfg(t.status);
                const progress = t.expected > 0 ? Math.round((t.paid / t.expected) * 100) : 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-brand-700">{t.kode_trip || `#${t.id}`}</p>
                      <p className="text-xs text-slate-500">{t.name}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(t.departure)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">{t.paxCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{fmtRupiah(t.expected)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-bold text-green-700">{fmtRupiah(t.paid)}</p>
                      <p className="text-[10px] text-slate-500">{progress}%</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-xs font-bold ${t.lunasCount === t.paxCount && t.paxCount > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                        {t.lunasCount} / {t.paxCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/finance/payments/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
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
