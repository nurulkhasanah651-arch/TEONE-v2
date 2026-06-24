'use client';
import { useState } from 'react';
import OnlinePayMethods from '@/components/shop/OnlinePayMethods';
import { startInvoicePayment, startInvoiceAllInPayment } from '@/lib/actions/shop-payment';

function fmtRp(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }

export default function InvoicePayOnlineButton({ token, amount = 0, allInAmount = 0 }) {
  const inv = Number(amount) || 0;
  const all = Number(allInAmount) || 0;
  // Tampilkan opsi all-in hanya bila lebih besar dari tagihan invoice ini (ada sisa lain)
  const hasAllIn = all > inv + 1;
  const [mode, setMode] = useState('invoice'); // 'invoice' | 'allin'
  const payAmount = hasAllIn && mode === 'allin' ? all : inv;

  return (
    <div className="no-print mb-3">
      {hasAllIn && (
        <div className="mb-3 space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih yang mau dibayar</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="payMode" checked={mode === 'invoice'} onChange={() => setMode('invoice')} className="w-4 h-4" />
            <span className="text-sm text-slate-700">Bayar tagihan ini saja — <b>{fmtRp(inv)}</b></span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="payMode" checked={mode === 'allin'} onChange={() => setMode('allin')} className="w-4 h-4" />
            <span className="text-sm text-slate-700">Bayar <b>SEMUA sekaligus</b> (pelunasan pokok + visa + asuransi) — <b>{fmtRp(all)}</b></span>
          </label>
        </div>
      )}
      <OnlinePayMethods
        amount={payAmount}
        pay={(method) => (hasAllIn && mode === 'allin' ? startInvoiceAllInPayment(token, method) : startInvoicePayment(token, method))}
        note="Pembayaran aman via Midtrans · status otomatis ter-update. Atau transfer manual di bawah."
      />
    </div>
  );
}
