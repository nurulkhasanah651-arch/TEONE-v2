// Round 160: Public Quotation View — accessible without login
// Path: app/q/[token]/page.jsx
//
// PENTING: file ini di app/q/, BUKAN app/(app)/q/
// Karena harus accessible publik tanpa auth middleware

import { notFound } from 'next/navigation';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import QuotationPreview from '@/components/quotations/QuotationPreview';
import PreviewToolbar from '@/components/quotations/PreviewToolbar';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function generateMetadata({ params }) {
  const { token } = await params;
  const supabase = getServiceClient();
  if (!supabase) return { title: 'Penawaran Trip' };

  const { data: q } = await supabase
    .from('trip_quotations')
    .select('title, tagline, hero_image_url')
    .eq('public_token', token)
    .eq('is_published', true)
    .maybeSingle();

  if (!q) return { title: 'Penawaran Tidak Ditemukan' };

  return {
    title: q.title,
    description: q.tagline || `Penawaran trip ${q.title}`,
    openGraph: {
      title: q.title,
      description: q.tagline || '',
      images: q.hero_image_url ? [{ url: q.hero_image_url }] : [],
    },
  };
}

export default async function PublicQuotationPage({ params }) {
  const { token } = await params;
  const supabase = getServiceClient();
  if (!supabase) notFound();

  const { data: q } = await supabase
    .from('trip_quotations')
    .select('*')
    .eq('public_token', token)
    .eq('is_published', true)
    .maybeSingle();

  if (!q) notFound();

  // Increment view count async (don't await — fire and forget)
  try {
    await supabase
      .from('trip_quotations')
      .update({ view_count: (q.view_count || 0) + 1 })
      .eq('id', q.id);
  } catch {
    // ignore
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <PreviewToolbar editHref={null} publicHref={null} />
      <QuotationPreview quotation={q} isPublic={true} />
    </div>
  );
}
