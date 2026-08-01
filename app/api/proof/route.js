// Redirect ke signed URL file privat (untuk dibuka di tab baru via <a href> native).
// Pilih project Supabase dari ref di URL → aman lintas-brand (TEONE/Khasanah).
import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { verifyProof } from '@/lib/utils/proof-sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set([
  'payment-proofs', 'tl-uploads', 'trip-docs', 'quotation-images',
  'hpp-documents', 'visa-documents', 'visa-results', 'finance-files',
  'payroll-proofs', 'storefront-images', 'passport-uploads',
]);

// ref project → service role key
const KEY_BY_REF = {
  selniwpuwyxhhwsujofj: process.env.SUPABASE_SERVICE_ROLE_KEY,            // TEONE
  aslzjxrrsnitnixauwdz: process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH,   // Khasanah
};

function parse(input) {
  if (!input) return null;
  const s = String(input);
  const ref = (s.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] || null;
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { ref, bucket: m[1], path: decodeURIComponent(m[2]) };
  return null;
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const u = sp.get('u');
  const p = parse(u);
  if (!p || !ALLOWED.has(p.bucket)) {
    return NextResponse.json({ error: 'Bucket/URL tidak valid' }, { status: 400 });
  }

  // AUTHZ: file privat tak boleh diambil anonim. Izinkan kalau:
  //  (a) ada sesi login (staf ATAU customer), ATAU
  //  (b) link ditandatangani HMAC (dipakai halaman publik via token, mis. invoice).
  let allowed = false;
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) allowed = true;
  } catch {}
  if (!allowed) allowed = verifyProof(u, sp.get('e'), sp.get('s'));
  if (!allowed) {
    return NextResponse.json({ error: 'Tidak berwenang' }, { status: 403 });
  }

  const ref = p.ref || 'selniwpuwyxhhwsujofj';
  const key = KEY_BY_REF[ref] || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: 'Service role belum di-set' }, { status: 500 });
  const sb = createServiceClient(`https://${ref}.supabase.co`, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb.storage.from(p.bucket).createSignedUrl(p.path, 120);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || 'File tidak ditemukan' }, { status: 404 });
  }
  // PROXY isi file (bukan redirect) supaya URL di browser tetap /api/proof — di-sign ulang
  // tiap dibuka/refresh, jadi tak pernah muncul "InvalidJWT / exp claim" walau tab lama.
  try {
    const upstream = await fetch(data.signedUrl);
    if (!upstream.ok || !upstream.body) return NextResponse.redirect(data.signedUrl, 302);
    const headers = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    const len = upstream.headers.get('content-length');
    if (len) headers.set('content-length', len);
    headers.set('content-disposition', 'inline');
    headers.set('cache-control', 'private, max-age=60');
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch {
    return NextResponse.redirect(data.signedUrl, 302);
  }
}
