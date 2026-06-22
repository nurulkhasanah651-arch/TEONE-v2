import './globals.css';
import { headers } from 'next/headers';
import { resolveBrandCode, BRAND_UI, isStorefrontHost } from '@/lib/brand-shared';

function currentBrandCode() {
  try {
    const h = headers();
    return h.get('x-brand') || resolveBrandCode({ host: h.get('host') });
  } catch {
    return 'teone';
  }
}

export async function generateMetadata() {
  let host = '';
  try { host = headers().get('host') || ''; } catch {}
  const code = currentBrandCode();
  // Halaman publik (etalase) → branding customer, BUKAN "TEONE One System".
  if (isStorefrontHost(host)) {
    if (code === 'khasanah') {
      const t = 'Khasanah Travel — Umroh & Haji';
      const d = 'Paket umroh & haji terkurasi bersama Khasanah Travel.';
      return { title: t, description: d, metadataBase: new URL('https://www.khasanahtravel.com'),
        openGraph: { title: t, description: d, siteName: 'Khasanah Travel', type: 'website' },
        twitter: { card: 'summary_large_image', title: t, description: d } };
    }
    const t = 'Traveling Eropa — Open Trip & Private Trip Eropa';
    const d = 'Jelajahi Eropa bersama Traveling Eropa. Open trip, private trip, dan paket wisata Eropa terkurasi.';
    return { title: t, description: d, metadataBase: new URL('https://www.travelingeropa.com'),
      openGraph: { title: t, description: d, siteName: 'Traveling Eropa', type: 'website' },
      twitter: { card: 'summary_large_image', title: t, description: d } };
  }
  // Halaman internal (teone.dev) → branding sistem.
  const ui = BRAND_UI[code] || BRAND_UI.teone;
  return { title: ui.title, description: ui.description };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" data-brand={currentBrandCode()}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
