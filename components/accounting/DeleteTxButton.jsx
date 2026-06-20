'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccountingTransaction } from '@/lib/actions/accounting';

export default function DeleteTxButton({ source, id, label = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  function handle() {
    if (!confirm(`Hapus transaksi ini?${label ? `\n\n"${label}"` : ''}\n\nTindakan ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    start(async () => {
      const r = await deleteAccountingTransaction(source, id);
      setBusy(false);
      if (r?.error) { alert('Gagal hapus: ' + r.error); return; }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending || busy}
      title="Hapus transaksi"
      className="shrink-0 text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold disabled:opacity-50"
    >
      {busy ? '…' : '🗑'}
    </button>
  );
}
