'use client';

// Panel: hitung total closingan untuk rentang tanggal bebas.
import { useState } from 'react';
import { getClosingByRange } from '@/lib/actions/cs-closing-range';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function ClosingRangePanel({ defaultFrom, defaultTo }) {
  const [from, setFrom] = useState(defaultFrom || '');
  const [to, setTo] = useState(defaultTo || '');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function calc() {
    setErr(''); setBusy(true); setRes(null);
    try {
      const r = await getClosingByRange(from, to);
      if (r?.ok) setRes(r); else setErr(r?.error || 'Gagal menghitung.');
    } catch { setErr('Gagal menghitung.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h2 className="font-bold text-brand-700">🎯 Total Closingan per Rentang Tanggal</h2>
        <p className="text-xs text-slate-500 mt-0.5">Pilih tanggal bebas (mis. 1–10) untuk lihat jumlah & nilai closingan.</p>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Dari</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Sampai</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </div>
          <button onClick={calc} disabled={busy} className="text-sm font-bold px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white">{busy ? 'Menghitung...' : 'Hitung'}</button>
        </div>

        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

        {res && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 text-center">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Jumlah Closingan</p>
              <p className="mt-1 text-3xl font-extrabold text-brand-700">{res.count}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{res.from} s/d {res.to}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-green-50 text-center">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Total Nilai</p>
              <p className="mt-1 text-xl font-extrabold text-green-700 break-words">{fmtRp(res.value)}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
