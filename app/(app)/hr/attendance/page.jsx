// HR Absensi — self check-in/out + rekap kehadiran tim
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMyAttendanceToday } from '@/lib/actions/attendance';
import AttendancePanel from '@/components/hr/AttendancePanel';

function ym() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

export default async function AttendancePage({ searchParams }) {
  const sp = await searchParams;
  const { y, m } = ym();
  const year = parseInt(sp?.y) || y;
  const month = parseInt(sp?.m) || m;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role || user?.user_metadata?.role || null;
  const isAdmin = ['owner', 'accounting', 'manager'].includes(role);

  const mine = await getMyAttendanceToday().catch(() => null);

  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endD = new Date(Date.UTC(year, month, 0));
  const endStr = endD.toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from('attendance')
    .select('*, employees(full_name, role)')
    .gte('date', startStr).lte('date', endStr)
    .order('date', { ascending: false });

  let visibleRows = rows || [];
  if (!isAdmin && mine?.employee?.id) {
    visibleRows = visibleRows.filter((r) => r.employee_id === mine.employee.id);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <Link href="/hr" className="text-sm text-brand-600 font-medium hover:underline">← HR</Link>
        <h1 className="mt-1 text-2xl font-bold text-brand-700">🕐 Absensi</h1>
        <p className="text-xs text-slate-500">Jam kerja standar 09:00–17:00. Telat dihitung dari 09:00, lembur dari 17:00.</p>
      </div>

      <AttendancePanel mine={mine} rows={visibleRows} isAdmin={isAdmin} year={year} month={month} />
    </div>
  );
}
