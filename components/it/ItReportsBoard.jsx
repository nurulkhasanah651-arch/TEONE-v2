'use client';

// Board laporan IT (owner/manager) — filter jenis/status + ubah status + catatan.
// Path: components/it/ItReportsBoard.jsx

import { useMemo, useState, useTransition } from 'react';
import { updateItReport } from '@/lib/actions/it-reports';

const TYPE_META = {
  bug: { label: '🐞 Bug', cls: 'bg-rose-100 text-rose-700' },
  error: { label: '⚠️ Error', cls: 'bg-amber-100 text-amber-700' },
  feature: { label: '💡 Fitur', cls: 'bg-sky-100 text-sky-700' },
};
const STATUS_META = {
  open: { label: 'Baru', cls: 'bg-slate-200 text-slate-700' },
  in_progress: { label: 'Dikerjakan', cls: 'bg-blue-100 text-blue-700' },
  done: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-700' },
  wontfix: { label: 'Ditutup', cls: 'bg-slate-100 text-slate-500' },
};
const STATUS_ORDER = ['open', 'in_progress', 'done', 'wontfix'];

function fmt(dt) {
  if (!dt) return '-';
  try { return new Date(dt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return dt; }
}

export default function ItReportsBoard({ initialReports = [] }) {
  const [reports, setReports] = useState(initialReports);
  const [fType, setFType] = useState('all');
  const [fStatus, setFStatus] = useState('open');
  const [, start] = useTransition();

  function applyLocal(id, patch) {
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function setStatus(r, status) {
    const prev = r.status;
    applyLocal(r.id, { status });
    start(async () => { const res = await updateItReport(r.id, { status }); if (res?.error) { applyLocal(r.id, { status: prev }); alert('Gagal: ' + res.error); } });
  }
  function saveNote(r, admin_note) {
    if ((r.admin_note || '') === (admin_note || '')) return;
    applyLocal(r.id, { admin_note });
    start(async () => { const res = await updateItReport(r.id, { admin_note }); if (res?.error) alert('Gagal simpan catatan: ' + res.error); });
  }

  const counts = useMemo(() => {
    const c = { all: reports.length, open: 0, in_progress: 0, done: 0, wontfix: 0 };
    for (const r of reports) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [reports]);

  const shown = reports.filter((r) =>
    (fType === 'all' || r.type === fType) && (fStatus === 'all' || r.status === fStatus)
  );

  const Chip = ({ active, onClick, children }) => (
    <button type="button" onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 space-y-3">
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-1.5">Status</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={fStatus === 'open'} onClick={() => setFStatus('open')}>Baru ({counts.open || 0})</Chip>
            <Chip active={fStatus === 'in_progress'} onClick={() => setFStatus('in_progress')}>Dikerjakan ({counts.in_progress || 0})</Chip>
            <Chip active={fStatus === 'done'} onClick={() => setFStatus('done')}>Selesai ({counts.done || 0})</Chip>
            <Chip active={fStatus === 'wontfix'} onClick={() => setFStatus('wontfix')}>Ditutup ({counts.wontfix || 0})</Chip>
            <Chip active={fStatus === 'all'} onClick={() => setFStatus('all')}>Semua ({counts.all})</Chip>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-1.5">Jenis</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={fType === 'all'} onClick={() => setFType('all')}>Semua</Chip>
            <Chip active={fType === 'bug'} onClick={() => setFType('bug')}>🐞 Bug</Chip>
            <Chip active={fType === 'error'} onClick={() => setFType('error')}>⚠️ Error</Chip>
            <Chip active={fType === 'feature'} onClick={() => setFType('feature')}>💡 Fitur</Chip>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-sm text-slate-500">Tidak ada laporan di filter ini.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const tm = TYPE_META[r.type] || { label: r.type, cls: 'bg-slate-100 text-slate-600' };
            const sm = STATUS_META[r.status] || { label: r.status, cls: 'bg-slate-100 text-slate-600' };
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${tm.cls}`}>{tm.label}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${sm.cls}`}>{sm.label}</span>
                    {r.brand && <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">{r.brand}</span>}
                  </div>
                  <span className="text-[11px] text-slate-400">{fmt(r.created_at)}</span>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{r.message}</p>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>👤 {r.user_name || r.user_email || 'anonim'}{r.user_role ? ` · ${r.user_role}` : ''}</span>
                    {r.user_email && <span>✉ {r.user_email}</span>}
                    {r.page_path && <span>📄 {r.page_path}</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Ubah status:</span>
                    {STATUS_ORDER.map((s) => (
                      <button key={s} type="button" onClick={() => setStatus(r, s)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded ${r.status === s ? (STATUS_META[s].cls + ' ring-1 ring-slate-300') : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>

                  <details className="pt-1">
                    <summary className="text-[11px] font-semibold text-brand-600 cursor-pointer">Catatan IT{r.admin_note ? ' ✓' : ''}</summary>
                    <textarea
                      defaultValue={r.admin_note || ''}
                      onBlur={(e) => saveNote(r, e.target.value.trim())}
                      rows={2}
                      placeholder="Catatan internal (auto-simpan saat klik di luar)…"
                      className="mt-1.5 w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-300"
                    />
                    {r.handled_by && <p className="text-[10px] text-slate-400 mt-1">Terakhir diproses: {r.handled_by} · {fmt(r.handled_at)}</p>}
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
