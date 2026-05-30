// Round 170: HR Dashboard
// Path: app/(app)/hr/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getHRDashboardData } from '@/lib/actions/hr';

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
        <SectionCard
          href="/hr/employees"
          icon="👤"
          title="Karyawan"
          desc={`${stats.total_employees} terdaftar`}
          color="from-blue-500 to-blue-700"
        />
        <SectionCard
          href="/hr/payroll"
          icon="💰"
          title="Payroll"
          desc="Gaji & slip pembayaran"
          color="from-green-500 to-emerald-700"
        />
        <SectionCard
          href="/hr/attendance"
          icon="🕐"
          title="Absensi"
          desc="Clock in/out + cuti"
          color="from-purple-500 to-purple-700"
        />
        <SectionCard
          href="/hr/kpi"
          icon="🎯"
          title="KPI"
          desc="Performance tracking"
          color="from-amber-500 to-orange-700"
        />
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h2 className="text-sm font-bold text-brand-700 uppercase tracking-wider mb-3">⚡ Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/hr/employees/new" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
            + Karyawan Baru
          </Link>
          <Link href="/hr/payroll/new" className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg">
            + Generate Payroll Bulan Ini
          </Link>
          <Link href="/hr/attendance/today" className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg">
            🕐 Absensi Hari Ini
          </Link>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-bold mb-1">⚠ HR Module — R170 Foundation</p>
        <p className="text-xs">
          Saat ini sudah ada: <b>Employees CRUD</b>. Coming soon: Payroll generator (R171), Attendance clock in/out (R172), KPI auto-track (R173).
          Mulai dengan tambah karyawan dulu, baru next round bisa generate payroll & track absensi.
        </p>
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
  const entries = Object.entries(data);
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

function SectionCard({ href, icon, title, desc, color }) {
  return (
    <Link href={href} className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${color}`} />
      <div className="p-4">
        <div className="text-3xl mb-2">{icon}</div>
        <p className="font-bold text-brand-700">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
