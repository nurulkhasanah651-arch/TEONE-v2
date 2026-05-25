// Round 112: OAuth callback — DEFENSIVE handling for new users
// Fix: new user (no role) tidak crash, auto-assign default 'pending' kalau belum ada
// Plus: log error detail biar bisa diagnose

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const error_description = searchParams.get('error_description');

  // Kalau Google return error
  if (error_description) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchange error:', error.message);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }

    // Get user yang baru login
    const user = data?.user || data?.session?.user;
    if (!user) {
      return NextResponse.redirect(`${origin}/login?error=no_user_after_exchange`);
    }

    // CHECK ROLE — kalau belum ada, set ke 'pending' agar app tahu user baru
    const currentRole = user.user_metadata?.role || user.app_metadata?.role;
    if (!currentRole) {
      try {
        await supabase.auth.updateUser({
          data: { ...user.user_metadata, role: 'pending' },
        });
      } catch (e) {
        console.error('[auth/callback] failed to set pending role:', e?.message);
        // Lanjut aja, jangan block user
      }
    }

    // Redirect ke dashboard (atau next kalau ada)
    return NextResponse.redirect(`${origin}${next}`);
  } catch (e) {
    console.error('[auth/callback] unexpected error:', e?.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(e?.message || 'callback_failed')}`
    );
  }
}
