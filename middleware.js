// Path: middleware.js (ROOT project — sejajar dengan package.json, BUKAN di folder lib/)
// Round 186c: Exclude /delivery/ dari middleware matcher
//             biar peserta non-login bisa buka form alamat tanpa redirect ke /login

import { updateSession } from '@/lib/supabase/middleware';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const response = await updateSession(request);
  if (response instanceof NextResponse) {
    response.headers.set('x-pathname', request.nextUrl.pathname);
  }
  return response;
}

export const config = {
  matcher: [
    // R186c: tambah |delivery|invoice|tl-assign|r ke negative lookahead
    //        supaya middleware SKIP semua route public token
    '/((?!_next/static|_next/image|favicon.ico|delivery|invoice|tl-assign|r/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
