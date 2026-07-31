// Dashboard Manager — owner / manager / accounting only (gated di layout).
// Path: app/(app)/manager-dashboard/page.jsx
import { getManagerDashboard } from '@/lib/actions/manager-dashboard';
import { getDailyTodos } from '@/lib/actions/daily-todo';
import ManagerDashboard from '@/components/manager/ManagerDashboard';
import DailyTodo from '@/components/manager/DailyTodo';

export const dynamic = 'force-dynamic';

export default async function ManagerDashboardPage({ searchParams }) {
  const sp = await searchParams;
  const res = await getManagerDashboard();
  if (res?.error) {
    return <div className="max-w-3xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div></div>;
  }
  const todos = await getDailyTodos(sp?.date);
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <ManagerDashboard data={res} />
      <div id="todo" className="pt-2 border-t border-slate-200">
        {todos?.error
          ? <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {todos.error}</div>
          : <DailyTodo data={todos} basePath="/manager-dashboard" />}
      </div>
    </div>
  );
}
