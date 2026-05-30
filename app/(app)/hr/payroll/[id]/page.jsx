// Round 171: Payroll period detail — list semua karyawan + edit per slip
// Path: app/(app)/hr/payroll/[id]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PayrollPeriodActions from '@/components/hr/PayrollPeriodActions';

export const dynamic = 'force-dynamic';

function fmtRupiah(v) { return 'Rp ' + Number(v || 0).toLocaleString('id-ID'); }

const STATUS_BADGE = {
  draft:     { label: 'DRAFT',     color: 'bg-amber-100 text-amber-700' },
  finalized: { label: 'FINALIZED', color: 'bg-blue-100 text-blue-700' },
  paid:      { label: 'PAID',      color: 'bg-green-100 text-green-700' },
};

const EMPLOYMENT_BADGE = {
  fulltime:    { label: 'FT', color: 'bg-blue-100 text-blue-700' },
  parttime:    { label: 'PT', color: 'bg-purple-100 text-purple-700' },
  freelance:   { label: 'FL', color: 'bg-amber-100 text-amber-700' },
  tour_leader: { label: 'TL', color: 'bg-pink-100 text-pink-700' },
  contract:    { label: 'CT', color: 'bg-slate-100 text-slate-700' },
};

export default async function PayrollDetailPage({ params }) {
  const { id } = await params;
  const supabase = createClient();

  const [periodRes, entriesRes] = await Promise.all([
    supabase.from('payroll_periods').select('*').eq('id', id).maybeSingle(),
    supabase.from('payroll_entries')
      .select('*, employee:employees(id, full_name, nickname, employment_type, role, position, bank_name, bank_account_number, bank_account_holder)')
      .eq('period_id', id)
      .order('id'),
  ]);

  if (!periodRes.data) notFound();
  const period = periodRes.data;
  const entries = entriesRes.data || [];
  const status = STATUS_BADGE[period.status] || STATUS_BADGE.draft;

  const paidCount = entries.filter((e) => e.status === 'paid').length;
  const draftCount = entries.length - paidCount;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/hr/payroll" className="text-sm text-brand-600 font-medium hover:underline">← Payroll</Link>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold text-brand-700">💰 Payroll {period.period_label}</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.color}`}>{status.label}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {period.total_employees} karyawan · {paidCount} paid · {draftCount} draft
          </p>
          {period.notes && <p className="text-xs text-slate-500 italic mt-1">📝 {period.notes}</p>}
        </div>
        <PayrollPeriodActions period={period} entriesCount={entries.length} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Gross" value={fmtRupiah(period.total_gross)} color="text-slate-700" bg="bg-slate-50" />
        <StatCard label="Total Potongan" value={fmtRupiah(period.total_deductions)} color="text-red-700" bg="bg-red-50" />
        <StatCard label="Total Cair" value={fmtRupiah(period.total_net)} color="text-green-700" bg="bg-green-50" />
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-brand-700">📋 Slip Gaji per Karyawan</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase">
                <th className="px-4 py-2.5">Karyawan</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5 text-right">Base</th>
                <th className="px-3 py-2.5 text-right">Tunjangan</th>
                <th className="px-3 py-2.5 text-right">Per-Trip / Bonus</th>
                <th className="px-3 py-2.5 text-right">Gross</th>
                <th className="px-3 py-2.5 text-right">Potongan</th>
                <th className="px-3 py-2.5 text-right">Cair</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr><td colSpan="10" className="px-4 py-8 text-center text-slate-500">Belum ada entry.</td></tr>
              ) : entries.map((e) => {
                const emp = e.employee || {};
                const empType = EMPLOYMENT_BADGE[emp.employment_type] || { label: '?', color: 'bg-slate-100' };
                const tunjangan = (e.transport_allowance || 0) + (e.meal_allowance || 0);
                const bonusEarning = (e.per_trip_earnings || 0) + (e.bonus || 0) + (e.overtime || 0) + (e.freelance_earnings || 0) + (e.other_earnings || 0);
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-brand-700">{emp.full_name || '-'}</p>
                      <p className="text-[10px] text-slate-500">{emp.position || emp.role || ''}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${empType.color}`}>{empType.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-mono">{fmtRupiah(e.base_salary)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-mono">{fmtRupiah(tunjangan)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-mono">
                      {fmtRupiah(bonusEarning)}
                      {e.trip_count > 0 && <p className="text-[9px] text-slate-500">{e.trip_count} trip</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold">{fmtRupiah(e.gross_total)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-mono text-red-700">- {fmtRupiah(e.total_deductions)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-green-700">{fmtRupiah(e.net_pay)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${e.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {e.status?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/hr/payroll/${id}/entry/${e.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
              <tr>
                <td className="px-4 py-2.5" colSpan="5">TOTAL</td>
                <td className="px-3 py-2.5 text-right text-xs">{fmtRupiah(period.total_gross)}</td>
                <td className="px-3 py-2.5 text-right text-xs text-red-700">- {fmtRupiah(period.total_deductions)}</td>
                <td className="px-3 py-2.5 text-right text-green-700">{fmtRupiah(period.total_net)}</td>
                <td colSpan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
