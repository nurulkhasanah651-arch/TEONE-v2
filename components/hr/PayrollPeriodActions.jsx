'use client';

// Round 171: PayrollPeriodActions — finalize, mark all paid, delete
// Path: components/hr/PayrollPeriodActions.jsx

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { finalizePeriod, markAllEntriesPaid, deletePeriod } from '@/lib/actions/payroll';

export default function PayrollPeriodActions({ period, entriesCount }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleFinalize() {
    if (!confirm(`Finalize periode ${period.period_label}? Setelah finalize, slip masih bisa di-edit tapi statusnya jadi LOCKED.`)) return;
    startTransition(async () => {
      const r = await finalizePeriod(period.id);
      if (r?.error) alert(r.error);
      else router.refresh();
    });
  }

  function handleMarkAllPaid() {
    if (!confirm(`Mark SEMUA ${entriesCount} slip gaji sebagai PAID? Pakai kalau semua udah ditransfer ke bank.`)) return;
    startTransition(async () => {
      const r = await markAllEntriesPaid(period.id);
      if (r?.error) alert(r.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`HAPUS periode ${period.period_label}? Semua slip gaji akan hilang permanen. Tidak bisa di-undo.`)) return;
    startTransition(async () => {
      const r = await deletePeriod(period.id);
      if (r?.error) alert(r.error);
      else router.push('/hr/payroll');
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {period.status === 'draft' && (
        <button type="button" onClick={handleFinalize} disabled={pending} className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-semibold rounded disabled:opacity-50">
          🔒 Finalize
        </button>
      )}
      {period.status !== 'paid' && (
        <button type="button" onClick={handleMarkAllPaid} disabled={pending} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded disabled:opacity-50">
          💸 Mark All Paid
        </button>
      )}
      <button type="button" onClick={handleDelete} disabled={pending} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded disabled:opacity-50">
        🗑 Hapus Periode
      </button>
    </div>
  );
}
