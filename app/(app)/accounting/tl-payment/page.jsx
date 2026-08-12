import Link from 'next/link';
import { getTlPlotting } from '@/lib/actions/tl-plotting';
import TlPaymentBoard from '@/components/accounting/TlPayment';

export const dynamic = 'force-dynamic';

export default async function TlPaymentPage() {
  const r = await getTlPlotting();
  if (r?.error) {
    return (
      <div className="max-w-3xl mx-auto py-10 text-center space-y-3">
        <p className="text-sm text-rose-600">⚠ {r.error}</p>
        <Link href="/accounting" className="text-sm text-brand-600 hover:underline">← Kembali ke Accounting</Link>
      </div>
    );
  }
  return <TlPaymentBoard trips={r.trips || []} tlOptions={r.tlOptions || []} />;
}
