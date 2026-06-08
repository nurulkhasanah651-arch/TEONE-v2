// Round 176: HR Dashboard — + card TL Payments terpisah
// Path: app/(app)/hr/page.jsx

import Link from 'next/link';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default async function HRDashboardPage() {
  let employeeCount = 0;
  let tlCount = 0;
  let tlPaymentsPending = 0;
  let tlPaymentsAmount = 0;
  let payrollLastPeriod = null;
  let setupError = null;

  try {
    const supabase = getServiceClient() || createClient();

    // Employees
    const { count: empCount, error: empErr } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true });
    if (empErr) setupError = empErr.message;
    else employeeCount = empCount || 0;

    // TL count
    const { count: tlC } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('employment_type', 'tour_leader');
    tlCount = tlC || 0;

    // TL payments stats
    try {
      const { data: tlPays } = await supabase
        .from('tl_payments')
        .select('amount, status');
      if (tlPays) {
        const pendings = tlPays.filter((p) => p.status === 'pending');
        tlPaymentsPending = pendings.length;
        tlPaymentsAmount = pendings.reduce((s, p) => s + Number(p.amount || 0), 0);
      }
    } catch {}

    // Last payroll period
    try {
      const { data: lastPeriod } = await supabase
        .from('payroll_periods')
        .select('id, period_label, status')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(1)
        .maybeSingle();
      payrollLastPeriod = lastPeriod;
    } catch {}
  } catch (e) {
    setupError = e?.message || 'Unknown error';
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">👥 HR / HDR</h1>
        <p className="mt-1 text-slate-600">Karyawan · Payroll · TL Payments · Absensi · KPI</p>
      </div>

      {setupError && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5">
          <p className="font-bold text-amber-800 text-lg mb-2">⚠ Setup Notice</p>
          <p className="text-sm text-amber-700 mb-2">{setupError}</p>
          <p className="text-xs text-amber-600">
            Kalau table belum ada, run SQL_FIX dari R170/R174/R176 di Supabase SQL Editor.
          </p>
        </div>
      )}

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Karyawan" value={employeeCount} color="bg-brand-50 text-brand-700" />
        <StatCard label="Tour Leaders" value={tlCount} color="bg-pink-50 text-pink-700" />
        <StatCard label="TL Payments Pending" value={tlPaymentsPending} sub={fmtIDR(tlPaymentsAmount)} color="bg-amber-50 text-amber-700" />
        <StatCard label="Payroll Terakhir" value={payrollLastPeriod?.period_label || '—'} sub={payrollLastPeriod?.status?.toUpperCase()} color="bg-green-50 text-green-700" small />
      </div>

      {/* MODULES */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Link href="/hr/employees" className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-5">
          <div className="text-3xl mb-2">👤</div>
          <p className="font-bold text-brand-700">Karyawan</p>
          <p className="text-xs text-slate-500 mt-0.5">{employeeCount} terdaftar</p>
        </Link>

        <Link href="/hr/payroll" className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-5">
          <div className="text-3xl mb-2">💰</div>
          <p className="font-bold text-brand-700">Payroll Karyawan</p>
          <p className="text-xs text-slate-500 mt-0.5">Gaji bulanan + slip + WA</p>
        </Link>

        {/* R176: TL PAYMENTS — TERPISAH */}
        <Link href="/hr/tl-payments" className="block bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl border border-pink-200 shadow-card hover:shadow-card-hover hover:border-pink-400 transition-all p-5 group">
          <div className="text-3xl mb-2">✈</div>
          <p className="font-bold text-pink-700 group-hover:underline">TL Payments</p>
          <p className="text-xs text-slate-600 mt-0.5">Per trip — 70% DP + 30% Final</p>
          {tlPaymentsPending > 0 && (
            <p className="mt-2 text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded inline-block">
              {tlPaymentsPending} PENDING
            </p>
          )}
        </Link>

        <Link href="/tl-master" className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-5">
          <div className="text-3xl mb-2">📋</div>
          <p className="font-bold text-brand-700">Master TL</p>
          <p className="text-xs text-slate-500 mt-0.5">List semua TL · {tlCount} aktif</p>
        </Link>

        <Link href="/hr/attendance" className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-5">
          <div className="text-3xl mb-2">🕐</div>
          <p className="font-bold text-brand-700">Absensi</p>
          <p className="text-xs text-slate-400 mt-0.5">Check-in/out & rekap kehadiran</p>
        </Link>

        <Link href="/hr/kpi" className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-5">
          <div className="text-3xl mb-2">🎯</div>
          <p className="font-bold text-brand-700">KPI</p>
          <p className="text-xs text-slate-400 mt-0.5">Target & realisasi per karyawan</p>
        </Link>
      </div>

      {/* QUICK ACTIONS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h2 className="text-sm font-bold text-brand-700 uppercase tracking-wider mb-3">⚡ Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/hr/employees/new" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
            + Karyawan Baru
          </Link>
          <Link href="/hr/payroll/new" className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg">
            💰 Generate Payroll
          </Link>
          <Link href="/hr/tl-payments" className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold rounded-lg">
            ✈ TL Payments
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, small }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${color}`}>
      <p className="text-[10px] font-bold uppercase opacity-70 tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${small ? 'text-base' : 'text-3xl'}`}>{value}</p>
      {sub && <p className="text-xs mt-1 font-mono opacity-80">{sub}</p>}
    </div>
  );
}
