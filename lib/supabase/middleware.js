// Refresh Supabase session on every request (called from /middleware.js)
// Round 113: Fix loop — jangan redirect dari /auth/role-picker (butuh user logged-in)
// + whitelist public token routes (/invoice/, /tl-assign/)

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { BRAND_IDS, resolveBrandCode, supabaseEnvFor } from '@/lib/brand-shared';

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const brandCode = request.headers.get('x-brand') || resolveBrandCode({ host: request.headers.get('host') });
  const brandEnv = supabaseEnvFor(brandCode);
  const supabase = createServerClient(
    brandEnv.url,
    brandEnv.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touch user — keeps session fresh
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Multi-brand: user hanya boleh masuk brand-nya sendiri
  // (users.brand_id NULL = super admin, bebas akses semua brand)
  let brandMismatch = false;
  if (user) {
    const reqBrandId = BRAND_IDS[request.headers.get('x-brand')] || 1;
    const { data: profile } = await supabase
      .from('users').select('brand_id').eq('id', user.id).maybeSingle();
    if (profile && profile.brand_id != null && profile.brand_id !== reqBrandId) {
      brandMismatch = true;
    }
  }

  // Pages yang BUTUH user logged-in (jangan redirect away walaupun di /auth/*)
  const isLoggedInAuthPage = path === '/auth/role-picker';

  // Pages yang public buat semua orang (no auth needed)
  const isAuthPage = path === '/login' || path.startsWith('/auth');
  const isPublicAsset = path.startsWith('/_next') || path.startsWith('/favicon');
  const isPublicTokenRoute =
    path.startsWith('/invoice/') ||
    path.startsWith('/tl-assign/') ||
    path.startsWith('/r/');

  // Brand mismatch → tendang ke /login dengan pesan
  if (brandMismatch && path !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?error=brand';
    return NextResponse.redirect(url);
  }

  // Not logged in + trying to access protected route → /login
  if (!user && !isAuthPage && !isPublicAsset && !isPublicTokenRoute && path !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in + on /login page → /dashboard
  // (PENTING: hanya /login, BUKAN semua /auth/* — role-picker harus accessible)
  if (user && path === '/login' && !brandMismatch) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}
