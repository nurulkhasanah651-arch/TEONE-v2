'use client';

import { useState } from 'react';
import { fmtRupiah } from '@/lib/utils/format';

export default function OnlinePayFeed({ items = [] }) {
  const [open, setOpen] = useState(true);
  if (!open || !items.length) return null;
  return (
    <div className="bg-white border border-emerald-200 rounded-xl shadow-card overflow-hidden">
      <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-emerald-800">🔔 Pembayaran Online Terbaru</h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-emerald-600">{items.length} terbaru · otomatis via Midtrans</span>
          <button type="button" onClick={() => setOpen(false)} title="Tutup"
            className="text-emerald-700 hover:text-emerald-900 text-sm font-bold leading-none px-1.5 py-0.5 rounded hover:bg-emerald-100">✕</button>
        </div>
      </div>
      <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
        {items.map((o) => (
          <li key={o.id} className="px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span className="text-slate-700">
              <b>{o.name}</b> sudah bayar <b>{o.type}</b>{o.trip ? ` · ${o.trip}` : ''} <span className="text-slate-400">— via {o.method}</span>
            </span>
            <span className="text-emerald-700 font-bold whitespace-nowrap">{fmtRupiah(o.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
