// PNR Inventory list — flight_inventory rows

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import PnrRow from '@/components/finance/PnrRow';

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

  const totalDeposit = (pnrs || []).reduce((s, p) => s + (p.deposit_total || 0), 0);
  const totalPayoff = (pnrs || []).reduce((s, p) => s + (p.payoff_amount || 0), 0);
  const unlinked = (pnrs || []).filter((p) => !p.trip_id).length;
  const linked = (pnrs || []).filter((p) => p.trip_id).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">PNR Inventory</h1>
          <p className="mt-1 text-slate-600">Deposit maskapai, harga tiket, vendor, deadline pelunasan.</p>
        </div>
        <Link
          href="/finance/pnr/new"
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
        >
          <span>+</span> Tambah PNR
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total PNR" value={(pnrs || []).length} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Linked to Trip" value={linked} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total Deposit" value={fmtRupiah(totalDeposit)} color="text-amber-700" bg="bg-amber-50" small />
        <StatCard label="Total Pelunasan" value={fmtRupiah(totalPayoff)} color="text-blue-700" bg="bg-blue-50" small />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Daftar PNR</h2>
          <p className="text-xs text-slate-500 mt-0.5">{unlinked} PNR belum di-link ke trip · {linked} sudah linked</p>
        </div>
        {!pnrs || pnrs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">✈</p>
            <p className="text-lg font-bold text-slate-700">Belum ada PNR</p>
            <p className="mt-1 text-sm text-slate-500">Klik "Tambah PNR" untuk mulai.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pnrs.map((p) => <PnrRow key={p.id} pnr={p} />)}
          </div>
        )}
      </div>
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
