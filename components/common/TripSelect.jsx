'use client';

// Dropdown pilih trip yang BISA DIKETIK/DICARI (kode atau nama). Dependency-free.
// Dipakai di form yang punya daftar trip panjang (mis. PNR Inventory).
// Path: components/common/TripSelect.jsx
import { useEffect, useMemo, useRef, useState } from 'react';

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';

export default function TripSelect({
  value,
  onChange,
  trips = [],
  noneLabel = '— Pilih trip —',
  allowNone = true,
  placeholder = 'Cari trip (kode / nama)…',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = trips.find((t) => String(t.id) === String(value));
  const kw = q.trim().toLowerCase();
  const list = useMemo(
    () => (kw ? trips.filter((t) => `${t.kode_trip || t.id} ${t.name || ''}`.toLowerCase().includes(kw)) : trips),
    [kw, trips],
  );
  const label = selected ? `${selected.kode_trip || selected.id} — ${selected.name}` : '';

  function pick(v) {
    onChange(v);
    setOpen(false);
    setQ('');
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={inputCls + ' text-left flex justify-between items-center gap-2'}>
        <span className={label ? 'truncate' : 'text-slate-400'}>{label || noneLabel}</span>
        <span className="text-slate-400 shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
              className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1 text-sm">
            {allowNone && (
              <li>
                <button type="button" onClick={() => pick('')}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-500">{noneLabel}</button>
              </li>
            )}
            {list.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => pick(String(t.id))}
                  className={`w-full text-left px-3 py-1.5 hover:bg-brand-50 ${String(t.id) === String(value) ? 'bg-brand-50 font-semibold' : ''}`}>
                  <span className="font-mono text-xs text-brand-700 mr-1">{t.kode_trip || t.id}</span>
                  <span className="text-slate-700">{t.name}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-2 text-slate-400">Tidak ada trip cocok.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
