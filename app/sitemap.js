// sitemap.xml dinamis: home + daftar + semua trip yang dipublish (brand-aware).
import { headers } from 'next/headers';
import { isStorefrontHost, customerSiteUrlFor, resolveBrandCode } from '@/lib/brand-shared';
import { getPublishedTrips } from '@/lib/shop/data';

export const dynamic = 'force-dynamic';

export default async function sitemap() {
  let host = '';
  try { host = headers().get('host') || ''; } catch {}
  if (!isStorefrontHost(host)) return [];

  const code = resolveBrandCode({ host });
  const base = customerSiteUrlFor(code);
  const now = new Date();

  const staticUrls = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/trip`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/request-trip`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  let trips = [];
  try { trips = await getPublishedTrips(); } catch {}
  const tripUrls = (trips || []).map((t) => ({
    url: `${base}/trip/${t.slug || t.id}`,
    lastModified: t.departure ? new Date(t.departure + 'T00:00:00') : now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticUrls, ...tripUrls];
}
