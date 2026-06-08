// HR KPI — definisi metrik + realisasi bulanan per karyawan
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getKpiData } from '@/lib/actions/kpi';
import KpiPanel from '@/components/hr/KpiPanel';

export default async function KpiPage({ searchParams }) {
  const sp = await searchParams;
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const year = parseInt(sp?.y) || now.getUTCFullYear();
  const month = parseInt(sp?.m) || (now.getUTCMonth() + 1);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role || null;
  const isAdmin = ['owner', 'accounting', 'manager'].includes(role);

  const data = await getKpiData(year, month).catch(() => null);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <Link href="/hr" className="text-sm text-brand-600 font-medium hover:underline">← HR</Link>
        <h1 className="mt-1 text-2xl font-bold text-brand-700">🎯 KPI Karyawan</h1>
        <p className="text-xs text-slate-500">Set target per role, isi realisasi bulanan (sebagian auto dari data CS). Skor & achievement otomatis.</p>
      </div>
      {data?.error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{data.error}</div>
      ) : (
        <KpiPanel
          year={year} month={month} isAdmin={isAdmin}
          definitions={data?.definitions || []}
          employees={data?.employees || []}
          records={data?.records || []}
          autoByOfficer={data?.autoByOfficer || {}}
        />
      )}
    </div>
  );
}
