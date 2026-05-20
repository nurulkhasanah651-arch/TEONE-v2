'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccountingEntry } from '@/lib/actions/accounting';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';

const SOURCE_LABEL = {
  payment: { label: 'Payment', bg: 'bg-blue-50', text: 'text-blue-700' },
  hpp:     { label: 'HPP Lunas', bg: 'bg-amber-50', text: 'text-amber-700' },
  manual:  { label: 'Manual', bg: 'bg-purple-50', text: 'text-purple-700' },
};

export default function AccountingRow({ entry: e }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isIn = e.type === 'in';
  const src = SOURCE_LABEL[e.source] || SOURCE_LABEL.manual;

  async function handleDelete() {
    if (!confirm(`Hapus entry ${e.description}?`)) return;
    startTransition(async () => {
      const result = await deleteAccountingEntry(e.manualId);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${isIn ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>
              {isIn ? '⬆ IN' : '⬇ OUT'}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${src.bg} ${src.text}`}>
              {src.label}
            </span>
            {e.category && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {e.category}
              </span>
            )}
            {e.trip && (
              <Link href={`/trips/${e.trip.id}`} className="text-[11px] font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700 hover:bg-brand-100">
                {e.trip.kode_trip || `#${e.trip.id}`}
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-800">{e.description || '—'}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(e.date)}
            {e.notes && <span className="italic ml-2">· 📝 {e.notes}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className={`text-lg font-bold ${isIn ? 'text-green-700' : 'text-amber-700'}`}>
            {isIn ? '+' : '−'} {fmtRupiah(e.amount)}
          </p>
          {e.source === 'manual' && (
            <button onClick={handleDelete} disabled={pending} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold disabled:opacity-50">
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
