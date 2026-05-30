// Round 173 MINIMAL: HR page yang DIJAMIN tidak crash
// Path: app/(app)/hr/page.jsx
// Versi ini ZERO dependency ke lib/actions/hr atau component lain
// Untuk isolate root cause crash

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HRDashboardPage() {
  // Defensive — fetch langsung disini, gak via server action
  let employeeCount = 0;
  let setupError = null;

  try {
    const supabase = createClient();
    const { count, error } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true });

    if (error) {
      setupError = error.message;
    } else {
      employeeCount = count || 0;
    }
  } catch (e) {
    setupError = e?.message || 'Unknown error';
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">👥 HR / HDR</h1>
        <p className="mt-1 text-slate-600">Karyawan · Payroll · Absensi · KPI</p>
      </div>

      {setupError && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5">
          <p className="font-bold text-amber-800 text-lg mb-2">⚠ Setup Notice</p>
          <p className="text-sm text-amber-700 mb-2">{setupError}</p>
          <p className="text-xs text-amber-600">
            Kalau table belum ada, run dulu SQL_FIX_hr_tables.txt dari R170 di Supabase SQL Editor.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-brand-50">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Total Karyawan</p>
          <p className="mt-1 text-3xl font-bold text-brand-700">{employeeCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/hr/employees" className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-4">
          <div className="text-3xl mb-2">👤</div>
          <p className="font-bold text-brand-700">Karyawan</p>
          <p className="text-xs text-slate-500 mt-0.5">{employeeCount} terdaftar</p>
        </Link>
        <Link href="/hr/payroll" className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all p-4">
          <div className="text-3xl mb-2">💰</div>
          <p className="font-bold text-brand-700">Payroll</p>
          <p className="text-xs text-slate-500 mt-0.5">Gaji & slip</p>
        </Link>
        <div className="block bg-slate-50 rounded-xl border border-slate-200 p-4 opacity-50">
          <div className="text-3xl mb-2">🕐</div>
          <p className="font-bold text-slate-500">Absensi</p>
          <p className="text-xs text-slate-400 mt-0.5">🔜 Coming Soon</p>
        </div>
        <div className="block bg-slate-50 rounded-xl border border-slate-200 p-4 opacity-50">
          <div className="text-3xl mb-2">🎯</div>
          <p className="font-bold text-slate-500">KPI</p>
          <p className="text-xs text-slate-400 mt-0.5">🔜 Coming Soon</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h2 className="text-sm font-bold text-brand-700 uppercase tracking-wider mb-3">⚡ Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/hr/employees/new" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
            + Karyawan Baru
          </Link>
          <Link href="/hr/payroll/new" className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg">
            💰 Generate Payroll
          </Link>
        </div>
      </div>
    </div>
  );
}
