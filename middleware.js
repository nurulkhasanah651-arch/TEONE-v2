// Refresh Supabase session on every request (called from /middleware.js)
// Round 186: Tambah /delivery/ ke public token routes (peserta non-login isi alamat)
// + tetap whitelist /invoice/, /tl-assign/, /r/ (round 113)

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

  // Pages yang BUTUH user logged-in (jangan redirect away walaupun di /auth/*)
  const isLoggedInAuthPage = path === '/auth/role-picker';

  // Pages yang public buat semua orang (no auth needed)
  const isAuthPage = path === '/login' || path.startsWith('/auth');
  const isPublicAsset = path.startsWith('/_next') || path.startsWith('/favicon');

  // R186: tambah /delivery/ — peserta trip isi alamat tanpa login
  const isPublicTokenRoute =
    path.startsWith('/invoice/') ||
    path.startsWith('/tl-assign/') ||
    path.startsWith('/delivery/') ||
    path.startsWith('/r/');

  // Not logged in + trying to access protected route → /login
  if (!user && !isAuthPage && !isPublicAsset && !isPublicTokenRoute && path !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in + on /login page → /dashboard
  // (PENTING: hanya /login, BUKAN semua /auth/* — role-picker harus accessible)
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}
