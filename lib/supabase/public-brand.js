// Public token pages (delivery, visa upload) di-EXCLUDE dari middleware,
// jadi deteksi brand tidak andal di halaman ini. Helper ini cari token di
// KEDUA database (token unik global) lalu kembalikan client ke DB yang benar.
import { createClient } from '@supabase/supabase-js';

const BRANDS = {
  teone: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  khasanah: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
};

function mkClient(b, useService) {
  const key = useService && b.service ? b.service : b.anon;
  if (!b.url || !key) return null;
  return createClient(b.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Cari peserta berdasarkan kolom token unik di kedua brand.
export async function resolveClientByToken(column, token) {
  for (const code of ['teone', 'khasanah']) {
    const b = BRANDS[code];
    const probe = mkClient(b, true) || mkClient(b, false);
    if (!probe) continue;
    try {
      const { data, error } = await probe
        .from('trip_passengers')
        .select('id')
        .eq(column, token)
        .maybeSingle();
      if (!error && data) return { code, client: probe };
    } catch {
      /* lanjut brand berikutnya */
    }
  }
  return null;
}
