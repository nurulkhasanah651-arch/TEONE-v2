'use client';

// Round 171: SyncEmailsButton — sync employees ke auth.users by email
// Path: components/hr/SyncEmailsButton.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncEmployeesWithAuth } from '@/lib/actions/payroll';

export default function SyncEmailsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  function handleSync() {
    if (!confirm('Sync semua karyawan yang punya email cocok ke akun TEONE? Karyawan yang udah login pakai email yang sama akan auto-terhubung.')) return;
    startTransition(async () => {
      const r = await syncEmployeesWithAuth();
      if (r?.error) { setResult({ error: r.error }); return; }
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
      >
        {pending ? '⏳ Syncing...' : '🔗 Sync Email Karyawan'}
      </button>

      {result && (
        <div className={`mt-2 p-3 rounded-lg text-sm ${result.error ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {result.error ? (
            <p>❌ {result.error}</p>
          ) : (
            <>
              <p className="font-bold">✓ {result.message}</p>
              {result.linked_names?.length > 0 && (
                <p className="text-xs mt-1">Linked: {result.linked_names.join(', ')}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
