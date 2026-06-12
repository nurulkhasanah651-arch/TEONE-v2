// Server-side Supabase client (used in Server Components, Route Handlers, Server Actions)
// Multi-brand: setiap request membawa header x-brand-id → database otomatis
// menyaring & menandai data sesuai brand aktif (lihat lib/brand-shared.js)
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { resolveBrandCode, BRAND_IDS, supabaseEnvFor } from '@/lib/brand-shared';

function brandServiceKey(code) {
  if (code === 'khasanah') {
    return process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function currentBrandCode() {
  try {
    const h = headers();
    return h.get('x-brand') || resolveBrandCode({ host: h.get('host') });
  } catch {
    return 'teone';
  }
}

function currentBrandId() {
  return BRAND_IDS[currentBrandCode()] || 1;
}

export function createClient() {
  const cookieStore = cookies();

  const env = supabaseEnvFor(currentBrandCode());
  return createServerClient(
    env.url,
    env.anonKey,
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
  const code = currentBrandCode();
  const env = supabaseEnvFor(code);
  const serviceKey = brandServiceKey(code);

  // Halaman/aksi token publik (invoice, delivery, tl-assign, bukti bayar) dibaca
  // di SERVER dengan service role + dicari ketat berdasarkan token rahasia.
  // Dengan begini data sensitif TIDAK bergantung pada policy anon — anon key di
  // browser tidak bisa lagi membaca trip_passengers/customers dll secara langsung.
  if (serviceKey) {
    return createServiceClient(env.url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // Fallback (kalau service key tak tersedia): pakai anon supaya tidak mati total.
  const cookieStore = cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
}
