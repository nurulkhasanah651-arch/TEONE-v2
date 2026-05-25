'use client';

// Round 112: Role picker client component
// Path: app/auth/role-picker/RolePickerClient.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RolePickerClient({ userEmail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [step, setStep] = useState('main'); // main | internal | cs-pwd | ops-pwd | tl

  async function setRole(role, extraData = {}) {
    setError('');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      return false;
    }
    const { error: updErr } = await supabase.auth.updateUser({
      data: { ...user.user_metadata, role, ...extraData },
    });
    if (updErr) {
      setError(updErr.message);
      return false;
    }
    return true;
  }

  function handleManagerOrOwner(role) {
    startTransition(async () => {
      const ok = await setRole(role);
      if (ok) {
        router.push('/dashboard');
        router.refresh();
      }
    });
  }

  function handleTL() {
    startTransition(async () => {
      const ok = await setRole('tour_leader');
      if (ok) {
        router.push('/tl');
        router.refresh();
      }
    });
  }

  function handleCS() {
    startTransition(async () => {
      const ok = await setRole('cs');
      if (ok) {
        router.push('/dashboard');
        router.refresh();
      }
    });
  }

  function handleOps() {
    startTransition(async () => {
      const ok = await setRole('ops');
      if (ok) {
        router.push('/dashboard');
        router.refresh();
      }
    });
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-slate-700">Pilih role kamu:</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          ⚠ {error}
        </div>
      )}

      <button
        onClick={() => handleManagerOrOwner('manager')}
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
        onClick={handleOps}
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
        onClick={handleCS}
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
        onClick={handleTL}
        disabled={pending}
        className="w-full p-4 border-2 border-pink-300 bg-pink-50 hover:bg-pink-100 rounded-xl text-left transition-colors disabled:opacity-50"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">👤</span>
          <div>
            <p className="font-bold text-pink-900">Tour Leader</p>
            <p className="text-xs text-pink-700">Portal TL khusus (cuma trip yang di-assign)</p>
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
  );
}
