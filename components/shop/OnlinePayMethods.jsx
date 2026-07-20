'use client';
import { useState, useTransition } from 'react';
import { PAY_METHODS, paymentFee } from '@/lib/shop/payment-fee';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

// pay: async (method) => { redirect_url } | { error }
export default function OnlinePayMethods({ amount = 0, pay, note, buttonLabel = '💳 Bayar Online', dpWeb = false }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  function go(method) {
    setErr(''); setBusy(method);
    start(async () => {
      const r = await pay(method);
      if (r?.error) { setErr(r.error); setBusy(null); return; }
      if (r?.redirect_url) { window.location.href = r.redirect_url; return; }
      setErr('Gagal membuka pembayaran.'); setBusy(null);
    });
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
        >
          {buttonLabel}{amount > 0 ? ` · ${fmtRp(amount)}` : ''}
        </button>
        {note && <p className="text-[11px] text-center text-slate-400 mt-1">{note}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">Pilih metode pembayaran:</p>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-slate-400 hover:text-slate-600">✕ tutup</button>
      </div>
      {PAY_METHODS.map((m) => {
        const fee = paymentFee(m.key, amount, { dpWeb });
        const total = (Number(amount) || 0) + fee;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => go(m.key)}
            disabled={pending}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-slate-200 hover:border-emerald-400 disabled:opacity-50 text-left transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800">{m.short}{m.key === 'cc' ? ' (+3%)' : m.key === 'qris' ? ' (+0,7%)' : ''}</span>
              {m.desc && <span className="block text-[11px] text-slate-500">{m.desc}</span>}
            </span>
            <span className="text-right shrink-0">
              {amount > 0 && <span className="block text-sm font-bold text-emerald-700">{fmtRp(total)}</span>}
              {fee > 0 && <span className="block text-[10px] text-slate-400">termasuk biaya admin {fmtRp(fee)}</span>}
              {busy === m.key && pending && <span className="block text-[10px] text-emerald-600">membuka…</span>}
            </span>
          </button>
        );
      })}
      {note && <p className="text-[11px] text-slate-400">{note}</p>}
      {err && <p className="text-sm text-red-600">⚠ {err}</p>}
    </div>
  );
}
