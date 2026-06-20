'use client';
import OnlinePayMethods from '@/components/shop/OnlinePayMethods';
import { startInvoicePayment } from '@/lib/actions/shop-payment';
import { ADMIN_FEE_ONLINE } from '@/lib/shop/payment-fee';

export default function InvoicePayOnlineButton({ token, amount = 0 }) {
  return (
    <div className="no-print mb-3">
      <OnlinePayMethods
        amount={Number(amount) || 0}
        feeFlat={ADMIN_FEE_ONLINE}
        pay={(method) => startInvoicePayment(token, method)}
        note="Pembayaran aman via Midtrans · status otomatis ter-update. Atau transfer manual di bawah."
      />
    </div>
  );
}
