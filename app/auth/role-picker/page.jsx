'use client';

// Round 112 HOTFIX: Role picker page — SINGLE FILE (gak perlu RolePickerClient.jsx)
// Path: app/auth/role-picker/page.jsx

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RolePickerPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Cek user saat mount
  useEffect(() => {
    async function checkUser() {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) {
        router.replace('/login');
        return;
      }
      const currentRole = u.user_metadata?.role || u.app_metadata?.role;
      if (currentRole && currentRole !== 'pending') {
        router.replace('/dashboard');
        return;
      }
      setUser(u);
      setLoading(false);
    }
    checkUser();
  }, [router]);

  async function setRole(role, redirectTo = '/dashboard') {
    setError('');
    startTransition(async () => {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) {
        setError('Not authenticated');
        return;
      }
      const { error: updErr } = await supabase.auth.updateUser({
        data: { ...u.user_metadata, role },
      });
      if (updErr) {
        setError(updErr.message);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    });
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl px-8 py-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xl">
            ✈
          </div>
          <h1 className="text-xl font-bold text-brand-700">Welcome to TEONE</h1>
          <p className="text-xs text-slate-500 mt-1">{user?.email}</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-bold text-slate-700">Pilih role kamu:</p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              ⚠ {error}
            </div>
          )}

          <button
            onClick={() => setRole('manager', '/dashboard')}
            disabled={pending}
            className="w-full p-4 border-2 border-yellow-300 bg-yellow-50 hover:bg-yellow-100 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">👑</span>
              <div>
                <p className="font-bold text-yellow-900">Manager / Owner</p>
                <p className="text-xs text-yellow-700">Akses semua tab + data</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole('ops', '/dashboard')}
            disabled={pending}
            className="w-full p-4 border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">💼</span>
              <div>
                <p className="font-bold text-blue-900">Ops / Finance</p>
                <p className="text-xs text-blue-700">Akses Trips, Finance, CS, Visa, TL</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole('cs', '/dashboard')}
            disabled={pending}
            className="w-full p-4 border-2 border-green-300 bg-green-50 hover:bg-green-100 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">☎</span>
              <div>
                <p className="font-bold text-green-900">CS / Customer Service</p>
                <p className="text-xs text-green-700">Akses CS Daily, Trips, Visa, Payment</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole('tour_leader', '/tl')}
            disabled={pending}
            className="w-full p-4 border-2 border-pink-300 bg-pink-50 hover:bg-pink-100 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">👤</span>
              <div>
                <p className="font-bold text-pink-900">Tour Leader</p>
                <p className="text-xs text-pink-700">Portal TL khusus</p>
              </div>
            </div>
          </button>

          <div className="pt-3 text-center border-t border-slate-200">
            <p className="text-[10px] text-slate-400 mb-1">Bukan akun saya?</p>
            <button
              onClick={handleSignOut}
              disabled={pending}
              className="text-xs text-slate-500 hover:text-red-600 underline"
            >
              Logout
            </button>
          </div>

          {pending && (
            <div className="text-center text-xs text-slate-500 italic">
              Setting role...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
