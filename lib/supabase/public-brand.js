// Public token pages (delivery, visa upload) di-EXCLUDE dari middleware,
// jadi deteksi brand tidak andal. Helper ini cari token di KEDUA database
// (token unik global) lalu kembalikan client ke DB yang benar.
//
// PENTING: pakai ANON key (per-brand sudah benar terpasang & diizinkan policy
// publik trip_passengers_all_access). Tidak pakai service key karena service
// key per-brand bisa belum di-set → JWT mismatch → gagal.
import { createClient } from '@supabase/supabase-js';

// Pakai SERVICE ROLE key (server-only) supaya bisa resolve token walau policy
// publik trip_passengers sudah dicabut (security). Akses tetap digerbang token
// unik. Fallback ke anon kalau service key belum di-set.
const BRANDS = {
  teone: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  khasanah: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

function mkClient(b) {
  if (!b.url || !b.key) return null;
  return createClient(b.url, b.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Cari peserta berdasarkan kolom token unik di kedua brand.
export async function resolveClientByToken(column, token) {
  for (const code of ['teone', 'khasanah']) {
    const client = mkClient(BRANDS[code]);
    if (!client) continue;
    try {
      const { data, error } = await client
        .from('trip_passengers')
        .select('id')
        .eq(column, token)
        .maybeSingle();
      if (!error && data) return { code, client };
    } catch {
      /* lanjut brand berikutnya */
    }
  }
  return null;
}
