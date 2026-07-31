'use client';

// Checklist issued tiket per peserta untuk trip yang PNR-nya sudah ke-connect.
// Yang belum dicentang akan muncul di Manager Dashboard (Morning Monitoring).
// Path: components/finance/TicketIssueChecklist.jsx
import { useState, useTransition } from 'react';
import { setTicketIssued } from '@/lib/actions/ticket-checklist';

export default function TicketIssueChecklist({ groups = [] }) {
  const [issued, setIssued] = useState({});
  const [, start] = useTransition();
  const [open, setOpen] = useState({});
  const isDone = (p) => (issued[p.id] !== undefined ? issued[p.id] : p.ticket_issued === true);

  function toggle(p) {
    const next = !isDone(p);
    setIssued((m) => ({ ...m, [p.id]: next }));
    start(async () => { const r = await setTicketIssued(p.id, next); if (r?.error) { setIssued((m) => ({ ...m, [p.id]: !next })); alert('Gagal: ' + r.error); } });
  }

  if (!groups.length) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap bg-sky-50">
        <div>
          <h2 className="font-bold text-sky-700">🎫 Checklist Issued Peserta</h2>
          <p className="text-xs text-slate-500 mt-0.5">Centang peserta yang tiketnya sudah di-issue. Yang belum dicentang muncul di Morning Monitoring (manager).</p>
        </div>
        <span className="text-sm font-bold text-slate-500">{groups.length} trip</span>
      </div>
      <div className="divide-y divide-slate-100">
        {groups.map((t) => {
          const doneCount = t.peserta.filter((p) => isDone(p)).length;
          const total = t.peserta.length;
          const allDone = total > 0 && doneCount === total;
          const isOpen = open[t.id] !== undefined ? open[t.id] : !allDone; // default buka kalau masih ada yg belum
          return (
            <div key={t.id} className="px-5 py-3">
              <button type="button" onClick={() => setOpen((m) => ({ ...m, [t.id]: !isOpen }))} className="w-full flex items-center justify-between gap-2 text-left">
                <span className="min-w-0">
                  <span className="text-sm font-bold text-brand-700">{t.kode}</span>
                  <span className="text-sm text-slate-600"> · {t.name}</span>
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {doneCount}/{total} issued {isOpen ? '▲' : '▼'}
                </span>
              </button>
              {isOpen && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.peserta.map((p) => {
                    const done = isDone(p);
                    return (
                      <button key={p.id} type="button" onClick={() => toggle(p)}
                        className={`text-[11px] px-2 py-1 rounded border transition ${done ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50'}`}
                        title={done ? 'Sudah issued — klik untuk batal' : 'Klik jika sudah di-issue'}>
                        {done ? '✅ ' : '⬜ '}{p.nama}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
