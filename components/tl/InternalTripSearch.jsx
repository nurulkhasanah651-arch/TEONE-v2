'use client';

// List Trip Aktif (Portal TL — view internal) + kotak search (kode / nama / destinasi / TL).
// Client-side, instan. Data sudah disiapkan server (display string + class).
// Path: components/tl/InternalTripSearch.jsx
import { useMemo, useState } from 'react';
import Link from 'next/link';

export default function InternalTripSearch({ rows = [] }) {
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const kw = q.trim().toLowerCase();

  const monthOptions = useMemo(() => {
    const seen = {};
    for (const r of rows) { if (r.monthKey && !seen[r.monthKey]) seen[r.monthKey] = r.monthLabel || r.monthKey; }
    return Object.keys(seen).sort().map((k) => ({ key: k, label: seen[k] }));
  }, [rows]);

  const list = useMemo(
    () => rows.filter((r) => {
      if (month && r.monthKey !== month) return false;
      if (kw && !`${r.kode} ${r.name} ${r.destination} ${r.tlName}`.toLowerCase().includes(kw)) return false;
      return true;
    }),
    [kw, month, rows],
  );

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-brand-700">List Trip Aktif ({list.length}{list.length !== rows.length ? ` / ${rows.length}` : ''})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Klik trip untuk manage petty cash, upload dokumen, approve reimbursement. Trip yang sudah berangkat ada di History Master Trip.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Cari trip (kode / nama / destinasi / TL)…"
            className="w-full sm:w-72 px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500" />
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">Semua bulan</option>
            {monthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {(q || month) && (
            <button type="button" onClick={() => { setQ(''); setMonth(''); }}
              className="text-xs px-2 py-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">Reset</button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">Belum ada trip aktif.</div>
      ) : list.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">Tidak ada trip cocok dengan pencarian.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2.5">Trip</th>
                <th className="px-3 py-2.5">TL</th>
                <th className="px-3 py-2.5">Berangkat</th>
                <th className="px-3 py-2.5 text-right">Petty Cash</th>
                <th className="px-3 py-2.5 text-center">Reimburs</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${r.statusBg} ${r.statusText}`}>{r.kode}</span>
                      <p className="font-bold text-slate-800 text-sm">{r.name}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{r.destination || '—'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-slate-700">{r.tlName || <span className="text-amber-600">— belum assign</span>}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-xs">{r.depText}</p>
                    {r.daysText && <p className={`text-[10px] font-bold ${r.daysCls}`}>{r.daysText}</p>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.pettyText ? (
                      <>
                        <p className="text-xs font-bold text-green-700">{r.pettyText}</p>
                        <p className="text-[10px] text-slate-500">spent {r.pettySpent}</p>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic">belum set</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {r.reimb.pending > 0 && (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold mr-1 animate-pulse">{r.reimb.pending} pending</span>
                    )}
                    {r.reimb.approved > 0 && (
                      <span className="inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold mr-1">{r.reimb.approved} approved</span>
                    )}
                    {r.reimb.paid > 0 && (
                      <span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-800 text-[10px] font-bold">{r.reimb.paid} paid</span>
                    )}
                    {!r.reimb.pending && !r.reimb.approved && !r.reimb.paid && (
                      <span className="text-xs text-slate-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={r.href} className="text-xs font-bold text-brand-600 hover:underline">Kelola →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
