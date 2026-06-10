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

    // CHECK ROLE — login via Google = Tour Leader: auto-assign & langsung ke /tl
    let role = user.app_metadata?.role || user.user_metadata?.role || user.app_metadata?.role || null;
    if (!role || role === 'pending') {
      // Cek dulu kalau owner sudah set role di tabel users
      try {
        const { data: profile } = await supabase
          .from('users').select('role').eq('id', user.id).maybeSingle();
        const map = { tl: 'tour_leader', finance: 'ops', team: 'ops' };
        role = map[profile?.role] || profile?.role || null;
      } catch {}
      // Cocokkan email ke master mitra → role mitra
      if ((!role || role === 'pending') && user.email) {
        try {
          const { data: m } = await supabase.from('mitra').select('id').ilike('email', user.email).maybeSingle();
          if (m) {
            role = 'mitra';
            await supabase.from('mitra').update({ user_id: user.id }).eq('id', m.id);
            await supabase.from('users').upsert({ id: user.id, email: user.email, role: 'mitra' }, { onConflict: 'id' });
          }
        } catch {}
      }
      // Cocokkan email ke master tour_leaders → tour_leader
      if ((!role || role === 'pending') && user.email) {
        try {
          const { data: tl } = await supabase.from('tour_leaders').select('id').ilike('email', user.email).maybeSingle();
          if (tl) role = 'tour_leader';
        } catch {}
      }
      // Belum ketemu → biarkan pilih di role-picker (TL/Mitra), jangan auto-assign
      if (!role || role === 'pending') {
        return NextResponse.redirect(`${origin}/auth/role-picker`);
      }
      try {
        await supabase.auth.updateUser({
          data: { ...user.user_metadata, role },
        });
      } catch (e) {
        console.error('[auth/callback] failed to set role:', e?.message);
      }
      // Auto-link ke master tour_leaders berdasarkan email (kalau ada)
      if (role === 'tour_leader' && user.email) {
        try {
          await supabase
            .from('tour_leaders')
            .update({ user_id: user.id })
            .ilike('email', user.email)
            .is('user_id', null);
        } catch {}
      }
    }

    // Redirect sesuai role — TL langsung ke portal TL
    const dest = role === 'tour_leader' ? '/tl' : role === 'mitra' ? '/mitra' : next;
    return NextResponse.redirect(`${origin}${dest}`);
  } catch (e) {
    console.error('[auth/callback] unexpected error:', e?.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(e?.message || 'callback_failed')}`
    );
  }
}
