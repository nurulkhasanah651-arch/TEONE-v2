'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LogoutButton({ className = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function out() {
    start(async () => {
      try { await createClient().auth.signOut(); } catch {}
      router.push('/masuk'); router.refresh();
    });
  }
  return (
    <button onClick={out} disabled={pending} className={className || 'text-sm font-semibold text-red-600 hover:underline disabled:opacity-50'}>
      {pending ? 'Keluar…' : 'Keluar'}
    </button>
  );
}
