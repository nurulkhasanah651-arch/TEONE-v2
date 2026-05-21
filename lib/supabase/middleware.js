// Refresh Supabase session on every request (called from /middleware.js)
// Round 37: include role check for auth pages
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

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginPage = path === '/login';
  const isAuthPath = path.startsWith('/auth');
  const isPublicAsset = path.startsWith('/_next') || path.startsWith('/favicon');

  // Not logged in + trying to access protected route → redirect to login
  if (!user && !isLoginPage && !isAuthPath && !isPublicAsset && path !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in + on login page → redirect to role picker / dashboard
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    const role = user.user_metadata?.role;
    if (!role || role === 'pending') {
      url.pathname = '/auth/role-picker';
    } else if (role === 'tour_leader') {
      url.pathname = '/tl';
    } else {
      url.pathname = '/dashboard';
    }
    return NextResponse.redirect(url);
  }

  return response;
}
