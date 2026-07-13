// Redirect domain app -> file publik Supabase (blast-docs). Biar link blast tampil
// pakai domain brand (travelingeropa.com / khasanahtravel.com), bukan URL supabase.
import { NextResponse } from 'next/server';
import { resolveBrandCode, supabaseEnvFor } from '@/lib/brand-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { key } = await params;
  const host = request.headers.get('host') || '';
  const brand = resolveBrandCode({ host });
  const env = supabaseEnvFor(brand) || {};
  if (!env.url || !key) return new NextResponse('Not found', { status: 404 });
  const target = `${env.url}/storage/v1/object/public/blast-docs/${encodeURIComponent(key)}`;
  return NextResponse.redirect(target, 302);
}
