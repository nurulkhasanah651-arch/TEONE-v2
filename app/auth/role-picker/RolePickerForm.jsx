'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setInternalRole, setTourLeaderRole, signOut } from '@/lib/actions/user-role';

export default function RolePickerForm({ userEmail }) {
  // 'main' | 'internal' | 'tl' | 'cs-password' | 'ops-password'
  const [step, setStep] = useState('main');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleInternalPick(role) {
    setError('');
    setPassword('');
    if (role === 'cs') setStep('cs-password');
    else if (role === 'ops') setStep('ops-password');
  }

  function handleInternalSubmit(role) {
    setError('');
    startTransition(async () => {
      const r = await setInternalRole(role, password);
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
          onClick={() => { setError(''); setStep('tl'); }}
          disabled={pending}
          className="w-full p-5 border-2 border-pink-300 bg-pink-50 hover:bg-pink-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">👤</span>
            <div>
              <p className="font-bold text-pink-900">Tour Leader</p>
              <p className="text-xs text-pink-700 mt-0.5">
                Akses cuma trip yang di-assign ke kamu. Verifikasi email + no HP dari master TL.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => { setError(''); setStep('internal'); }}
          disabled={pending}
          className="w-full p-5 border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">🏢</span>
            <div>
              <p className="font-bold text-blue-900">Tim Internal</p>
              <p className="text-xs text-blue-700 mt-0.5">
                CS atau Ops/Finance. Butuh password role (dari admin).
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
        <p className="text-sm font-bold text-slate-700">Pilih divisi internal kamu (butuh password):</p>

        <button
          onClick={() => handleInternalPick('cs')}
          disabled={pending}
          className="w-full p-5 border-2 border-green-300 bg-green-50 hover:bg-green-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">☎</span>
            <div>
              <p className="font-bold text-green-900">Tim CS 🔒</p>
              <p className="text-xs text-green-700 mt-0.5">
                Customer Service. Akses: Dashboard, Master Trip, CS Daily, Visa, Payment Peserta, Chat, Tasks.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleInternalPick('ops')}
          disabled={pending}
          className="w-full p-5 border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-xl text-left transition-colors disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚙</span>
            <div>
              <p className="font-bold text-amber-900">Tim Ops / Finance 🔒</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Operations & Finance. Akses semua KECUALI Accounting.
              </p>
            </div>
          </div>
        </button>
      </div>
    );
  }

  if (step === 'cs-password' || step === 'ops-password') {
    const role = step === 'cs-password' ? 'cs' : 'ops';
    const isCs = role === 'cs';
    const roleLabel = isCs ? 'Tim CS' : 'Tim Ops/Finance';
    const roleIcon = isCs ? '☎' : '⚙';

    return (
      <div className="space-y-4">
        <button onClick={() => setStep('internal')} className="text-xs text-brand-600 hover:underline">← Balik</button>

        <div className={`p-4 rounded-xl border-2 ${isCs ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{roleIcon}</span>
            <div>
              <p className={`font-bold ${isCs ? 'text-green-900' : 'text-amber-900'}`}>🔒 Verifikasi Password — {roleLabel}</p>
              <p className={`text-xs mt-0.5 ${isCs ? 'text-green-700' : 'text-amber-700'}`}>
                Masukkan password yang dikasih admin/owner untuk role ini.
              </p>
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-bold text-slate-700 block mb-1">Password Role</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInternalSubmit(role); } }}
            autoFocus
            placeholder="••••••••••"
            className="w-full px-3 py-2.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Belum punya password? Hubungi owner perusahaan.
          </p>
        </label>

        <button
          onClick={() => handleInternalSubmit(role)}
          disabled={pending || !password}
          className={`w-full py-3 text-white font-semibold rounded-lg disabled:opacity-50 ${isCs ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'}`}
        >
          {pending ? 'Verifikasi...' : `Masuk sebagai ${roleLabel}`}
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
          Masukkan email & no HP yang sudah didaftarkan admin di master TL.
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
