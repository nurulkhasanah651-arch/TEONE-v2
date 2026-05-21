import { updateSession } from '@/lib/supabase/middleware';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const response = await updateSession(request);

  // Pass pathname ke server components via header
  // (Next.js belum punya cara native untuk akses path dari layout)
  if (response instanceof NextResponse) {
    response.headers.set('x-pathname', request.nextUrl.pathname);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
