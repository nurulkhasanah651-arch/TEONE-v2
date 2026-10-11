'use client';

// Checklist Operasional per Group (per trip) — UI interaktif.
// Path: components/operasional/OpsChecklist.jsx
import { useMemo, useState, useTransition } from 'react';
import { OPS_CHECKLIST_SECTIONS, OPS_CHECKLIST_TOTAL } from '@/lib/utils/ops-checklist-items';
import { toggleOpsChecklistItem } from '@/lib/actions/ops-checklist';

function fmtWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function shortBy(by) {
  if (!by) return '';
  const s = String(by);
  return s.includes('@') ? s.split('@')[0] : s;
}

export default function OpsChecklist({ tripId, initial = {} }) {
  const [checklist, setChecklist] = useState(initial || {});
  const [pendingKey, setPendingKey] = useState(null);
  const [err, setErr] = useState('');
  const [, startTransition] = useTransition();

  const doneCount = useMemo(
    () => OPS_CHECKLIST_SECTIONS.reduce(
      (n, sec) => n + sec.items.filter((it) => checklist[it.key]?.done).length,
      0,
    ),
    [checklist],
  );
  const pct = Math.round((doneCount / OPS_CHECKLIST_TOTAL) * 100);

  function onToggle(itemKey, nextDone) {
    setErr('');
    setPendingKey(itemKey);
    // optimistic
    const prev = checklist;
    setChecklist((c) => ({ ...c, [itemKey]: { ...(c[itemKey] || {}), done: nextDone, at: new Date().toISOString() } }));
    startTransition(async () => {
      const res = await toggleOpsChecklistItem(tripId, itemKey, nextDone);
      if (res?.error) {
        setErr(res.error);
        setChecklist(prev); // rollback
      } else if (res?.checklist) {
        setChecklist(res.checklist);
      }
      setPendingKey(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-slate-700">Progress</span>
          <span className="text-sm font-bold text-brand-700">{doneCount}/{OPS_CHECKLIST_TOTAL} · {pct}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">⚠ {err}</div>
      )}

      {OPS_CHECKLIST_SECTIONS.map((sec) => {
        const secDone = sec.items.filter((it) => checklist[it.key]?.done).length;
        return (
          <div key={sec.key} className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <span className="text-sm font-bold text-slate-700">{sec.icon} {sec.title}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">{secDone}/{sec.items.length}</span>
            </div>
            <ul className="divide-y divide-slate-50">
              {sec.items.map((it) => {
                const state = checklist[it.key] || {};
                const done = !!state.done;
                const busy = pendingKey === it.key;
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggle(it.key, !done)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${busy ? 'opacity-60' : 'hover:bg-slate-50'}`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold ${
                          done ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{it.label}</span>
                        {done && state.at && (
                          <span className="block text-[11px] text-slate-400 mt-0.5">
                            {fmtWhen(state.at)}{state.by ? ` · ${shortBy(state.by)}` : ''}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
