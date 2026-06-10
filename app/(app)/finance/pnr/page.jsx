// Round 157 HOTFIX: PNR Inventory list + DOWNLOAD BUTTONS
// Path: app/(app)/finance/pnr/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import PnrRow from '@/components/finance/PnrRow';
import DownloadButtons from '@/components/common/DownloadButtons';

export const dynamic = 'force-dynamic';

export default async function PnrListPage() {
  const supabase = createClient();
  const { data: pnrs, error } = await supabase
    .from('flight_inventory')
    .select('*')
    .order('departure_date', { ascending: true, nullsFirst: false });

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-bold">Error loading PNRs</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  // Fetch trips untuk join nama trip
  const { data: trips } = await supabase.from('trips').select('id, kode_trip, name');
  const tripMap = Object.fromEntries((trips || []).map((t) => [t.id, t]));

  const totalDeposit = (pnrs || []).reduce((s, p) => s + (p.deposit_total || 0), 0);
  const totalPayoff = (pnrs || []).reduce((s, p) => s + (p.payoff_amount || 0), 0);
  const unlinked = (pnrs || []).filter((p) => !p.trip_id).length;
  const linked = (pnrs || []).filter((p) => p.trip_id).length;
  const groupCount = (pnrs || []).filter((p) => p.ticket_type !== 'fit').length;
  const fitCount = (pnrs || []).filter((p) => p.ticket_type === 'fit').length;

  // Pisahkan daftar: Group (PNR rombongan) vs FIT (individu)
  const groupPnrs = (pnrs || []).filter((p) => p.ticket_type !== 'fit');
  const fitPnrs = (pnrs || []).filter((p) => p.ticket_type === 'fit');

  // R156: prep rows untuk download
  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
  const downloadRows = (pnrs || []).map((p) => {
    const trip = tripMap[p.trip_id];
    return {
      pnr: p.pnr || `#${p.id}`,
      vendor: p.vendor || '-',
      airline: p.airline || '-',
      route: p.route || '-',
      departure_date: p.departure_date || '-',
      trip: trip ? `${trip.kode_trip || ''} ${trip.name}`.trim() : '(unlinked)',
      pax_count: p.pax_count || 0,
      deposit: p.deposit_total || 0,
      payoff: p.payoff_amount || 0,
      total_paid: (p.deposit_total || 0) + (p.payoff_amount || 0),
      deposit_due: p.deposit_due || '-',
      payoff_due: p.payoff_due || '-',
      status: p.status || '-',
    };
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">PNR Inventory</h1>
          <p className="mt-1 text-slate-600">Deposit maskapai, harga tiket, vendor, deadline pelunasan.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* R156: Download PNR Inventory */}
          <DownloadButtons
            filename={`pnr-inventory-${new Date().toISOString().slice(0,10)}`}
            title="PNR Inventory — Flight Bookings"
            subtitle={`${(pnrs || []).length} PNR · ${linked} linked · ${unlinked} unlinked`}
            extraInfo={[
              { label: 'Total Deposit', value: fmtMoney(totalDeposit) },
              { label: 'Total Pelunasan', value: fmtMoney(totalPayoff) },
              { label: 'Total Paid', value: fmtMoney(totalDeposit + totalPayoff) },
            ]}
            columns={[
              { key: 'pnr', label: 'PNR' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'airline', label: 'Airline' },
              { key: 'route', label: 'Route' },
              { key: 'departure_date', label: 'Departure' },
              { key: 'trip', label: 'Linked Trip' },
              { key: 'pax_count', label: 'Pax', align: 'right' },
              { key: 'deposit', label: 'Deposit', align: 'right', format: 'rupiah' },
              { key: 'payoff', label: 'Payoff', align: 'right', format: 'rupiah' },
              { key: 'total_paid', label: 'Total Paid', align: 'right', format: 'rupiah' },
              { key: 'deposit_due', label: 'Due Deposit' },
              { key: 'payoff_due', label: 'Due Payoff' },
              { key: 'status', label: 'Status' },
            ]}
            rows={downloadRows}
            summary={[
              { label: 'TOTAL DEPOSIT', value: fmtMoney(totalDeposit) },
              { label: 'TOTAL PAYOFF', value: fmtMoney(totalPayoff) },
              { label: 'GRAND TOTAL PAID', value: fmtMoney(totalDeposit + totalPayoff) },
            ]}
            buttonSize="md"
          />
          <Link
            href="/finance/pnr/new"
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
          >
            <span>+</span> Tambah PNR
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="✈ Group (PNR)" value={groupCount} color="text-sky-700" bg="bg-sky-50" />
        <StatCard label="🎫 FIT" value={fitCount} color="text-purple-700" bg="bg-purple-50" />
        <StatCard label="Linked to Trip" value={linked} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total Deposit" value={fmtRupiah(totalDeposit)} color="text-amber-700" bg="bg-amber-50" small />
        <StatCard label="Total Pelunasan" value={fmtRupiah(totalPayoff)} color="text-blue-700" bg="bg-blue-50" small />
      </div>

      {(!pnrs || pnrs.length === 0) ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">✈</p>
            <p className="text-lg font-bold text-slate-700">Belum ada PNR</p>
            <p className="mt-1 text-sm text-slate-500">Klik "Tambah PNR" untuk mulai.</p>
          </div>
        </div>
      ) : (
        <>
          <PnrSection
            title="✈ PNR Group"
            subtitle="Tiket rombongan / blok kursi"
            accent="text-sky-700"
            list={groupPnrs}
            emptyText="Belum ada PNR group."
          />
          <PnrSection
            title="🎫 FIT"
            subtitle="Tiket individu (Free Individual Traveller)"
            accent="text-purple-700"
            list={fitPnrs}
            emptyText="Belum ada tiket FIT."
          />
        </>
      )}
    </div>
  );
}

function PnrSection({ title, subtitle, accent, list, emptyText }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className={`font-bold ${accent}`}>{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-sm font-bold text-slate-500">{list.length} PNR</span>
      </div>
      {list.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">{emptyText}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {list.map((p) => <PnrRow key={p.id} pnr={p} />)}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
