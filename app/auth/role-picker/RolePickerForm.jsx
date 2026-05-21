'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setInternalRole, setTourLeaderRole, signOut } from '@/lib/actions/user-role';

export default function RolePickerForm({ userEmail }) {
  const [step, setStep] = useState('main'); // 'main' | 'internal' | 'tl'
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleInternal(role) {
    setError('');
    startTransition(async () => {
      const r = await setInternalRole(role);
      if (r?.error) { setError(r.error); return; }
      router.push(r.redirect || '/dashboard');
      router.refresh();
    });
  }

  async function handleTL(formData) {
    setError('');
    startTransition(async () => {
      const r = await setTourLeaderRole(formData);
      if (r?.error) { setError(r.error); return; }
      alert(`Welcome, ${r.tlName}! Kamu akan masuk ke Portal TL.`);
      router.push(r.redirect || '/tl');
      router.refresh();
    });
  }

  async function handleSignOut() {
    await signOut();
  }

  if (step === 'main') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700">Pilih kategori:</p>
        <button
          onClick={() => setStep('tl')}
          disabled={pending}
          className="w-full p-5 border-2 border-pink-300 bg-pink-50 hover:bg-pink-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">👤</span>
            <div>
              <p className="font-bold text-pink-900">Tour Leader</p>
              <p className="text-xs text-pink-700 mt-0.5">
                Akses cuma trip yang di-assign ke kamu. Perlu verifikasi email + no HP yang
                terdaftar di master TL.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setStep('internal')}
          disabled={pending}
          className="w-full p-5 border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">🏢</span>
            <div>
              <p className="font-bold text-blue-900">Tim Internal</p>
              <p className="text-xs text-blue-700 mt-0.5">
                CS, Ops, Finance, atau Marketing. Pilih sub-divisi di step berikut.
              </p>
            </div>
          </div>
        </button>

        <div className="pt-3 text-center">
          <button onClick={handleSignOut} className="text-xs text-slate-500 hover:text-red-600 underline">
            Bukan akun saya — Logout
          </button>
        </div>
      </div>
    );
  }

  if (step === 'internal') {
    return (
      <div className="space-y-3">
        <button onClick={() => setStep('main')} className="text-xs text-brand-600 hover:underline">← Balik</button>
        <p className="text-sm font-bold text-slate-700">Pilih divisi internal kamu:</p>

        <button
          onClick={() => handleInternal('cs')}
          disabled={pending}
          className="w-full p-5 border-2 border-green-300 bg-green-50 hover:bg-green-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">☎</span>
            <div>
              <p className="font-bold text-green-900">Tim CS</p>
              <p className="text-xs text-green-700 mt-0.5">
                Customer Service. Akses: Dashboard, Master Trip, CS Daily, Visa, Payment
                Peserta. TIDAK bisa lihat Finance projection, PNR, Accounting.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleInternal('ops')}
          disabled={pending}
          className="w-full p-5 border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚙</span>
            <div>
              <p className="font-bold text-amber-900">Tim Ops / Finance</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Operations & Finance. Akses semua tab KECUALI Accounting (hanya
                Manager/Owner yang bisa).
              </p>
            </div>
          </div>
        </button>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (step === 'tl') {
    return (
      <form action={handleTL} className="space-y-3">
        <button type="button" onClick={() => setStep('main')} className="text-xs text-brand-600 hover:underline">← Balik</button>
        <p className="text-sm font-bold text-slate-700">Verifikasi Tour Leader</p>
        <p className="text-xs text-slate-500">
          Masukkan email & no HP yang sudah didaftarkan admin di master TL. Kalau belum
          terdaftar, hubungi admin.
        </p>

        <label className="block">
          <span className="text-xs font-bold text-slate-700 block mb-1">Email TL</span>
          <input
            type="email"
            name="email"
            required
            defaultValue={userEmail}
            placeholder="email-kamu@example.com"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Default-nya pakai email Google kamu — kalau di master TL email beda, edit di sini.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-slate-700 block mb-1">No HP / WhatsApp</span>
          <input
            type="tel"
            name="phone"
            required
            placeholder="081234567890"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Harus sama persis dengan yang didaftarkan di master TL.
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-semibold rounded-lg"
        >
          {pending ? 'Verifikasi...' : 'Masuk sebagai Tour Leader'}
        </button>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}
      </form>
    );
  }

  return null;
}
