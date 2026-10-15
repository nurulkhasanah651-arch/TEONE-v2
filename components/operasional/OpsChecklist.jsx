'use client';

// Checklist Operasional per Group (per trip) — UI interaktif.
// Tiap item: centang ✓ + kotak keterangan bebas. Item Pre-book (vendorFlow) punya
// field terstruktur: Offering (vendor mana aja) / Go-ahead (ke mana) / Prebook (ke mana).
// Path: components/operasional/OpsChecklist.jsx
import { useMemo, useState, useTransition } from 'react';
import { OPS_CHECKLIST_SECTIONS, OPS_CHECKLIST_TOTAL } from '@/lib/utils/ops-checklist-items';
import { toggleOpsChecklistItem, updateOpsChecklistItem } from '@/lib/actions/ops-checklist';

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

// Field teks (module-level biar tak remount tiap parent render → fokus & ketikan aman).
// Simpan saat blur, hanya kalau nilainya berubah dari yg tersimpan.
function ChecklistTextField({ initialValue, stored, label, placeholder, saving, onCommit }) {
  const [val, setVal] = useState(initialValue || '');
  return (
    <label className="block">
      {label && (
        <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
          {label}{saving && <span className="ml-1 text-brand-500">· menyimpan…</span>}
        </span>
      )}
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const next = (val || '').trim();
          if (next !== (stored || '').trim()) onCommit(next);
        }}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:border-brand-400 focus:ring-1 focus:ring-brand-200 outline-none"
      />
    </label>
  );
}

export default function OpsChecklist({ tripId, initial = {} }) {
  const [checklist, setChecklist] = useState(initial || {});
  const [pendingKey, setPendingKey] = useState(null);
  const [savingField, setSavingField] = useState(null); // `${key}.${field}`
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
    const prev = checklist;
    setChecklist((c) => ({ ...c, [itemKey]: { ...(c[itemKey] || {}), done: nextDone, at: new Date().toISOString() } }));
    startTransition(async () => {
      const res = await toggleOpsChecklistItem(tripId, itemKey, nextDone);
      if (res?.error) { setErr(res.error); setChecklist(prev); }
      else if (res?.checklist) setChecklist(res.checklist);
      setPendingKey(null);
    });
  }

  function onCommitField(itemKey, field, next) {
    setErr('');
    const fid = `${itemKey}.${field}`;
    setSavingField(fid);
    const prev = checklist;
    setChecklist((c) => ({ ...c, [itemKey]: { ...(c[itemKey] || {}), [field]: next } }));
    startTransition(async () => {
      const res = await updateOpsChecklistItem(tripId, itemKey, { [field]: next });
      if (res?.error) { setErr(res.error); setChecklist(prev); }
      else if (res?.checklist) setChecklist(res.checklist);
      setSavingField((f) => (f === fid ? null : f));
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
                  <li key={it.key} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onToggle(it.key, !done)}
                        aria-label={done ? 'Batal centang' : 'Centang'}
                        className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold transition-colors ${
                          done ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'
                        } ${busy ? 'opacity-60' : ''}`}
                      >
                        ✓
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{it.label}</span>
                        {state.at && (
                          <span className="block text-[11px] text-slate-400 mt-0.5">
                            {fmtWhen(state.at)}{state.by ? ` · ${shortBy(state.by)}` : ''}
                          </span>
                        )}

                        {it.vendorFlow ? (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <ChecklistTextField
                              key={`${it.key}.offering`}
                              initialValue={state.offering} stored={state.offering}
                              label="Offering ke vendor" placeholder="mis. hiseas, odil, holiday world"
                              saving={savingField === `${it.key}.offering`}
                              onCommit={(v) => onCommitField(it.key, 'offering', v)}
                            />
                            <ChecklistTextField
                              key={`${it.key}.goahead`}
                              initialValue={state.goahead} stored={state.goahead}
                              label="Go-ahead ke" placeholder="mis. hiseas"
                              saving={savingField === `${it.key}.goahead`}
                              onCommit={(v) => onCommitField(it.key, 'goahead', v)}
                            />
                            <ChecklistTextField
                              key={`${it.key}.prebook`}
                              initialValue={state.prebook} stored={state.prebook}
                              label="Prebook ke" placeholder="mis. hiseas — done"
                              saving={savingField === `${it.key}.prebook`}
                              onCommit={(v) => onCommitField(it.key, 'prebook', v)}
                            />
                            <div className="sm:col-span-3">
                              <ChecklistTextField
                                key={`${it.key}.note`}
                                initialValue={state.note} stored={state.note}
                                label="Keterangan" placeholder="catatan tambahan…"
                                saving={savingField === `${it.key}.note`}
                                onCommit={(v) => onCommitField(it.key, 'note', v)}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <ChecklistTextField
                              key={`${it.key}.note`}
                              initialValue={state.note} stored={state.note}
                              label="" placeholder="Keterangan / vendor / status…"
                              saving={savingField === `${it.key}.note`}
                              onCommit={(v) => onCommitField(it.key, 'note', v)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
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
