// robots.txt dinamis & brand-aware.
// - Halaman publik (travelingeropa.com / khasanahtravel.com): boleh di-crawl + sitemap.
// - Sistem internal (teone.dev): JANGAN diindeks sama sekali.
import { headers } from 'next/headers';
import { isStorefrontHost, customerSiteUrlFor, resolveBrandCode } from '@/lib/brand-shared';

export const dynamic = 'force-dynamic';

export default function robots() {
  let host = '';
  try { host = headers().get('host') || ''; } catch {}

  if (!isStorefrontHost(host)) {
    // Aplikasi staf internal → blokir semua mesin pencari.
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const code = resolveBrandCode({ host });
  const base = customerSiteUrlFor(code);
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/home', '/trip', '/request-trip', '/request-private-trip'],
        disallow: [
          '/akun', '/order', '/checkout', '/invoice', '/visa', '/api',
          '/masuk', '/reset-password', '/q/', '/r/', '/tl-assign', '/delivery',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
