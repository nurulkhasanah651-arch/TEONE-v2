// Multi-database: URL & service-role key Supabase sesuai brand aktif.
// Dipakai semua kode yang sebelumnya baca process.env langsung.
import { headers } from 'next/headers';
import { resolveBrandCode, supabaseEnvFor } from '@/lib/brand-shared';

export function currentBrandCode() {
  try {
    const h = headers();
    return h.get('x-brand') || resolveBrandCode({ host: h.get('host') });
  } catch {
    return 'teone';
  }
}

export function brandSupabaseUrl() {
  return supabaseEnvFor(currentBrandCode()).url;
}

export function brandSupabaseAnonKey() {
  return supabaseEnvFor(currentBrandCode()).anonKey;
}

export function brandServiceRoleKey() {
  if (currentBrandCode() === 'khasanah') {
    return process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
