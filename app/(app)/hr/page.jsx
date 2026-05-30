// Round 172 HOTFIX: HR Dashboard — defensive, tampilin setup warning
// Path: app/(app)/hr/page.jsx

import Link from 'next/link';
import { getHRDashboardData } from '@/lib/actions/hr';
import SyncEmailsButton from '@/components/hr/SyncEmailsButton';

export const dynamic = 'force-dynamic';

export default async function HRDashboardPage() {
  const stats = await getHRDashboardData();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">👥 HR / HDR</h1>
        <p className="mt-1 text-slate-600">
          Karyawan · Payroll · Absensi · KPI — semua dalam satu tab.
        </p>
      </div>

      {/* R172: Setup warning kalau SQL belum di-run */}
      {stats.setup_needed && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
          <p className="font-bold text-red-800 text-lg mb-2">⚠ Setup HR Module Belum Selesai</p>
          <p className="text-sm text-red-700 mb-3">
            Database table HR belum ada. Tanpa table ini, fitur HR tidak akan jalan.
          </p>
          <div className="bg-white border border-red-200 rounded-lg p-3 text-xs">
            <p className="font-bold text-red-800 mb-1">Cara fix:</p>
            <ol className="list-decimal pl-5 space-y-1 text-slate-700">
              <li>Buka Supabase Dashboard → SQL Editor</li>
              <li>Copy isi file <code className="bg-slate-100 px-1 rounded">SQL_FIX_hr_tables.txt</code> dari folder R170</li>
              <li>Paste → Run</li>
              <li>Setelah berhasil, refresh halaman ini</li>
            </ol>
          </div>
          {stats.setup_error && (
            <p className="mt-2 text-[11px] text-red-600 font-mono bg-white p-2 rounded border border-red-100">
              Error: {stats.setup_error}
            </p>
          )}
        </div>
      )}

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Karyawan" value={stats.total_employees} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Active" value={stats.active_employees} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Inactive" value={stats.total_employees - stats.active_employees} color="text-slate-700" bg="bg-slate-50" />
        <StatCard label="Pending Leave" value={stats.pending_leaves} color="text-amber-700" bg="bg-amber-50" />
      </div>

      {/* By type breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BreakdownCard title="Per Employment Type" data={stats.by_type} />
        <BreakdownCard title="Per Role" data={stats.by_role} />
        <BreakdownCard title="Per Department" data={stats.by_department} />
      </div>

      {/* Sub-menu cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SectionCard href="/hr/employees" icon="👤" title="Karyawan" desc={`${stats.total_employees} terdaftar`} color="from-blue-500 to-blue-700" available />
        <SectionCard href="/hr/payroll" icon="💰" title="Payroll" desc="Gaji & slip pembayaran" color="from-green-500 to-emerald-700" available />
        <SectionCard href="/hr/attendance" icon="🕐" title="Absensi" desc="Coming R-future" color="from-purple-500 to-purple-700" />
        <SectionCard href="/hr/kpi" icon="🎯" title="KPI" desc="Coming R-future" color="from-amber-500 to-orange-700" />
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h2 className="text-sm font-bold text-brand-700 uppercase tracking-wider mb-3">⚡ Quick Actions</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <Link href="/hr/employees/new" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
            + Karyawan Baru
          </Link>
          <Link href="/hr/payroll/new" className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg">
            💰 Generate Payroll Bulan Ini
          </Link>
        </div>

        <div className="pt-3 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-700 mb-2">🔗 Auto-Link Karyawan ke Akun TEONE</p>
          <p className="text-[11px] text-slate-500 mb-2">
            Cocokin email karyawan ke akun TEONE yang udah login.
          </p>
          <SyncEmailsButton />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function BreakdownCard({ title, data }) {
  const entries = Object.entries(data || {});
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Belum ada data</p>
      ) : (
        <div className="space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-slate-700 capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="font-bold text-brand-700">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionCard({ href, icon, title, desc, color, available = false }) {
  const isComing = !available;
  return (
    <Link
      href={isComing ? '#' : href}
      onClick={(e) => isComing && e.preventDefault()}
      className={`block bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden ${isComing ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-card-hover hover:-translate-y-0.5 transition-all'}`}
    >
      <div className={`h-1.5 bg-gradient-to-r ${color}`} />
      <div className="p-4">
        <div className="text-3xl mb-2">{icon}</div>
        <p className="font-bold text-brand-700">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        {isComing && (
          <p className="text-[10px] text-amber-600 font-semibold mt-1">🔜 Coming Soon</p>
        )}
      </div>
    </Link>
  );
}
