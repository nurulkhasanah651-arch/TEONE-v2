'use client';

// Round 177v4: Bulk sync tl_payments → trip_finance_items
// Path: components/hr/BulkSyncAccountingButton.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function BulkSyncAccountingButton({ bulkSyncAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  function handleSync() {
    if (!confirm('Sync semua TL payments (approved + paid + pending) ke trip_finance_items?\n\nIdempotent — aman di-klik berulang.')) return;
    setResult(null);
    startTransition(async () => {
      const r = await bulkSyncAction();
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSync}
        disabled={pending}
        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card"
        title="Backfill semua tl_payments ke accounting (idempotent)"
      >
        {pending ? '⏳ Syncing...' : '🔄 Bulk Sync ke Accounting'}
      </button>

      {result && (
        <div className={`rounded-lg p-3 text-xs ${result.error ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {result.error ? (
            <p>⚠ {result.error}</p>
          ) : (
            <>
              <p className="font-bold">{result.message}</p>
              {result.errors?.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-red-600 font-semibold">
                    ⚠ {result.errors.length} error
                  </summary>
                  <ul className="mt-1 pl-4 space-y-0.5 text-red-700">
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
