'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccount } from '@/lib/actions/accounts';
import { fmtRupiah } from '@/lib/utils/format';

export default function AccountRow({ account: a }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleDelete() {
    const hasEntries = a.entryCount > 0;
    const msg = hasEntries
      ? `Akun "${a.name}" punya ${a.entryCount} entry. Akan di-soft delete (inactive). Lanjut?`
      : `Hapus akun "${a.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await deleteAccount(a.id);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-brand-700">{a.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {a.account_number && `${a.account_number} · `}
            Saldo awal: {fmtRupiah(a.starting_balance || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {a.entryCount || 0} transaksi · IN {fmtRupiah(a.inSum || 0)} · OUT {fmtRupiah(a.outSum || 0)}
          </p>
          {a.notes && <p className="text-[11px] italic text-slate-500 mt-0.5">📝 {a.notes}</p>}
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${a.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtRupiah(a.balance)}</p>
          <div className="flex gap-1.5 mt-1 justify-end">
            <Link href={`/accounting/accounts/${a.id}/edit`} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">
              ✎ Edit
            </Link>
            <button onClick={handleDelete} disabled={pending} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
              🗑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
