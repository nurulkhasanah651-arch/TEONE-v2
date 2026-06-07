// Browser-side Supabase client (used in Client Components)
// Multi-brand: kirim header x-brand-id sesuai domain/cookie aktif
import { createBrowserClient } from '@supabase/ssr';
import { resolveBrandCodeBrowser, BRAND_IDS } from '@/lib/brand-shared';

export function createClient() {
  const code = resolveBrandCodeBrowser();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: { 'x-brand-id': String(BRAND_IDS[code] || 1) },
      },
    }
  );
}
