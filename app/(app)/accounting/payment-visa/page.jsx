// Payment Visa — Accounting. List peserta butuh visa (nama + status OTOMATIS dari
// master trip & tab Visa), dgn field pembayaran apply visa yang bisa diisi & disimpan.
// Path: app/(app)/accounting/payment-visa/page.jsx

import Link from 'next/link';
import { getVisaApplyList, getVisaPriceList } from '@/lib/actions/visa-payment';
import PaymentVisaTable from '@/components/accounting/PaymentVisaTable';
import VisaPriceList from '@/components/accounting/VisaPriceList';

export const dynamic = 'force-dynamic';

export default async function PaymentVisaPage() {
  const res = await getVisaApplyList();
  const priceRes = await getVisaPriceList();

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-1 text-3xl font-bold text-brand-700">🛂 Payment Visa</h1>
        <p className="mt-1 text-slate-600">Pembayaran apply visa per peserta. Nama & status visa otomatis dari Master Trip & tab Visa — tinggal isi biaya embassy/TLS/asuransi, tanggal, PIC, & refund.</p>
      </div>

      <VisaPriceList rows={priceRes?.rows || []} />

      {res?.error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div>
      ) : (res.rows || []).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-500">
          <p className="text-4xl mb-2">🛂</p>
          <p>Belum ada peserta yang butuh apply visa di trip aktif.</p>
        </div>
      ) : (
        <PaymentVisaTable rows={res.rows} />
      )}
    </div>
  );
}
