// Round 160: Quotation Edit (server component) — fetches data + renders client form
// Path: app/(app)/quotations/[id]/edit/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import QuotationForm from '@/components/quotations/QuotationForm';
import QuotationCalcAndWa from '@/components/quotations/QuotationCalcAndWa';

export const dynamic = 'force-dynamic';

export default async function EditQuotationPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: quotation, error } = await supabase
    .from('trip_quotations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !quotation) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role || user?.user_metadata?.role || user?.app_metadata?.role || null;
  const canSeeProfit = ['owner', 'accounting', 'manager', 'ops'].includes(role);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/quotations" className="text-sm text-brand-600 font-medium hover:underline">← Daftar Penawaran</Link>
          <h1 className="mt-1 text-2xl font-bold text-brand-700">✏️ Edit Penawaran</h1>
          <p className="text-xs text-slate-500">ID: {quotation.id} · Last update: {new Date(quotation.updated_at).toLocaleString('id-ID')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/quotations/${quotation.id}/preview`}
            target="_blank"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded"
          >
            👁 Preview
          </Link>
          {quotation.is_published && quotation.public_token && (
            <Link
              href={`/q/${quotation.public_token}`}
              target="_blank"
              className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 text-sm font-semibold rounded"
            >
              🔗 Public Link
            </Link>
          )}
        </div>
      </div>

      <QuotationForm quotation={quotation} />

      <QuotationCalcAndWa quotation={quotation} canSeeProfit={canSeeProfit} />
    </div>
  );
}
