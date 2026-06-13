'use client';
import { useState, useTransition } from 'react';
import { startMilestonePayment } from '@/lib/actions/shop-payment';

function fmtRp(n){return 'Rp '+Number(n||0).toLocaleString('id-ID');}

export default function PayNextButton({ bookingId, milestoneType, label, total, adminFee }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  function pay() {
    setErr('');
    start(async () => {
      const r = await startMilestonePayment(bookingId, milestoneType);
      if (r?.error) { setErr(r.error); return; }
      if (r?.redirect_url) { window.location.href = r.redirect_url; return; }
      setErr('Gagal membuka pembayaran.');
    });
  }
  return (
    <div>
      <button onClick={pay} disabled={pending} className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold">
        {pending ? 'Membuka pembayaran…' : `💳 Bayar Online · ${fmtRp(total + (adminFee||0))}`}
      </button>
      <p className="text-[11px] text-center text-slate-400 mt-1">{label} {fmtRp(total)} + admin {fmtRp(adminFee)} · via Midtrans (kartu/VA/e-wallet/QRIS)</p>
      {err && <p className="text-sm text-red-600 mt-1">⚠ {err}</p>}
    </div>
  );
}
