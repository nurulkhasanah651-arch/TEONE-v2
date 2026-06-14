'use client';
import { startMilestonePayment } from '@/lib/actions/shop-payment';
import OnlinePayMethods from './OnlinePayMethods';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function PayNextButton({ bookingId, milestoneType, label, total, adminFee }) {
  const base = (Number(total) || 0) + (Number(adminFee) || 0);
  return (
    <OnlinePayMethods
      amount={base}
      pay={(method) => startMilestonePayment(bookingId, milestoneType, method)}
      note={`${label || ''} ${fmtRp(total)} + admin ${fmtRp(adminFee)} · via Midtrans`}
    />
  );
}
