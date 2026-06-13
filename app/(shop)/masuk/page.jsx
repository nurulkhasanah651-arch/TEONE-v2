'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function MasukPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [reset, setReset] = useState('');

  function submit(e) {
    e.preventDefault();
    setErr(''); setReset('');
    start(async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pwd });
        if (error) { setErr('Email atau password salah.'); return; }
        router.push('/akun');
        router.refresh();
      } catch { setErr('Terjadi kesalahan. Coba lagi.'); }
    });
  }

  async function forgot() {
    setErr(''); setReset('');
    if (!email.trim()) { setErr('Isi email dulu untuk reset password.'); return; }
    try {
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/akun` });
      setReset('Link reset password sudah dikirim ke email kamu (cek folder spam).');
    } catch { setErr('Gagal kirim reset. Coba lagi.'); }
  }

  const inp = 'w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm';
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Masuk Akun Peserta</h1>
        <p className="text-sm text-slate-500 mt-1">Pantau status pembayaran & trip yang kamu ikuti.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="email@kamu.com" className={inp} autoComplete="email" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Password</span>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required placeholder="password" className={inp} autoComplete="current-password" /></label>
          {err && <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-sm text-red-700">⚠ {err}</div>}
          {reset && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-sm text-emerald-700">{reset}</div>}
          <button type="submit" disabled={pending} className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold">{pending ? 'Memproses…' : 'Masuk'}</button>
        </form>
        <div className="mt-3 flex items-center justify-between text-sm">
          <button onClick={forgot} className="text-slate-500 hover:underline">Lupa password?</button>
          <Link href="/trip" className="text-emerald-600 font-semibold hover:underline">Belum punya akun? Pesan trip →</Link>
        </div>
      </div>
    </div>
  );
}
