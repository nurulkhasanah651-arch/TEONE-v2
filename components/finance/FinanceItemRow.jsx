'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFinanceItem, updatePaymentStatus } from '@/lib/actions/finance';
import { fmtRupiah } from '@/lib/utils/format';
import { PAYMENT_STATUS_CFG, PAYMENT_STATUS_OPTS } from '@/lib/utils/finance-constants';

export default function FinanceItemRow({ item, tripId }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isHpp = item.item_type === 'hpp';
  const ps = item.payment_status ? PAYMENT_STATUS_CFG[item.payment_status] : null;

  async function handleDelete() {
    if (!confirm(`Hapus "${item.component}"?`)) return;
    startTransition(async () => {
      const result = await deleteFinanceItem(item.id, tripId);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    startTransition(async () => {
      const result = await updatePaymentStatus(item.id, tripId, newStatus);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded hover:bg-slate-50 transition-colors flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{item.component}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {item.basic_fare > 0 && item.qty > 0 && `${fmtRupiah(item.basic_fare)} × ${item.qty}`}
          {item.vendor_name && ` · 🏢 ${item.vendor_name}`}
          {item.notes && ` · ${item.notes}`}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {isHpp && (
          <select
            value={item.payment_status || 'belum bayar'}
            onChange={handleStatusChange}
            disabled={pending}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded border outline-none cursor-pointer ${ps ? `${ps.bg} ${ps.text} border-current` : 'bg-slate-100 text-slate-700 border-slate-300'}`}
          >
            {PAYMENT_STATUS_OPTS.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_CFG[s]?.label || s}</option>)}
          </select>
        )}
        <p className={`text-sm font-bold ${isHpp ? 'text-amber-700' : 'text-green-700'}`}>
          {fmtRupiah(item.total_amount)}
        </p>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors disabled:opacity-50"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
