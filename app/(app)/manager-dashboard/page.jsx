// Manager Dashboard "Morning Monitoring" — owner / manager / accounting only (gated di layout).
// Path: app/(app)/manager-dashboard/page.jsx
import { getManagerDashboard } from '@/lib/actions/manager-dashboard';
import ManagerDashboard from '@/components/manager/ManagerDashboard';

export const dynamic = 'force-dynamic';

export default async function ManagerDashboardPage() {
  const res = await getManagerDashboard();
  if (res?.error) {
    return <div className="max-w-3xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div></div>;
  }
  return (
    <div className="max-w-6xl mx-auto">
      <ManagerDashboard data={res} />
    </div>
  );
}
