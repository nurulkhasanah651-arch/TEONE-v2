'use client';

// Round 142: LoginPage dengan Email/Password + Google OAuth
// Internal staff (Owner/CS/Finance/Manager/Ops) pakai email+password (dibuat owner di Supabase Dashboard)
// TL pakai Google OAuth (Gmail personal)
// Path: app/login/page.jsx (atau wherever login page berada)

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resolveBrandCodeBrowser, BRAND_UI } from '@/lib/brand-shared';

export default function LoginPage() {
  const [brandUi, setBrandUi] = useState(BRAND_UI.teone);
  useEffect(() => { setBrandUi(BRAND_UI[resolveBrandCodeBrowser()] || BRAND_UI.teone); }, []);
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState('staff'); // 'staff' or 'tl'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleEmailLogin(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email dan password wajib diisi');
      return;
    }

    setLoading(true);
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInErr) {
      setError(signInErr.message || 'Login gagal. Cek email/password.');
      setLoading(false);
      return;
    }

    // Login berhasil → redirect
    router.push('/dashboard');
    router.refresh();
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-2xl font-bold shadow-lg">
              {brandUi.icon}
            </div>
            <div className="text-left">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{brandUi.label}</p>
              <p className="text-lg font-bold text-brand-700 leading-tight">{brandUi.sub}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-2">Travel Operations · Internal System</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Tabs */}
          <div className="grid grid-cols-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => { setTab('staff'); setError(''); }}
              className={`py-3 text-sm font-bold transition-colors ${
                tab === 'staff'
                  ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              🧑‍💼 Internal Staff
            </button>
            <button
              type="button"
              onClick={() => { setTab('tl'); setError(''); }}
              className={`py-3 text-sm font-bold transition-colors ${
                tab === 'tl'
                  ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-500'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              👤 Tour Leader
            </button>
          </div>

          <div className="p-6">
            {tab === 'staff' ? (
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-brand-700 mb-1">Login Internal Staff</h2>
                  <p className="text-xs text-slate-500">Owner / Manager / CS / Finance / Ops — pakai email & password</p>
                </div>

                <label className="block">
                  <span className="text-xs font-bold text-slate-700 block mb-1">📧 Email</span>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@teone.internal"
                    autoComplete="username"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    disabled={loading}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold text-slate-700 block mb-1">🔑 Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 pr-20 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
                    >
                      {showPassword ? '🙈 Hide' : '👁 Show'}
                    </button>
                  </div>
                </label>

                {error && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                    ⚠ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                >
                  {loading ? 'Memproses...' : 'Sign In'}
                </button>

                <p className="text-[11px] text-slate-500 text-center">
                  💡 Lupa password? Hubungi owner untuk reset.
                </p>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-purple-700 mb-1">Login Tour Leader</h2>
                  <p className="text-xs text-slate-500">TL pakai akun Google personal (Gmail). Pastikan email kamu sudah di-register oleh Owner.</p>
                </div>

                {error && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                    ⚠ {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-3 border-2 border-slate-300 hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-lg transition-colors flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {loading ? 'Memproses...' : 'Sign in with Google'}
                </button>

                <p className="text-[11px] text-slate-500 text-center pt-2">
                  💡 Belum ke-register? Minta Owner tambahin email Gmail kamu ke sistem.
                </p>
              </div>
            )}
          </div>

          {/* Footer info */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
            <p className="text-[10px] text-slate-500 text-center">
              <span className="font-bold">Tip:</span> Internal staff pakai tab kiri (email+password). Tour Leader pakai tab kanan (Google).
            </p>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-6">
          {brandUi.footer}
        </p>
      </div>
    </div>
  );
}
