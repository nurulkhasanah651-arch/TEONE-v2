'use client';

// Round 147: TasksBox + History tab + notif auto-trigger
// Path: components/tasks/TasksBox.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTask, markTaskDone, reopenTask, deleteTask } from '@/lib/actions/team-collab';
import { fmtDate, daysUntil } from '@/lib/utils/format';

const PRIORITY_CFG = {
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-600' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  high:   { label: 'High',   color: 'bg-amber-100 text-amber-700' },
  urgent: { label: 'URGENT', color: 'bg-red-100 text-red-700 animate-pulse' },
};

export default function TasksBox({ currentUserId, members = [], myTasks = [], assignedByMe = [] }) {
  const [tab, setTab] = useState('mine');
  const [showForm, setShowForm] = useState(false);
  const [doneTaskId, setDoneTaskId] = useState(null);
  const [doneNote, setDoneNote] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const otherMembers = members.filter((m) => m.user_id !== currentUserId);

  async function handleCreate(formData) {
    startTransition(async () => {
      const r = await createTask(formData);
      if (r?.error) { alert(r.error); return; }
      setShowForm(false);
      router.refresh();
    });
  }

  async function handleMarkDone(taskId) {
    startTransition(async () => {
      const r = await markTaskDone(taskId, doneNote);
      if (r?.error) { alert(r.error); return; }
      setDoneTaskId(null);
      setDoneNote('');
      router.refresh();
    });
  }

  async function handleReopen(taskId) {
    if (!confirm('Buka kembali tugas ini?')) return;
    startTransition(async () => {
      const r = await reopenTask(taskId);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  async function handleDelete(taskId) {
    if (!confirm('Hapus tugas ini permanen?')) return;
    startTransition(async () => {
      const r = await deleteTask(taskId);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  const myPending = myTasks.filter((t) => t.status === 'pending');
  const myDone = myTasks.filter((t) => t.status === 'done');
  const assignedPending = assignedByMe.filter((t) => t.status === 'pending');
  const assignedDone = assignedByMe.filter((t) => t.status === 'done');

  // ROUND 147: History = SEMUA done (myDone + assignedDone) — unique by id
  const allDoneMap = new Map();
  [...myDone, ...assignedDone].forEach((t) => allDoneMap.set(t.id, t));
  const allDone = Array.from(allDoneMap.values()).sort((a, b) =>
    new Date(b.completed_at || 0) - new Date(a.completed_at || 0)
  );

  return (
    <div className="space-y-4">
      {/* Tabs + add button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTab('mine')}
            className={`px-4 py-2 text-sm font-bold rounded-lg ${tab === 'mine' ? 'bg-brand-500 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            📥 Tugas untuk Saya ({myPending.length})
          </button>
          <button
            onClick={() => setTab('assigned')}
            className={`px-4 py-2 text-sm font-bold rounded-lg ${tab === 'assigned' ? 'bg-brand-500 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            📤 Saya Assign ({assignedPending.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2 text-sm font-bold rounded-lg ${tab === 'history' ? 'bg-green-500 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            📚 History ({allDone.length})
          </button>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg">
          {showForm ? '× Tutup' : '+ Tugas Baru'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form action={handleCreate} className="bg-white border-2 border-amber-300 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-amber-800">+ Buat Tugas Baru</h3>
          <input autoComplete="off" name="title" required placeholder="Judul tugas (mis: Follow up peserta KARANG)" className={inputCls} />
          <textarea autoComplete="off" name="description" rows="2" placeholder="Detail (opsional)" className={inputCls + ' resize-none'} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Assign ke <span className="text-red-500">*</span></span>
              <select name="assignee_id" required className={inputCls}>
                <option value="">— Pilih tim member —</option>
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.name || m.email} ({m.role})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Deadline</span>
              <input autoComplete="off" type="date" name="deadline" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Prioritas</span>
              <select name="priority" defaultValue="normal" className={inputCls}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">URGENT</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Batal</button>
            <button type="submit" disabled={pending} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded disabled:opacity-50">
              {pending ? 'Membuat...' : 'Buat Tugas'}
            </button>
          </div>
        </form>
      )}

      {/* MINE tab */}
      {tab === 'mine' && (
        <div className="space-y-4">
          <TaskListSection
            title="📥 Tugas untuk Saya (Belum Selesai)"
            tasks={myPending}
            emptyText="Tidak ada tugas pending untuk kamu. Santai! 🎉"
            currentUserId={currentUserId}
            pending={pending}
            doneTaskId={doneTaskId}
            setDoneTaskId={setDoneTaskId}
            doneNote={doneNote}
            setDoneNote={setDoneNote}
            onMarkDone={handleMarkDone}
            onReopen={handleReopen}
            onDelete={handleDelete}
            iAmAssignee
          />
        </div>
      )}

      {/* ASSIGNED tab */}
      {tab === 'assigned' && (
        <div className="space-y-4">
          <TaskListSection
            title="📤 Saya Assign (Belum Selesai)"
            tasks={assignedPending}
            emptyText="Belum ada tugas yang kamu assign. Klik '+ Tugas Baru' di atas."
            currentUserId={currentUserId}
            pending={pending}
            doneTaskId={doneTaskId}
            setDoneTaskId={setDoneTaskId}
            doneNote={doneNote}
            setDoneNote={setDoneNote}
            onMarkDone={handleMarkDone}
            onReopen={handleReopen}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* ROUND 147: HISTORY tab — semua tugas selesai */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs font-bold text-green-800">📚 History Tugas Selesai</p>
            <p className="text-[11px] text-green-700 mt-0.5">
              Semua tugas yang udah selesai (yang kamu kerjain + yang kamu assign + selesai). Urut dari terbaru.
            </p>
          </div>
          <TaskListSection
            title={`✓ Total ${allDone.length} tugas selesai`}
            tasks={allDone}
            emptyText="Belum ada tugas yang selesai. Yuk mulai kerjain! 💪"
            currentUserId={currentUserId}
            pending={pending}
            doneTaskId={doneTaskId}
            setDoneTaskId={setDoneTaskId}
            doneNote={doneNote}
            setDoneNote={setDoneNote}
            onMarkDone={handleMarkDone}
            onReopen={handleReopen}
            onDelete={handleDelete}
            showAssignerAndAssignee
          />
        </div>
      )}
    </div>
  );
}

function TaskListSection({ title, tasks, emptyText, iAmAssignee, showAssignerAndAssignee, currentUserId, pending, doneTaskId, setDoneTaskId, doneNote, setDoneNote, onMarkDone, onReopen, onDelete }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-bold text-brand-700 text-sm">{title}</h3>
      </div>
      {tasks.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              currentUserId={currentUserId}
              iAmAssignee={iAmAssignee}
              showAssignerAndAssignee={showAssignerAndAssignee}
              pending={pending}
              isMarkingDone={doneTaskId === t.id}
              setDoneTaskId={setDoneTaskId}
              doneNote={doneNote}
              setDoneNote={setDoneNote}
              onMarkDone={onMarkDone}
              onReopen={onReopen}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task: t, currentUserId, iAmAssignee, showAssignerAndAssignee, pending, isMarkingDone, setDoneTaskId, doneNote, setDoneNote, onMarkDone, onReopen, onDelete }) {
  const days = t.deadline ? daysUntil(t.deadline) : null;
  const overdue = days != null && days < 0 && t.status === 'pending';
  const dueSoon = days != null && days >= 0 && days <= 2 && t.status === 'pending';
  const isDone = t.status === 'done';
  const cfg = PRIORITY_CFG[t.priority] || PRIORITY_CFG.normal;
  const canMarkDone = String(t.assignee_id) === String(currentUserId);
  const canDelete = String(t.assigner_id) === String(currentUserId);

  return (
    <div className={`px-5 py-3 ${isDone ? 'bg-green-50/30' : overdue ? 'bg-red-50/30' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
            {t.deadline && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${overdue ? 'bg-red-100 text-red-700' : dueSoon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                📅 {fmtDate(t.deadline)}
                {days != null && (days < 0 ? ` (lewat ${Math.abs(days)}h)` : ` (${days}h lagi)`)}
              </span>
            )}
            {isDone && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">✓ DONE</span>}
          </div>
          <p className={`text-sm font-bold ${isDone ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.title}</p>
          {t.description && <p className={`text-xs mt-0.5 ${isDone ? 'text-slate-400' : 'text-slate-600'}`}>{t.description}</p>}
          <p className="text-[11px] text-slate-500 mt-1">
            {showAssignerAndAssignee
              ? <>📤 Dari: <b>{t.assigner_name}</b> · 📥 Untuk: <b>{t.assignee_name}</b></>
              : iAmAssignee
                ? `Dari: ${t.assigner_name}`
                : `Untuk: ${t.assignee_name}`}
          </p>
          {isDone && t.completed_at && (
            <p className="text-[11px] text-green-700 mt-1">
              ✓ Selesai {fmtDate(t.completed_at)}{t.completed_note ? ` · "${t.completed_note}"` : ''}
            </p>
          )}

          {/* Mark done form */}
          {isMarkingDone && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded space-y-2">
              <input autoComplete="off"
                value={doneNote}
                onChange={(e) => setDoneNote(e.target.value)}
                placeholder="Catatan saat selesai (opsional)"
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              />
              <div className="flex gap-1">
                <button onClick={() => { setDoneTaskId(null); setDoneNote(''); }} className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded">Batal</button>
                <button onClick={() => onMarkDone(t.id)} disabled={pending} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded disabled:opacity-50">
                  {pending ? '...' : '✓ Tandai Selesai'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {!isDone && canMarkDone && !isMarkingDone && (
            <button onClick={() => setDoneTaskId(t.id)} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded">
              ✓ Selesai
            </button>
          )}
          {isDone && (
            <button onClick={() => onReopen(t.id)} disabled={pending} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded">
              ↻ Buka Lagi
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(t.id)} disabled={pending} className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded">🗑</button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none bg-white';
