// Proxy aman dokumen hasil visa — URL rapi teone.dev/visa/hasil/{token}
// Token-gated; mem-proxy file dari Supabase (private) tanpa menampilkan domain Supabase.
import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

export const dynamic = 'force-dynamic';
const BUCKET = 'visa-results';

function visaResultPath(stored) {
  if (!stored) return null;
  const str = String(stored);
  const marker = `/${BUCKET}/`;
  const idx = str.indexOf(marker);
  if (idx >= 0) return str.slice(idx + marker.length).split('?')[0];
  return str.replace(/^\/+/, '');
}

export async function GET(_req, { params }) {
  const token = params?.token;
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!token || !url || !key) return new NextResponse('Not found', { status: 404 });

  const supabase = createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('visa_result_photo_url')
    .eq('visa_result_token', token)
    .maybeSingle();

  if (!pax?.visa_result_photo_url) {
    return new NextResponse('Dokumen tidak ditemukan atau link sudah tidak berlaku.', { status: 404 });
  }

  const path = visaResultPath(pax.visa_result_photo_url);
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (!signed?.signedUrl) return new NextResponse('Gagal mengakses dokumen.', { status: 502 });

  try {
    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) return new NextResponse('Gagal mengambil dokumen.', { status: 502 });
    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const buf = await fileRes.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    return new NextResponse('Gagal mengambil dokumen.', { status: 502 });
  }
}
