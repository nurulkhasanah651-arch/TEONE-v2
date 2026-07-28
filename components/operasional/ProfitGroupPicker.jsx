'use client';

// Pemilih group/trip untuk Estimate Profit. Path: components/operasional/ProfitGroupPicker.jsx
import { useState } from 'react';
import Link from 'next/link';

export default function ProfitGroupPicker({ groups = [] }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = s ? groups.filter((g) => `${g.kode} ${g.name}`.toLowerCase().includes(s)) : groups;

  return (
    <div className="space-y-3">
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cari group (kode / nama trip)…"
        className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {list.map((g) => (
          <Link key={g.id} href={`/operasional/profit-estimate?trip=${encodeURIComponent(g.id)}`}
            className="block p-3 bg-white border border-slate-200 rounded-lg hover:border-brand-400 hover:shadow-sm transition">
            <div className="flex items-center justify-between">
              <span className="font-bold text-brand-700 text-sm">{g.kode}</span>
              {g.hasEstimate
                ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ ada estimate</span>
                : <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">belum</span>}
            </div>
            <p className="text-xs text-slate-700 mt-1 line-clamp-2">{g.name}</p>
            <p className="text-[11px] text-slate-400 mt-1">{g.departureFmt}</p>
          </Link>
        ))}
        {list.length === 0 && <p className="text-sm text-slate-400 col-span-full">Tidak ada group cocok.</p>}
      </div>
    </div>
  );
}
