'use client';

// Role picker — HANYA untuk login Google yang belum dikenali.
// Staf/karyawan TIDAK pakai halaman ini (role di-set manual oleh admin).
// Pilihan terbatas: Tour Leader / Mitra, dan WAJIB cocok No HP di master.
// Path: app/auth/role-picker/page.jsx

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { registerAsMitra } from '@/lib/actions/mitra';
import { registerAsTourLeader } from '@/lib/actions/tour-leaders';

export default function RolePickerPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null); // 'tl' | 'mitra'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    async function checkUser() {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.replace('/login'); return; }
      // Hanya STAF RESMI (role di app_metadata, di-set admin) yg dialihkan ke dashboard.
      // TL/Mitra yg metadata-nya ke-set dari percobaan sebelumnya TIDAK boleh auto-redirect —
      // mereka harus tetap lihat form verifikasi No HP (cegah loop role-picker ↔ dashboard).
      const STAFF = ['owner', 'accounting', 'manager', 'ops', 'cs', 'pic'];
      const adminRole = u.app_metadata?.role;
      if (adminRole && STAFF.includes(adminRole)) { router.replace('/dashboard'); return; }
      setUser(u);
      setLoading(false);
    }
    checkUser();
  }, [router]);

  function submitTL() {
    setError('');
    startTransition(async () => {
      const fd = new FormData(); fd.set('phone', phone);
      const r = await registerAsTourLeader(fd);
      if (r?.error) { setError(r.error); return; }
      router.replace(r.redirect || '/tl'); router.refresh();
    });
  }

  function submitMitra() {
    setError('');
    startTransition(async () => {
      const fd = new FormData(); fd.set('name', name); fd.set('phone', phone);
      const r = await registerAsMitra(fd);
      if (r?.error) { setError(r.error); return; }
      router.replace(r.redirect || '/mitra'); router.refresh();
    });
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login'); router.refresh();
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
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xl">✈</div>
          <h1 className="text-xl font-bold text-brand-700">Verifikasi Akun</h1>
          <p className="text-xs text-slate-500 mt-1">{user?.email}</p>
        </div>

        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">⚠ {error}</div>
        )}

        {!mode && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-slate-700">Kamu masuk sebagai:</p>
            <p className="text-[11px] text-slate-500">Akun karyawan diatur oleh admin. Lewat halaman ini hanya untuk Tour Leader & Mitra, dan harus cocok dengan No HP yang sudah didaftarkan admin.</p>

            <button onClick={() => { setMode('tl'); setError(''); }} disabled={pending}
              className="w-full p-4 border-2 border-pink-300 bg-pink-50 hover:bg-pink-100 rounded-xl text-left transition-colors disabled:opacity-50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👤</span>
                <div><p className="font-bold text-pink-900">Tour Leader</p><p className="text-xs text-pink-700">Portal TL — verifikasi No HP</p></div>
              </div>
            </button>

            <button onClick={() => { setMode('mitra'); setError(''); }} disabled={pending}
              className="w-full p-4 border-2 border-teal-300 bg-teal-50 hover:bg-teal-100 rounded-xl text-left transition-colors disabled:opacity-50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🤝</span>
                <div><p className="font-bold text-teal-900">Mitra / Agen</p><p className="text-xs text-teal-700">Lihat trip dijual — verifikasi No HP</p></div>
              </div>
            </button>
          </div>
        )}

        {mode === 'tl' && (
          <div className="space-y-3 p-4 border-2 border-pink-300 bg-pink-50 rounded-xl">
            <p className="font-bold text-pink-900 text-sm">👤 Verifikasi Tour Leader</p>
            <p className="text-[11px] text-pink-700">Masukkan No HP yang sudah didaftarkan admin di Master TL.</p>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No HP (cth 0812...)" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
            <div className="flex gap-2">
              <button onClick={submitTL} disabled={pending} className="flex-1 px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-bold rounded disabled:opacity-50">{pending ? '...' : 'Verifikasi & Masuk'}</button>
              <button onClick={() => { setMode(null); setError(''); }} disabled={pending} className="px-3 py-2 bg-slate-100 text-slate-600 text-sm rounded">Kembali</button>
            </div>
          </div>
        )}

        {mode === 'mitra' && (
          <div className="space-y-2 p-4 border-2 border-teal-300 bg-teal-50 rounded-xl">
            <p className="font-bold text-teal-900 text-sm">🤝 Verifikasi Mitra</p>
            <p className="text-[11px] text-teal-700">No HP harus sudah didaftarkan admin di Master Mitra.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No HP (cth 0812...)" className="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
            <div className="flex gap-2">
              <button onClick={submitMitra} disabled={pending} className="flex-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded disabled:opacity-50">{pending ? '...' : 'Verifikasi & Masuk'}</button>
              <button onClick={() => { setMode(null); setError(''); }} disabled={pending} className="px-3 py-2 bg-slate-100 text-slate-600 text-sm rounded">Kembali</button>
            </div>
          </div>
        )}

        <div className="pt-4 mt-4 text-center border-t border-slate-200">
          <p className="text-[10px] text-slate-400 mb-1">Bukan akun kamu? Atau belum terdaftar?</p>
          <button onClick={handleSignOut} disabled={pending} className="text-xs text-slate-500 hover:text-red-600 underline">Logout</button>
        </div>
      </div>
    </main>
  );
}
