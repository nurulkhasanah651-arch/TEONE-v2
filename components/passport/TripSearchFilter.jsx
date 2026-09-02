'use client';
// Search trip di halaman Passport AI: filter kartu trip (children) by data-search.
import { useState, Children } from 'react';

export default function TripSearchFilter({ children }) {
  const [q, setQ] = useState('');
  const kw = q.trim().toLowerCase();
  const arr = Children.toArray(children);
  const shown = kw ? arr.filter((c) => String(c?.props?.['data-search'] || '').toLowerCase().includes(kw)) : arr;
  return (
    <div>
      <div className="px-5 py-3 border-b border-slate-100">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Cari trip (nama / kode trip)..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>
      {shown.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Tidak ada trip yang cocok dengan pencarian.</div>
      ) : (
        <div className="divide-y divide-slate-100">{shown}</div>
      )}
    </div>
  );
}
