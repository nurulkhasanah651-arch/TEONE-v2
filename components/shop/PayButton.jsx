'use client';
import { useState, useTransition } from 'react';
import { startPayment } from '@/lib/actions/shop-payment';

export default function PayButton({ bookingId, amountLabel }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  function pay() {
    setErr('');
    start(async () => {
      const r = await startPayment(bookingId);
      if (r?.error) { setErr(r.error); return; }
      if (r?.redirect_url) { window.location.href = r.redirect_url; return; }
      setErr('Tidak bisa membuka halaman pembayaran. Coba lagi.');
    });
  }
  return (
    <div>
      <button onClick={pay} disabled={pending}
        className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold">
        {pending ? 'Membuka pembayaran…' : `💳 Bayar Sekarang${amountLabel ? ' · ' + amountLabel : ''}`}
      </button>
      {err && <p className="mt-2 text-sm text-red-600">⚠ {err}</p>}
    </div>
  );
}
