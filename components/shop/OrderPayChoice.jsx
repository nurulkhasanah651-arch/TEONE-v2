'use client';

// Pilihan metode bayar di halaman /order/[id]: Online (Midtrans) atau Transfer Bank Manual.

import { useState } from 'react';
import PayButton from './PayButton';
import ManualTransferBox from './ManualTransferBox';

export default function OrderPayChoice({ bookingId, amount = 0, manualAmount = null, bank = {}, manualStatus = null, rejectReason = null }) {
  const manualAmt = manualAmount == null ? amount : manualAmount;
  // Kalau sebelumnya sudah upload & masih nunggu verifikasi → tampilkan status, sembunyikan pilihan.
  const [method, setMethod] = useState(manualStatus === 'pending' ? 'manual' : null);

  if (manualStatus === 'pending') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
        <p className="text-2xl mb-1">⏳</p>
        <p className="font-bold text-amber-800">Bukti transfer sedang diverifikasi</p>
        <p className="text-xs text-amber-700 mt-1">Tim finance akan konfirmasi dalam 1×24 jam via WhatsApp. Terima kasih sudah transfer 🙏</p>
      </div>
    );
  }

  if (!method) {
    return (
      <div className="space-y-3">
        {manualStatus === 'rejected' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            Bukti transfer sebelumnya ditolak{rejectReason ? `: ${rejectReason}` : ''}. Silakan transfer ulang & upload bukti yang benar.
          </div>
        )}
        <p className="text-sm font-semibold text-slate-700 text-center">Pilih metode pembayaran</p>
        <button type="button" onClick={() => setMethod('online')}
          className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 transition flex items-center gap-3">
          <span className="text-2xl">💳</span>
          <span className="flex-1">
            <span className="block font-bold text-slate-800">Bayar Online</span>
            <span className="block text-xs text-slate-500">Kartu, VA bank, e-wallet, QRIS — otomatis & instan</span>
          </span>
          <span className="text-slate-400">›</span>
        </button>
        <button type="button" onClick={() => setMethod('manual')}
          className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition flex items-center gap-3">
          <span className="text-2xl">🏦</span>
          <span className="flex-1">
            <span className="block font-bold text-slate-800">Transfer Bank Manual (Transfer Bank BCA)</span>
            <span className="block text-xs text-slate-500">Transfer ke rekening {bank.bank_name || 'BCA'} lalu upload bukti</span>
          </span>
          <span className="text-slate-400">›</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setMethod(null)}
        className="text-xs text-slate-500 hover:text-slate-700">← Ganti metode pembayaran</button>
      {method === 'online'
        ? <PayButton bookingId={bookingId} amount={amount} />
        : <ManualTransferBox bookingId={bookingId} amount={manualAmt} bank={bank} />}
    </div>
  );
}
