'use client';

// Error boundary untuk SEMUA halaman di dalam (app) — mencegah layar putih.
// Kalau ada crash di komponen mana pun, user lihat pesan ramah + tombol coba lagi,
// bukan "Application error: a client-side exception".
// Path: app/(app)/error.jsx

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppError({ error, reset }) {
  useEffect(() => {
    console.error('[App Error]', error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-card p-6 text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center text-3xl">⚠</div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">Ada gangguan sebentar</h1>
        <p className="text-sm text-slate-500 mb-5">
          Halaman ini gagal dimuat. Datamu aman — coba muat ulang. Kalau masih bermasalah, kembali ke Dashboard.
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => reset()} className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg">
            Coba lagi
          </button>
          <Link href="/dashboard" className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50">
            Ke Dashboard
          </Link>
        </div>
        {error?.digest && <p className="text-[11px] text-slate-400 mt-4 font-mono">Ref: {error.digest}</p>}
      </div>
    </div>
  );
}
