'use client';

// Pemilih group/trip untuk Estimate Profit — dikelompokkan per bulan, tampil profit tiap
// trip + total profit per bulan. Path: components/operasional/ProfitGroupPicker.jsx
import { useMemo, useState } from 'react';
import Link from 'next/link';

const rupiah = (n) => 'Rp ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID');

export default function ProfitGroupPicker({ groups = [] }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = s ? groups.filter((g) => `${g.kode} ${g.name}`.toLowerCase().includes(s)) : groups;

  // Kelompokkan per bulan (urutan mengikuti server: keberangkatan terbaru dulu).
  const months = useMemo(() => {
    const order = []; const byKey = {};
    for (const g of list) {
      if (!byKey[g.monthKey]) { byKey[g.monthKey] = { key: g.monthKey, label: g.monthLabel, trips: [] }; order.push(g.monthKey); }
      byKey[g.monthKey].trips.push(g);
    }
    return order.map((k) => {
      const m = byKey[k];
      const totalProfit = m.trips.reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
      const withExpense = m.trips.filter((t) => t.hasExpense).length;
      return { ...m, totalProfit, withExpense };
    });
  }, [list]);

  return (
    <div className="space-y-4">
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cari group (kode / nama trip)…"
        className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />

      {months.map((m) => (
        <div key={m.key} className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-bold text-brand-700">{m.label}</span>
              <span className="text-xs text-slate-400">· {m.trips.length} trip{m.withExpense > 0 ? ` · ${m.withExpense} sudah isi expense` : ''}</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] uppercase tracking-wide text-slate-400 leading-none">Total Margin Bulan Ini</span>
              <span className={`text-sm font-bold ${m.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupiah(m.totalProfit)}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {m.trips.map((g) => (
              <Link key={g.id} href={`/operasional/profit-estimate?trip=${encodeURIComponent(g.id)}`}
                className="flex flex-col p-3 bg-white border border-slate-200 rounded-lg hover:border-brand-400 hover:shadow-sm transition">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-brand-700 text-sm">{g.kode}</span>
                  <span className="text-[11px] text-slate-400">{g.departureFmt}</span>
                </div>
                <p className="text-xs text-slate-700 mt-1 line-clamp-2 min-h-[2rem]">{g.name}</p>
                <div className={`mt-2 rounded-lg px-2.5 py-2 border ${Number(g.profit) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 leading-none">{g.hasExpense ? 'Profit (Margin)' : 'Margin (income − expense)'}</p>
                  <p className={`text-base font-extrabold leading-tight ${Number(g.profit) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupiah(g.profit)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Income {rupiah(g.income)} · Exp {rupiah(g.expense)}</p>
                  {!g.hasExpense && <p className="text-[10px] text-amber-600 mt-0.5">⚠ belum ada expense — klik untuk lengkapi</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
      {months.length === 0 && <p className="text-sm text-slate-400">Tidak ada group cocok.</p>}
    </div>
  );
}
