// Round 174: Payroll period detail — TL per-trip grouped + bukti indicator
// Path: app/(app)/hr/payroll/[id]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import PayrollPeriodActions from '@/components/hr/PayrollPeriodActions';

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
function fmtDate(v) {
  if (!v) return '-';
  try { return new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(v); }
}

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

export default async function PayrollDetailPage(props) {
  const params = await Promise.resolve(props.params);
  const id = params?.id;

  const supabase = getServiceClient() || createClient();

  const [periodRes, entriesRes] = await Promise.all([
    supabase.from('payroll_periods').select('*').eq('id', id).maybeSingle(),
    supabase.from('payroll_entries')
      .select('*, employee:employees(id, full_name, nickname, employment_type, role, position, bank_name, bank_account_number, bank_account_holder)')
      .eq('period_id', id)
      .order('employee_id')
      .order('trip_departure', { ascending: true, nullsFirst: false }),
  ]);

  if (!periodRes.data) notFound();
  const period = periodRes.data;
  const entries = entriesRes.data || [];
  const status = STATUS_BADGE[period.status] || STATUS_BADGE.draft;

  const paidCount = entries.filter((e) => e.status === 'paid').length;
  const draftCount = entries.length - paidCount;

  // R174: Separate TL per-trip entries vs monthly entries
  const monthlyEntries = entries.filter((e) => e.entry_type !== 'per_trip');
  const trippEntries = entries.filter((e) => e.entry_type === 'per_trip');

  // Group TL entries by employee
  const tlByEmployee = {};
  for (const e of trippEntries) {
    const empId = e.employee?.id || 'unknown';
    if (!tlByEmployee[empId]) {
      tlByEmployee[empId] = {
        employee: e.employee,
        trips: [],
        total: 0,
      };
    }
    tlByEmployee[empId].trips.push(e);
    tlByEmployee[empId].total += e.net_pay || 0;
  }

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
            {entries.length} entry · {paidCount} paid · {draftCount} draft
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

      {/* MONTHLY ENTRIES (FT, PT, Contract, Freelance) */}
      {monthlyEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="font-bold text-brand-700">📋 Karyawan Bulanan ({monthlyEntries.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-bold text-slate-600 uppercase">
                  <th className="px-4 py-2.5">Karyawan</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5 text-right">Gross</th>
                  <th className="px-3 py-2.5 text-right">Potongan</th>
                  <th className="px-3 py-2.5 text-right">Cair</th>
                  <th className="px-3 py-2.5 text-center">Bukti</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyEntries.map((e) => {
                  const emp = e.employee || {};
                  const empType = EMPLOYMENT_BADGE[emp.employment_type] || { label: '?', color: 'bg-slate-100' };
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-brand-700">{emp.full_name || '-'}</p>
                        <p className="text-[10px] text-slate-500">{emp.position || emp.role || ''}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${empType.color}`}>{empType.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono">{fmtRupiah(e.gross_total)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono text-red-700">- {fmtRupiah(e.total_deductions)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-700">{fmtRupiah(e.net_pay)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {e.payment_proof_url ? <span className="text-green-600">📎</span> : <span className="text-slate-300">—</span>}
                      </td>
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
            </table>
          </div>
        </div>
      )}

      {/* TL PER-TRIP (grouped by employee) */}
      {Object.keys(tlByEmployee).length > 0 && (
        <div className="bg-white rounded-xl border border-pink-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-pink-200 bg-pink-50">
            <h2 className="font-bold text-pink-800">✈ Tour Leader — Per Trip ({trippEntries.length} payment)</h2>
            <p className="text-xs text-pink-600 mt-0.5">TL dibayar per-trip. Setiap trip = 1 slip terpisah.</p>
          </div>
          <div className="divide-y divide-pink-100">
            {Object.entries(tlByEmployee).map(([empId, group]) => (
              <div key={empId} className="p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-pink-800">{group.employee?.full_name}</p>
                    <p className="text-[11px] text-slate-500">{group.trips.length} trip · Total: {fmtRupiah(group.total)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-[10px] font-bold text-slate-600 uppercase">
                        <th className="px-3 py-2">Trip</th>
                        <th className="px-3 py-2">Departure</th>
                        <th className="px-3 py-2 text-right">Fee</th>
                        <th className="px-3 py-2 text-center">Bukti</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.trips.map((t) => (
                        <tr key={t.id} className="hover:bg-pink-50/30">
                          <td className="px-3 py-2">
                            {t.trip_kode ? (
                              <>
                                <p className="font-semibold text-pink-700">{t.trip_kode}</p>
                                <p className="text-[10px] text-slate-500">{t.trip_name || '-'}</p>
                              </>
                            ) : (
                              <span className="text-slate-400 italic">— tidak ada trip —</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[11px]">{fmtDate(t.trip_departure)}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-700">{fmtRupiah(t.net_pay)}</td>
                          <td className="px-3 py-2 text-center">
                            {t.payment_proof_url ? <span className="text-green-600">📎</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${t.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {t.status?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Link href={`/hr/payroll/${id}/entry/${t.id}`} className="text-[11px] font-semibold text-brand-600 hover:underline">Edit</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-8 text-center">
          <p className="text-sm text-slate-500">Belum ada entry di periode ini.</p>
        </div>
      )}
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
