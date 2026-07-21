'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

function fmtDate(d) { if (!d) return '-'; try { return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }

export default function TourConfirmationList({ trips = [] }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return trips;
    return trips.filter((t) => `${t.kode} ${t.name} ${t.pic}`.toLowerCase().includes(s));
  }, [q, trips]);

  return (
    <div className="space-y-3">
      <input
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Cari trip (kode / nama / PIC)..."
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      <div className="bg-white rounded-xl border border-slate-200 shadow-card divide-y divide-slate-100">
        {list.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Tidak ada trip.</div>
        ) : list.map((t) => (
          <Link
            key={t.id}
            href={`/operasional/tour-confirmation/${t.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {t.kode && <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{t.kode}</span>}
                <span className="font-bold text-brand-700 truncate">{t.name}</span>
                {t.hasTc
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">✅ TC dibuat</span>
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">belum dibuat</span>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                📅 {fmtDate(t.departure)} – {fmtDate(t.return_date)}{t.pic ? ` · PIC: ${t.pic}` : ''} · {t.pax} pax
              </div>
            </div>
            <span className="text-brand-600 text-sm font-bold shrink-0">Buka →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
