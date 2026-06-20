'use client';
import { startMilestonePayment } from '@/lib/actions/shop-payment';
import OnlinePayMethods from './OnlinePayMethods';

export default function PayNextButton({ bookingId, milestoneType, label, total }) {
  return (
    <OnlinePayMethods
      amount={Number(total) || 0}
      pay={(method) => startMilestonePayment(bookingId, milestoneType, method)}
      note={`${label || ''} · biaya admin: non-CC Rp 6.000 / CC 3% · via Midtrans`}
    />
  );
}
