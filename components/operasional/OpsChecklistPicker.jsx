'use client';

// Pemilih trip untuk Checklist Operasional per Group. Path: components/operasional/OpsChecklistPicker.jsx
import { useState } from 'react';
import Link from 'next/link';
import { OPS_CHECKLIST_TOTAL } from '@/lib/utils/ops-checklist-items';

function fmt(d) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
}

export default function OpsChecklistPicker({ trips = [] }) {
  const [q, setQ] = useState('');
  const [ops, setOps] = useState('all');
  const s = q.trim().toLowerCase();
  const opsOptions = Array.from(new Set(trips.map((t) => t.opsPic).filter(Boolean))).sort();
  const list = trips.filter((t) => {
    if (s && !`${t.kode} ${t.name}`.toLowerCase().includes(s)) return false;
    if (ops !== 'all' && (t.opsPic || '') !== ops) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari trip (kode / nama)…"
          className="flex-1 min-w-[12rem] max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOps('all')}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${ops === 'all' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
          >
            Semua Ops
          </button>
          {opsOptions.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOps(o)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${ops === o ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {list.map((t) => {
          const done = t.done || 0;
          const pct = Math.round((done / OPS_CHECKLIST_TOTAL) * 100);
          const full = done >= OPS_CHECKLIST_TOTAL;
          return (
            <Link
              key={t.id}
              href={`/operasional/checklist?trip=${encodeURIComponent(t.id)}`}
              className="block bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm hover:bg-slate-50 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand-700 text-sm">{t.kode || `#${t.id}`}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${full ? 'bg-emerald-100 text-emerald-700' : done > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  {full ? '✓ lengkap' : `${done}/${OPS_CHECKLIST_TOTAL}`}
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-1 line-clamp-2 min-h-[2rem]">{t.name}</p>
              {t.opsPic && (
                <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">Ops: {t.opsPic}</span>
              )}
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${full ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{fmt(t.departure)}{t.pax ? ` · ${t.pax} pax` : ''}{t.pic ? ` · PIC ${t.pic}` : ''}</p>
            </Link>
          );
        })}
      </div>
      {list.length === 0 && <p className="text-sm text-slate-400">Tidak ada trip cocok.</p>}
    </div>
  );
}
