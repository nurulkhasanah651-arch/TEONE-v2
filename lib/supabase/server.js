// Server-side Supabase client (used in Server Components, Route Handlers, Server Actions)
// Multi-brand: setiap request membawa header x-brand-id → database otomatis
// menyaring & menandai data sesuai brand aktif (lihat lib/brand-shared.js)
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { resolveBrandCode, BRAND_IDS } from '@/lib/brand-shared';

function currentBrandId() {
  try {
    const h = headers();
    const code = h.get('x-brand') || resolveBrandCode({ host: h.get('host') });
    return BRAND_IDS[code] || 1;
  } catch {
    return 1;
  }
}

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: { 'x-brand-id': String(currentBrandId()) },
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't set cookies — safe to ignore if middleware refreshes session
          }
        },
      },
    }
  );
}

// Multi-brand: klien NETRAL untuk halaman/aksi publik (link token: invoice,
// delivery, tl-assign, visa upload). Tanpa header x-brand-id supaya record
// bisa diakses dari domain mana pun — identitas brand diambil dari record-nya.
export function createPublicClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}
