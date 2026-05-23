// Round 92: Bank Reconciliation page

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import BankUploadForm from '@/components/accounting/BankUploadForm';
import MutationsTable from '@/components/accounting/MutationsTable';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage() {
  const supabase = createClient();

  const [mutationsRes, itemsRes] = await Promise.all([
    supabase
      .from('bank_mutations')
      .select('*')
      .order('tanggal', { ascending: false })
      .limit(500),
    supabase
      .from('trip_finance_items')
      .select('id, trip_id, item_type, category, component, vendor_name, total_amount, dp_paid, payment_status'),
  ]);

  const mutations = mutationsRes.data || [];
  const items = itemsRes.data || [];

  const stats = {
    total: mutations.length,
    matched: mutations.filter((m) => m.match_status === 'matched' || m.match_status === 'manual').length,
    unmatched: mutations.filter((m) => m.match_status === 'unmatched').length,
    totalCR: mutations.filter((m) => m.type === 'cr').reduce((s, m) => s + Number(m.amount || 0), 0),
    totalDB: mutations.filter((m) => m.type === 'db').reduce((s, m) => s + Number(m.amount || 0), 0),
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Bank Reconciliation</h1>
        <p className="mt-1 text-slate-600">
          Upload CSV mutasi bank → auto-match dengan Cash In (income) & Cash Out (HPP) di sistem.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Mutasi" value={stats.total} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Matched" value={`${stats.matched} / ${stats.total}`} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Uang Masuk (CR)" value={fmtRupiah(stats.totalCR)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Uang Keluar (DB)" value={fmtRupiah(stats.totalDB)} color="text-red-700" bg="bg-red-50" small />
      </div>

      <BankUploadForm />

      <MutationsTable mutations={mutations} financeItems={items} />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm space-y-2">
        <p className="font-bold text-blue-800">📘 Tips Download CSV Mutasi BCA:</p>
        <ol className="text-xs text-blue-700 list-decimal pl-5 space-y-1">
          <li>Login KlikBCA Individu → menu <b>Informasi Saldo & Mutasi</b> → pilih periode</li>
          <li>Klik <b>Cetak/Save</b> → pilih format <b>CSV</b> atau <b>TXT</b></li>
          <li>Atau dari myBCA app: <b>Aktivitas</b> → <b>Export</b> → CSV</li>
          <li>Untuk akun bisnis (KlikBCA Bisnis): menu <b>e-Statement</b> → download CSV</li>
        </ol>
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
