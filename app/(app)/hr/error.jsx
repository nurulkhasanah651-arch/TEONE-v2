'use client';

// Round 173: Error boundary untuk /hr — tampilkan error sebenarnya
// Path: app/(app)/hr/error.jsx
// File ini auto-catch error apapun yg terjadi di /hr atau sub-routes-nya

import { useEffect } from 'react';
import Link from 'next/link';

export default function HRError({ error, reset }) {
  useEffect(() => {
    console.error('[HR Error]', error);
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-red-800 mb-2">⚠ HR Page Error</h1>
        <p className="text-sm text-red-700 mb-4">
          Page HR error. Pesan error asli ada di bawah ini — copy paste ke aku untuk fix.
        </p>

        <div className="bg-white border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Error Message</p>
          <p className="text-sm font-mono text-red-700 break-all">{error?.message || 'Unknown error'}</p>

          {error?.digest && (
            <>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mt-3 mb-1">Digest</p>
              <p className="text-xs font-mono text-slate-600">{error.digest}</p>
            </>
          )}

          {error?.stack && (
            <details className="mt-3">
              <summary className="text-xs font-bold text-slate-600 cursor-pointer">Stack trace ▼</summary>
              <pre className="text-[10px] font-mono text-slate-600 mt-2 overflow-auto max-h-64 bg-slate-50 p-2 rounded">{error.stack}</pre>
            </details>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded"
          >
            🔄 Try Again
          </button>
          <Link href="/dashboard" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded">
            ← Back to Dashboard
          </Link>
        </div>

        <div className="mt-4 pt-4 border-t border-red-200 text-xs text-red-700">
          <p className="font-bold mb-1">Common fixes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Kalau "relation does not exist" → Run SQL HR tables di Supabase</li>
            <li>Kalau "module not found" → File missing di GitHub, perlu upload lagi</li>
            <li>Kalau "auth.admin" error → SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
