// Refresh Supabase session — Round 69: izinkan /tl-assign public access (no auth)

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginPage = path === '/login';
  const isAuthPath = path.startsWith('/auth');
  const isPublicAsset = path.startsWith('/_next') || path.startsWith('/favicon');
  // Round 69: /tl-assign/[token] public access untuk TL approve/reject via WA
  const isPublicTLAssign = path.startsWith('/tl-assign');

  // Not logged in + accessing protected → redirect to login
  // EXCEPT /tl-assign (TL access via WA token, no auth)
  if (!user && !isLoginPage && !isAuthPath && !isPublicAsset && !isPublicTLAssign && path !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in + on login page → redirect to role default
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
