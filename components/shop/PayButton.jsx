'use client';
import { startPayment } from '@/lib/actions/shop-payment';
import OnlinePayMethods from './OnlinePayMethods';
import { ADMIN_FEE_DP_WEB } from '@/lib/shop/payment-fee';

export default function PayButton({ bookingId, amount = 0 }) {
  // amount = nominal booking (sudah termasuk admin DP web). Tampilkan pokok-nya, biaya dihitung per metode.
  const base = Math.max((Number(amount) || 0) - ADMIN_FEE_DP_WEB, 0);
  return (
    <OnlinePayMethods
      amount={base}
      dpWeb
      pay={(method) => startPayment(bookingId, method)}
      note="Pembayaran aman via Midtrans · status otomatis ter-update."
    />
  );
}
