// Round 178: Payroll list — + bulk sync ke cash out accounting
// Path: app/(app)/hr/payroll/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { bulkSyncPayrollToAccounting } from '@/lib/actions/payroll';
import BulkSyncAccountingButton from '@/components/hr/BulkSyncAccountingButton';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtRupiah(v) { return 'Rp ' + Number(v || 0).toLocaleString('id-ID'); }

const STATUS_BADGE = {
  draft:     { label: 'DRAFT',     color: 'bg-amber-100 text-amber-700' },
  finalized: { label: 'FINALIZED', color: 'bg-blue-100 text-blue-700' },
  paid:      { label: 'PAID',      color: 'bg-green-100 text-green-700' },
};

export default async function PayrollListPage() {
  const supabase = getServiceClient() || createClient();
  const { data: periods } = await supabase
    .from('payroll_periods')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  const list = periods || [];
  const totalAllNet = list.reduce((s, p) => s + (p.total_net || 0), 0);

  // R178: Count paid entries yang belum ter-sync ke accounting
  let unsyncedCount = 0;
  try {
    const { count } = await supabase
      .from('payroll_entries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'paid')
      .is('accounting_entry_id', null);
    unsyncedCount = count || 0;
  } catch {}

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/hr" className="text-sm text-brand-600 font-medium hover:underline">← HR</Link>
          <h1 className="mt-1 text-3xl font-bold text-brand-700">💰 Payroll</h1>
          <p className="mt-1 text-slate-600">Generate payroll per bulan · Auto-sync gaji paid ke cash out accounting</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href="/hr/payroll/new" className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card">
            + Generate Payroll Baru
          </Link>
          {/* R178: Bulk sync paid payroll ke cash out */}
          <BulkSyncAccountingButton bulkSyncAction={async () => {
            'use server';
            return await bulkSyncPayrollToAccounting();
          }} />
        </div>
      </div>

      {unsyncedCount > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 text-sm text-amber-900">
          ⚠ <b>{unsyncedCount}</b> payroll entries sudah <b>PAID</b> tapi belum tersync ke cash out accounting.
          Klik tombol <b>🔄 Bulk Sync ke Accounting</b> di atas untuk backfill.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Periode" value={list.length} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Total Karyawan" value={list[0]?.total_employees || 0} sub="periode terakhir" color="text-blue-700" bg="bg-blue-50" />
        <StatCard label="Total Cair (semua periode)" value={fmtRupiah(totalAllNet)} color="text-green-700" bg="bg-green-50" small />
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">💰</p>
          <p className="text-lg font-bold text-slate-700">Belum ada payroll</p>
          <p className="mt-1 text-sm text-slate-500">Klik "+ Generate Payroll Baru" untuk auto-hitung gaji karyawan.</p>
          <Link href="/hr/payroll/new" className="mt-4 inline-block px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
            + Generate Sekarang
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-bold text-slate-600 uppercase">
                  <th className="px-4 py-2.5">Periode</th>
                  <th className="px-3 py-2.5 text-center">Karyawan</th>
                  <th className="px-3 py-2.5 text-right">Total Gross</th>
                  <th className="px-3 py-2.5 text-right">Potongan</th>
                  <th className="px-3 py-2.5 text-right">Total Cair</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((p) => {
                  const status = STATUS_BADGE[p.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-brand-700">{p.period_label}</p>
                        <p className="text-[10px] text-slate-500">
                          {p.finalized_at && `Finalized: ${new Date(p.finalized_at).toLocaleDateString('id-ID')}`}
                          {p.paid_at && ` · Paid: ${new Date(p.paid_at).toLocaleDateString('id-ID')}`}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold">{p.total_employees || 0}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono">{fmtRupiah(p.total_gross)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono text-red-700">- {fmtRupiah(p.total_deductions)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-700">{fmtRupiah(p.total_net)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={`/hr/payroll/${p.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Detail →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-3xl'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
