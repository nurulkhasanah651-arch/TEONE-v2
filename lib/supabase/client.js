// Browser-side Supabase client (used in Client Components)
// Multi-brand: kirim header x-brand-id sesuai domain/cookie aktif
import { createBrowserClient } from '@supabase/ssr';
import { resolveBrandCodeBrowser, BRAND_IDS, supabaseEnvFor } from '@/lib/brand-shared';

export function createClient() {
  const code = resolveBrandCodeBrowser();
  const env = supabaseEnvFor(code);
  return createBrowserClient(
    env.url,
    env.anonKey,
    {
      global: {
        headers: { 'x-brand-id': String(BRAND_IDS[code] || 1) },
      },
    }
  );
}
