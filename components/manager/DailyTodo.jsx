'use client';

// To-Do List Harian — manager/ops nulis, direport ke owner. Path: components/manager/DailyTodo.jsx
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTodo, toggleTodo, updateTodo, deleteTodo, carryOverUndone } from '@/lib/actions/daily-todo';
import { TODO_KINDS, todoKind } from '@/lib/utils/daily-todo-kinds';

function fmtTanggal(d) {
  try { return new Date(`${d}T00:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return d; }
}
function shiftDate(d, delta) {
  const x = new Date(`${d}T00:00:00+07:00`); x.setUTCDate(x.getUTCDate() + delta); return x.toISOString().slice(0, 10);
}

export default function DailyTodo({ data, basePath = '/manager-dashboard' }) {
  const router = useRouter();
  const [, start] = useTransition();
  const d = data || {};
  const date = d.date;
  const isToday = d.date === d.today;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteEdit, setNoteEdit] = useState({}); // id -> string draft
  const [durEdit, setDurEdit] = useState({}); // id -> string draft

  const go = (dt) => router.push(`${basePath}?date=${dt}#todo`);

  function add(e) {
    e?.preventDefault();
    const t = text.trim(); if (!t) return;
    setBusy(true); setText('');
    start(async () => { const r = await addTodo(date, t); setBusy(false); if (r?.error) alert('Gagal: ' + r.error); else router.refresh(); });
  }
  function toggle(item) {
    start(async () => { const r = await toggleTodo(item.id, !item.done); if (r?.error) alert('Gagal: ' + r.error); else router.refresh(); });
  }
  function remove(item) {
    start(async () => { const r = await deleteTodo(item.id); if (r?.error) alert('Gagal: ' + r.error); else router.refresh(); });
  }
  function saveNote(item) {
    const note = noteEdit[item.id] ?? item.note;
    start(async () => { const r = await updateTodo(item.id, { note }); if (r?.error) alert('Gagal: ' + r.error); else { setNoteEdit((m) => { const n = { ...m }; delete n[item.id]; return n; }); router.refresh(); } });
  }
  function carry() {
    start(async () => { const r = await carryOverUndone(date); if (r?.error) alert('Gagal: ' + r.error); else { router.refresh(); if ((r?.moved || 0) === 0) alert('Tidak ada item belum selesai dari kemarin.'); } });
  }
  function setKind(item, kind) {
    const next = item.kind === kind ? '' : kind;
    start(async () => { const r = await updateTodo(item.id, { kind: next }); if (r?.error) alert('Gagal: ' + r.error); else router.refresh(); });
  }
  function saveDur(item) {
    const durasi = durEdit[item.id] ?? item.durasi;
    start(async () => { const r = await updateTodo(item.id, { durasi }); if (r?.error) alert('Gagal: ' + r.error); else { setDurEdit((m) => { const n = { ...m }; delete n[item.id]; return n; }); router.refresh(); } });
  }

  const mine = d.mine || [];
  const doneN = mine.filter((i) => i.done).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">📝 To-Do List Harian</h1>
          <p className="text-sm text-slate-500">Catatan kerja harian — otomatis jadi laporan ke atasan (tim/PIC → manager, owner, accounting · manager → owner). Isi sendiri lama pengerjaan &amp; jenis kerja (delegasi / teknis / strategist) tiap item.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(shiftDate(date, -1))} className="px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">←</button>
          <div className="text-center min-w-[190px]">
            <p className="text-sm font-bold text-slate-700">{fmtTanggal(date)}</p>
            {!isToday && <button type="button" onClick={() => go(d.today)} className="text-[11px] text-brand-600 font-semibold hover:underline">↩ ke hari ini</button>}
          </div>
          <button type="button" onClick={() => go(shiftDate(date, 1))} className="px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">→</button>
        </div>
      </div>

      {/* MY LIST */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap bg-brand-50">
          <div>
            <h2 className="font-bold text-brand-700">List Saya · {d.myName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{mine.length ? `${doneN}/${mine.length} selesai` : 'Belum ada item hari ini'}</p>
          </div>
          <button type="button" onClick={carry} className="text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 whitespace-nowrap">↧ Tarik yg belum selesai kemarin</button>
        </div>

        <div className="p-4 space-y-2">
          <form onSubmit={add} className="flex items-center gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis tugas hari ini… (mis. blast optional tour Alhambra)"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" />
            <button type="submit" disabled={busy || !text.trim()} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg whitespace-nowrap">+ Tambah</button>
          </form>

          {mine.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Belum ada tugas. Tambahkan di atas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {mine.map((item) => {
                const editing = noteEdit[item.id] !== undefined;
                const durEditing = durEdit[item.id] !== undefined;
                return (
                  <li key={item.id} className="py-2">
                    <div className="flex items-start gap-2">
                      <button type="button" onClick={() => toggle(item)} className="mt-0.5 shrink-0" title={item.done ? 'Tandai belum' : 'Tandai selesai'}>
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-xs ${item.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent'}`}>✓</span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.content}</p>

                        {/* Jenis kerja + durasi (diisi manager sendiri) */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {TODO_KINDS.map((k) => {
                            const on = item.kind === k.key;
                            return (
                              <button key={k.key} type="button" onClick={() => setKind(item, k.key)}
                                className={`text-[10px] px-2 py-0.5 rounded-full border transition ${on ? k.cls + ' font-bold' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                                title={on ? 'Klik untuk batal' : `Tandai: ${k.label}`}>
                                {on ? '● ' : ''}{k.short}
                              </button>
                            );
                          })}
                          <span className="mx-1 text-slate-200">|</span>
                          {durEditing ? (
                            <span className="inline-flex items-center gap-1">
                              <input autoFocus value={durEdit[item.id]} onChange={(e) => setDurEdit((m) => ({ ...m, [item.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveDur(item); }}
                                placeholder="mis. 2 jam / 30 mnt" className="w-28 px-2 py-0.5 border border-slate-300 rounded text-[11px]" />
                              <button type="button" onClick={() => saveDur(item)} className="text-[11px] font-semibold text-emerald-700">Simpan</button>
                              <button type="button" onClick={() => setDurEdit((m) => { const n = { ...m }; delete n[item.id]; return n; })} className="text-[11px] text-slate-400">Batal</button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setDurEdit((m) => ({ ...m, [item.id]: item.durasi || '' }))}
                              className={`text-[10px] px-2 py-0.5 rounded-full border ${item.durasi ? 'bg-slate-50 border-slate-300 text-slate-600 font-semibold' : 'bg-white border-dashed border-slate-300 text-slate-400'} hover:bg-slate-100`}
                              title="Isi lama pengerjaan">
                              ⏱ {item.durasi ? item.durasi : '+ durasi'}
                            </button>
                          )}
                        </div>

                        {item.note && !editing && <p className="text-[11px] text-amber-600 mt-1">📌 {item.note}</p>}
                        {editing && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <input autoFocus value={noteEdit[item.id]} onChange={(e) => setNoteEdit((m) => ({ ...m, [item.id]: e.target.value }))}
                              placeholder="Keterangan / kendala…" className="flex-1 px-2 py-1 border border-slate-300 rounded text-[11px]" />
                            <button type="button" onClick={() => saveNote(item)} className="text-[11px] font-semibold text-emerald-700">Simpan</button>
                            <button type="button" onClick={() => setNoteEdit((m) => { const n = { ...m }; delete n[item.id]; return n; })} className="text-[11px] text-slate-400">Batal</button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!editing && <button type="button" onClick={() => setNoteEdit((m) => ({ ...m, [item.id]: item.note || '' }))} className="text-[11px] text-slate-400 hover:text-amber-600" title="Tambah keterangan/kendala">📌</button>}
                        <button type="button" onClick={() => remove(item)} className="text-[11px] text-slate-300 hover:text-red-500" title="Hapus">✕</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* LAPORAN SEMUA (owner/manager/accounting) */}
      {d.canSeeAll && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="font-bold text-slate-700">📋 Laporan Tim Hari Ini</h2>
            <p className="text-xs text-slate-500 mt-0.5">Rekap to-do semua staf untuk {fmtTanggal(date)}.</p>
          </div>
          <div className="p-4 space-y-4">
            {(d.others || []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3">Belum ada laporan dari staf lain.</p>
            ) : (d.others).map((a) => {
              const dn = a.items.filter((i) => i.done).length;
              return (
                <div key={a.authorId} className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-700">{a.authorName} {a.roleLabel && <span className="text-[10px] font-semibold text-slate-400">· {a.roleLabel}</span>}</span>
                    <span className="text-[11px] font-bold text-slate-500">{dn}/{a.items.length} selesai</span>
                  </div>
                  <ul className="divide-y divide-slate-100 px-3">
                    {a.items.map((item) => (
                      <li key={item.id} className="py-1.5 flex items-start gap-2">
                        <span className={`mt-0.5 text-xs ${item.done ? 'text-emerald-600' : 'text-slate-300'}`}>{item.done ? '✅' : '⬜'}</span>
                        <div className="min-w-0">
                          <p className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.content}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {item.kind && todoKind(item.kind) && <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${todoKind(item.kind).cls}`}>{todoKind(item.kind).short}</span>}
                            {item.durasi && <span className="text-[10px] text-slate-500">⏱ {item.durasi}</span>}
                          </div>
                          {item.note && <p className="text-[11px] text-amber-600 mt-0.5">📌 {item.note}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
