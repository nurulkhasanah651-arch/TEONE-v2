'use client';
import { startPayment } from '@/lib/actions/shop-payment';
import OnlinePayMethods from './OnlinePayMethods';

export default function PayButton({ bookingId, amount = 0 }) {
  // amount = pokok booking (admin tak di-bake). Biaya admin dihitung per metode di OnlinePayMethods.
  return (
    <OnlinePayMethods
      amount={Number(amount) || 0}
      dpWeb
      pay={(method) => startPayment(bookingId, method)}
      note="Pembayaran aman via Midtrans · status otomatis ter-update."
    />
  );
}
