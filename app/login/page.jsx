'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function loginGoogle() {
    setLoading(true);
    setErr('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErr(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 0%, rgba(5,112,222,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 100%, rgba(10,37,64,0.05) 0%, transparent 50%)',
        }}
      />

      <div className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl px-10 py-12">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-2xl font-light shadow-lg">
            ✈
          </div>
          <p className="text-xs font-medium text-slate-500 tracking-widest uppercase">Welcome to</p>
          <h1 className="mt-2 text-3xl font-bold text-brand-700 tracking-tight leading-none">
            Traveling Eropa
          </h1>
          <p className="mt-1 text-base font-semibold text-brand-500 tracking-wider">
            ONE SYSTEM
          </p>
          <div className="mx-auto mt-5 w-12 h-0.5 rounded-full bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
          <p className="mt-5 text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
            Sistem terpadu untuk operasi travel — kelola trip, finance, customer, dan tim dalam satu platform.
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
            Sign in to continue
          </span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Google login button */}
        <button
          onClick={loginGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-white text-brand-700 border-2 border-slate-200 rounded-xl text-sm font-semibold shadow-sm hover:border-brand-500 hover:shadow-md hover:-translate-y-px transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        {err && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold flex items-center gap-2">
            <span aria-hidden="true">⚠</span>
            <span>{err}</span>
          </div>
        )}

        {/* Info box */}
        <div className="mt-7 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 leading-relaxed">
          <p className="font-bold text-brand-700 flex items-center gap-1.5">
            <span className="text-brand-500">ⓘ</span> Login pertama kali
          </p>
          <p className="mt-2 text-slate-600 text-[13px]">
            Setelah masuk, kamu akan diminta pilih role:
          </p>
          <ul className="mt-2 space-y-1 text-[13px]">
            <li className="flex gap-2">
              <span className="text-brand-500 font-bold">›</span>
              <span><strong className="text-brand-700">Tour Leader</strong> — akses langsung tanpa kode</span>
            </li>
            <li className="flex gap-2">
              <span className="text-brand-500 font-bold">›</span>
              <span><strong className="text-brand-700">Tim Internal</strong> — pilih bagian (Ops / Finance / CS) + access code</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-5 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="text-green-500">●</span>
            Secure · Supabase Auth
          </span>
          <span className="font-mono tracking-wide">v2.0 · 2026</span>
        </div>
      </div>
    </main>
  );
}
