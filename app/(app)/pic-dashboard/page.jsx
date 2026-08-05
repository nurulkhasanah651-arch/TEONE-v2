// Dashboard PIC — monitor pribadi (trip yang di-assign ke PIC) + To-Do harian.
// Path: app/(app)/pic-dashboard/page.jsx
import { getPicDashboard } from '@/lib/actions/pic-dashboard';
import { getDailyTodos } from '@/lib/actions/daily-todo';
import PicDashboard from '@/components/pic/PicDashboard';
import DailyTodo from '@/components/manager/DailyTodo';

export const dynamic = 'force-dynamic';

export default async function PicDashboardPage({ searchParams }) {
  const sp = await searchParams;
  const res = await getPicDashboard();
  if (res?.error) {
    return <div className="max-w-3xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div></div>;
  }
  const todos = await getDailyTodos(sp?.date);
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PicDashboard data={res} />
      <div id="todo" className="pt-2 border-t border-slate-200">
        {todos?.error
          ? <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {todos.error}</div>
          : <DailyTodo data={todos} basePath="/pic-dashboard" />}
      </div>
    </div>
  );
}
