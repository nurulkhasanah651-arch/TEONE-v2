'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { resolvePesertaLogin } from '@/lib/actions/peserta-auth';

export default function MasukPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [reset, setReset] = useState('');
  const [ident, setIdent] = useState('');   // email ATAU no HP
  const [pwd, setPwd] = useState('');

  function submit(e) {
    e.preventDefault();
    setErr(''); setReset('');
    start(async () => {
      try {
        const r = await resolvePesertaLogin(ident);
        if (r?.error) { setErr(r.error); return; }
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({ email: r.email, password: pwd });
        if (error) { setErr('Email/No HP atau password salah.'); return; }
        router.push('/akun');
        router.refresh();
      } catch { setErr('Terjadi kesalahan. Coba lagi.'); }
    });
  }

  function forgot() {
    setErr(''); setReset('');
    if (!ident.trim()) { setErr('Isi email atau no HP dulu untuk reset password.'); return; }
    start(async () => {
      try {
        const r = await resolvePesertaLogin(ident);
        if (r?.error) { setErr(r.error); return; }
        const supabase = createClient();
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const { error } = await supabase.auth.resetPasswordForEmail(r.email, { redirectTo: `${origin}/reset-password` });
        if (error) { setErr('Gagal kirim reset. Coba lagi.'); return; }
        const masked = r.email.replace(/^(.{2}).*(@.*)$/, '$1•••$2');
        setReset(`Link reset password sudah dikirim ke email ${masked} (cek folder spam juga ya).`);
      } catch { setErr('Gagal kirim reset. Coba lagi.'); }
    });
  }

  const inp = 'w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none';
  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-12">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Masuk Akun Peserta</h1>
        <p className="text-sm text-slate-500 mt-1">Pantau status pembayaran & trip yang kamu ikuti.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Email atau No HP</span>
            <input type="text" value={ident} onChange={(e) => setIdent(e.target.value)} required
              placeholder="email@kamu.com  atau  08xxxxxxxxxx" className={inp} autoComplete="username" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Password</span>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required
              placeholder="password" className={inp} autoComplete="current-password" />
          </label>
          {err && <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-sm text-red-700">⚠ {err}</div>}
          {reset && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-sm text-emerald-700">✓ {reset}</div>}
          <button type="submit" disabled={pending} className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold">
            {pending ? 'Memproses…' : 'Masuk'}
          </button>
        </form>
        <div className="mt-3 flex items-center justify-between text-sm">
          <button type="button" onClick={forgot} disabled={pending} className="text-slate-500 hover:underline disabled:opacity-50">Lupa password?</button>
          <Link href="/trip" className="text-emerald-600 font-semibold hover:underline">Belum punya akun? Pesan trip →</Link>
        </div>
        <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
          💡 Login bisa pakai <b>email</b> atau <b>nomor HP</b> yang kamu daftarkan saat pesan trip. Lupa password? Klik “Lupa password?”, link reset kami kirim ke emailmu.
        </p>
      </div>
    </div>
  );
}
