// Round 160: Quotation Preview (internal — staff only)
// Path: app/(app)/quotations/[id]/preview/page.jsx

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import QuotationPreview from '@/components/quotations/QuotationPreview';
import PreviewToolbar from '@/components/quotations/PreviewToolbar';

export const dynamic = 'force-dynamic';

export default async function QuotationPreviewPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: q } = await supabase
    .from('trip_quotations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!q) notFound();

  return (
    <div>
      <PreviewToolbar
        editHref={`/quotations/${id}/edit`}
        publicHref={q.is_published && q.public_token ? `/q/${q.public_token}` : null}
      />
      <QuotationPreview quotation={q} isPublic={false} />
    </div>
  );
}
