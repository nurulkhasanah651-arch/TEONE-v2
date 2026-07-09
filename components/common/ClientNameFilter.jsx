'use client';

// Pembungkus client untuk daftar yang di-render di server.
// `names[i]` adalah nama peserta untuk child ke-i; anak yang tidak cocok disembunyikan.
import { Children, useState } from 'react';
import PaxSearch, { matchesName } from './PaxSearch';

export default function ClientNameFilter({
  names = [],
  children,
  placeholder = 'Cari nama peserta…',
  wrapperClassName = 'divide-y divide-slate-100',
}) {
  const [q, setQ] = useState('');
  const items = Children.toArray(children);
  const shown = items.filter((_, i) => matchesName(names[i], q));

  return (
    <>
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60">
        <PaxSearch value={q} onChange={setQ} shown={shown.length} total={items.length} placeholder={placeholder} />
      </div>
      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">Tidak ada peserta bernama “{q}”.</p>
      ) : (
        <div className={wrapperClassName}>{shown}</div>
      )}
    </>
  );
}
