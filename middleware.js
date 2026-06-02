// Path: middleware.js (ROOT project, sejajar package.json)
// Round 190b: Exclude /api/ dari middleware matcher
//             + tetap exclude /delivery/, /invoice/, /tl-assign/, /r/ (R186c)
//
// Tujuan: API routes (termasuk webhook Supabase) tidak boleh lewat auth middleware
//         karena dipanggil dari sistem external (Supabase server), bukan user browser.

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
    // R190b: tambah |api ke negative lookahead — SEMUA /api/ routes skip middleware
    //        (webhook Supabase, public API endpoint, dll)
    // R186c: tambah |delivery|invoice|tl-assign|r ke negative lookahead
    '/((?!api|_next/static|_next/image|favicon.ico|delivery|invoice|tl-assign|r/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
