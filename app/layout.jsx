import './globals.css';
import { headers } from 'next/headers';
import { resolveBrandCode, BRAND_UI } from '@/lib/brand-shared';

function currentBrandCode() {
  try {
    const h = headers();
    return h.get('x-brand') || resolveBrandCode({ host: h.get('host') });
  } catch {
    return 'teone';
  }
}

export async function generateMetadata() {
  const ui = BRAND_UI[currentBrandCode()] || BRAND_UI.teone;
  return { title: ui.title, description: ui.description };
}

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
