'use client';
import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ready, setReady] = useState(false);   // sesi recovery aktif?
  const [checking, setChecking] = useState(true);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  // Supabase client (detectSessionInUrl) akan menukar token di URL jadi sesi recovery.
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || session) { setReady(true); setChecking(false); }
    });
    // fallback: cek sesi yg sudah ada
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data?.session) setReady(true);
      setChecking(false);
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  function submit(e) {
    e.preventDefault();
    setErr('');
    if (pwd.length < 6) { setErr('Password baru minimal 6 karakter.'); return; }
    if (pwd !== pwd2) { setErr('Konfirmasi password tidak sama.'); return; }
    start(async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password: pwd });
        if (error) { setErr('Gagal ganti password: ' + error.message); return; }
        setDone(true);
        setTimeout(() => { router.push('/akun'); router.refresh(); }, 1500);
      } catch { setErr('Terjadi kesalahan. Coba lagi.'); }
    });
  }

  const inp = 'w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none';

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-12">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Atur Password Baru</h1>

        {done ? (
          <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
            ✅ Password berhasil diganti! Mengarahkan ke akun kamu…
          </div>
        ) : checking ? (
          <p className="mt-5 text-sm text-slate-500">⏳ Memeriksa link reset…</p>
        ) : !ready ? (
          <div className="mt-5">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              Link reset tidak valid atau sudah kedaluwarsa. Minta link baru dari halaman masuk.
            </div>
            <Link href="/masuk" className="mt-4 inline-block text-sm font-semibold text-emerald-600 hover:underline">← Kembali ke Masuk</Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mt-1">Masukkan password baru untuk akunmu.</p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="block"><span className="text-xs font-bold text-slate-600">Password Baru</span>
                <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required placeholder="minimal 6 karakter" className={inp} autoComplete="new-password" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-600">Ulangi Password Baru</span>
                <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} required placeholder="ketik ulang" className={inp} autoComplete="new-password" /></label>
              {err && <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-sm text-red-700">⚠ {err}</div>}
              <button type="submit" disabled={pending} className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold">
                {pending ? 'Menyimpan…' : 'Simpan Password Baru'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
