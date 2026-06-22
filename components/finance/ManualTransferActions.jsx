'use client';

// Tombol Approve / Reject untuk bukti Transfer Manual web (halaman finance).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveManualTransfer, rejectManualTransfer } from '@/lib/actions/shop-manual-transfer';

export default function ManualTransferActions({ bookingId }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  function approve() {
    if (!confirm('Approve bukti transfer ini? Peserta akan otomatis masuk Master Trip & checklist payment finance.')) return;
    startTransition(async () => {
      const r = await approveManualTransfer(bookingId);
      if (r?.error) { alert('Error: ' + r.error); return; }
      router.refresh();
    });
  }

  function doReject() {
    startTransition(async () => {
      const r = await rejectManualTransfer(bookingId, reason);
      if (r?.error) { alert('Error: ' + r.error); return; }
      setRejecting(false); setReason('');
      router.refresh();
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2 mt-2">
        <input autoComplete="off" type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan tolak (mis. nominal tidak sesuai)"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <div className="flex gap-2">
          <button type="button" onClick={doReject} disabled={pending}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold">
            {pending ? '...' : 'Konfirmasi Tolak'}
          </button>
          <button type="button" onClick={() => setRejecting(false)} disabled={pending}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold">Batal</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 mt-2">
      <button type="button" onClick={approve} disabled={pending}
        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold">
        {pending ? '...' : '✓ Approve'}
      </button>
      <button type="button" onClick={() => setRejecting(true)} disabled={pending}
        className="px-4 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-xs font-bold">
        ✕ Tolak
      </button>
    </div>
  );
}
