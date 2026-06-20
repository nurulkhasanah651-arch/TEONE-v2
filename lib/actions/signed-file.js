'use server';

// Signed URL untuk file di bucket privat (service role, brand-aware).
// Dipakai agar file sensitif (bukti bayar dll) tak perlu bucket public.
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ALLOWED = new Set([
  'payment-proofs', 'tl-uploads', 'trip-docs', 'quotation-images',
  'hpp-documents', 'visa-documents', 'visa-results', 'finance-files',
  'payroll-proofs', 'storefront-images',
]);

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function parse(input) {
  if (!input) return null;
  const s = String(input);
  // URL storage Supabase (public/sign/authenticated)
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  // Format "bucket/path"
  const m2 = s.match(/^([a-z0-9-]+)\/(.+)$/i);
  if (m2 && ALLOWED.has(m2[1])) return { bucket: m2[1], path: m2[2] };
  return null;
}

export async function getSignedFileUrl(input, expirySec = 3600) {
  const p = parse(input);
  if (!p) return { error: 'URL tidak valid' };
  if (!ALLOWED.has(p.bucket)) return { error: 'Bucket tidak diizinkan' };
  const supabase = svc();
  if (!supabase) return { error: 'Service role belum di-set' };
  try {
    const { data, error } = await supabase.storage.from(p.bucket).createSignedUrl(p.path, expirySec);
    if (error || !data?.signedUrl) return { error: error?.message || 'gagal sign' };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}
