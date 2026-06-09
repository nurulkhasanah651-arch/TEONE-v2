import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomerDetail } from '@/lib/actions/crm';
import CustomerDetailClient from '@/components/crm/CustomerDetailClient';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }) {
  const { id } = await params;
  const res = await getCustomerDetail(id);
  if (res?.error || !res?.customer) notFound();

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/crm" className="text-sm text-brand-600 hover:underline">← Kembali ke CRM</Link>
      <CustomerDetailClient
        customer={res.customer}
        history={res.history}
        referrals={res.referrals}
        referrer={res.referrer}
      />
    </div>
  );
}
