'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTrip } from '@/app/(app)/trips/actions';

export default function DeleteTripButton({ tripId, tripName, tripCode }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const codeExpected = tripCode || tripId;

  function handleDelete() {
    if (confirmText.trim() !== codeExpected) {
      alert(`Ketik "${codeExpected}" persis sama untuk konfirmasi hapus.`);
      return;
    }
    startTransition(async () => {
      const r = await deleteTrip(tripId);
      if (r?.error) { alert(r.error); return; }
      router.push('/trips');
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
      >
        🗑 Hapus Trip
      </button>
    );
  }

  return (
    <div className="p-3 border-2 border-red-300 bg-red-50 rounded-lg max-w-md">
      <p className="text-sm font-bold text-red-800">⚠ Hapus Trip "{tripName}" permanen?</p>
      <p className="text-xs text-red-700 mt-1">
        Trip + semua data terkait (peserta, finance, accounting entries linked) tidak bisa dipulihkan.
        Ketik kode trip <strong>{codeExpected}</strong> untuk konfirmasi:
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={codeExpected}
        className="mt-2 w-full px-2 py-1 border border-red-300 rounded text-sm"
      />
      <div className="mt-2 flex gap-2 justify-end">
        <button
          onClick={() => { setConfirming(false); setConfirmText(''); }}
          className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
        >
          Batal
        </button>
        <button
          onClick={handleDelete}
          disabled={pending || confirmText.trim() !== codeExpected}
          className="px-3 py-1 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50"
        >
          {pending ? 'Menghapus...' : '🗑 Hapus Permanen'}
        </button>
      </div>
    </div>
  );
}
