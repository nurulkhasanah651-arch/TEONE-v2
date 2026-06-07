import './globals.css';
import { headers } from 'next/headers';
import { resolveBrandCode, BRAND_UI } from '@/lib/brand-shared';

export async function generateMetadata() {
  let code = 'teone';
  try {
    const h = headers();
    code = h.get('x-brand') || resolveBrandCode({ host: h.get('host') });
  } catch {}
  const ui = BRAND_UI[code] || BRAND_UI.teone;
  return { title: ui.title, description: ui.description };
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
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
