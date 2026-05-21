// Tasks page — to-do list assign antar tim

import { createClient } from '@/lib/supabase/server';
import { syncCurrentTeamMember, listTeamMembers } from '@/lib/actions/team-collab';
import TasksBox from '@/components/tasks/TasksBox';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try {
    const r = await promise;
    return r.data || fallback;
  } catch {
    return fallback;
  }
}

export default async function TasksPage() {
  await syncCurrentTeamMember();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const members = await listTeamMembers();

  // My tasks (assigned TO me)
  const myTasks = await safeQuery(
    supabase.from('team_tasks')
      .select('*')
      .eq('assignee_id', user.id)
      .order('status')
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
  );

  // Tasks I assigned (created BY me)
  const assignedByMe = await safeQuery(
    supabase.from('team_tasks')
      .select('*')
      .eq('assigner_id', user.id)
      .order('status')
      .order('created_at', { ascending: false })
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-brand-700">To-Do List Tim</h1>
        <p className="mt-1 text-slate-600">Assign tugas ke tim, lihat tugas kamu sendiri, mark selesai.</p>
      </div>

      <TasksBox
        currentUserId={user.id}
        members={members}
        myTasks={myTasks}
        assignedByMe={assignedByMe}
      />
    </div>
  );
}
