'use client';
import { useState, useTransition } from 'react';
import { startInvoicePayment } from '@/lib/actions/shop-payment';

export default function InvoicePayOnlineButton({ token }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  function pay() {
    setErr('');
    start(async () => {
      const r = await startInvoicePayment(token);
      if (r?.error) { setErr(r.error); return; }
      if (r?.redirect_url) { window.location.href = r.redirect_url; return; }
      setErr('Gagal membuka pembayaran.');
    });
  }
  return (
    <div className="no-print mb-3">
      <button onClick={pay} disabled={pending}
        className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-sm">
        {pending ? 'Membuka pembayaran…' : '💳 Bayar Online Sekarang (kartu / VA / e-wallet / QRIS)'}
      </button>
      <p className="text-[11px] text-center text-slate-400 mt-1">Pembayaran aman via Midtrans · status otomatis ter-update. Atau transfer manual di bawah.</p>
      {err && <p className="text-sm text-red-600 mt-1 text-center">⚠ {err}</p>}
    </div>
  );
}
