// Multi-brand: helper server-side untuk brand aktif
// getBrandCode() — kode brand dari header x-brand (di-set middleware) / hostname
// getCurrentBrand() — row lengkap dari tabel brands (cache 60 detik)
// getBrandId() — shortcut id brand untuk filter query
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveBrandCode } from '@/lib/brand-shared';

const FALLBACK_BRAND = { id: 1, code: 'teone', name: 'Traveling Eropa', is_default: true };

export function getBrandCode() {
  try {
    const h = headers();
    const fromMiddleware = h.get('x-brand');
    if (fromMiddleware) return fromMiddleware;
    return resolveBrandCode({ host: h.get('host') });
  } catch {
    return 'teone';
  }
}

const _cache = {};
const CACHE_MS = 60_000;

export async function getCurrentBrand() {
  const code = getBrandCode();
  const hit = _cache[code];
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.brand;
  try {
    const supabase = createClient();
    const { data } = await supabase.from('brands').select('*').eq('code', code).single();
    const brand = data || FALLBACK_BRAND;
    _cache[code] = { brand, ts: Date.now() };
    return brand;
  } catch {
    return FALLBACK_BRAND;
  }
}

export async function getBrandId() {
  const brand = await getCurrentBrand();
  return brand.id;
}
