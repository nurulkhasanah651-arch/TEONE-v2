'use client';
import { startPayment } from '@/lib/actions/shop-payment';
import OnlinePayMethods from './OnlinePayMethods';

export default function PayButton({ bookingId, amount = 0 }) {
  return (
    <OnlinePayMethods
      amount={Number(amount) || 0}
      pay={(method) => startPayment(bookingId, method)}
      note="Pembayaran aman via Midtrans · status otomatis ter-update."
    />
  );
}
