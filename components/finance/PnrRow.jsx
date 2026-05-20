'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deletePnr, convertPnrToTrip, unlinkPnrFromTrip } from '@/lib/actions/pnr';
import { fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';

export default function PnrRow({ pnr }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const balance = (pnr.seats * pnr.ticket_price) - (pnr.deposit_total || 0) - (pnr.payoff_amount || 0);
  const isPaid = balance <= 0 && pnr.payoff_date;
  const deadlineDays = pnr.deadline ? daysUntil(pnr.deadline) : null;

  async function handleDelete() {
    if (!confirm(`Hapus PNR ${pnr.pnr}?`)) return;
    startTransition(async () => {
      const result = await deletePnr(pnr.id);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  async function handleConvert() {
    if (!confirm(`Convert PNR ${pnr.pnr} jadi master trip baru?`)) return;
    startTransition(async () => {
      const result = await convertPnrToTrip(pnr.id);
      if (result?.error) alert(result.error);
    });
  }

  async function handleUnlink() {
    if (!confirm(`Unlink PNR dari trip ${pnr.trip_id}?`)) return;
    startTransition(async () => {
      const result = await unlinkPnrFromTrip(pnr.id);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="p-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{pnr.pnr}</span>
            {pnr.vendor && <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{pnr.vendor}</span>}
            {pnr.trip_id && (
              <Link href={`/trips/${pnr.trip_id}`} className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 font-semibold">
                🔗 Linked: {pnr.trip_id}
              </Link>
            )}
            {isPaid && <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">✓ Lunas</span>}
            {deadlineDays != null && deadlineDays >= 0 && deadlineDays < 14 && !isPaid && (
              <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 font-bold animate-pulse">⚠ Deadline {deadlineDays}h</span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-semibold text-slate-800">{pnr.route || '—'}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {pnr.departure_date && `Berangkat ${fmtDate(pnr.departure_date)} · `}
            {pnr.seats > 0 && `${pnr.seats} seat · `}
            {pnr.ticket_price > 0 && `${fmtRupiah(pnr.ticket_price)}/seat`}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <span className="text-amber-700"><span className="font-semibold">DP:</span> {fmtRupiah(pnr.deposit_total || 0)}{pnr.deposit_date ? ` (${fmtDate(pnr.deposit_date)})` : ''}</span>
            <span className="text-green-700"><span className="font-semibold">Pelunasan:</span> {fmtRupiah(pnr.payoff_amount || 0)}{pnr.payoff_date ? ` (${fmtDate(pnr.payoff_date)})` : ''}</span>
            <span className={balance > 0 ? 'text-red-700' : 'text-blue-700'}><span className="font-semibold">Sisa:</span> {fmtRupiah(balance)}</span>
            {pnr.deadline && <span className="text-slate-700"><span className="font-semibold">Deadline:</span> {fmtDate(pnr.deadline)}</span>}
          </div>
          {pnr.notes && <p className="mt-1 text-xs italic text-slate-500">📝 {pnr.notes}</p>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Link href={`/finance/pnr/${pnr.id}/edit`} className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold transition-colors">
            ✎ Edit
          </Link>
          {pnr.trip_id ? (
            <button onClick={handleUnlink} disabled={pending} className="text-xs px-2.5 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold transition-colors disabled:opacity-50">
              🔓 Unlink
            </button>
          ) : (
            <button onClick={handleConvert} disabled={pending} className="text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold transition-colors disabled:opacity-50">
              → Convert to Trip
            </button>
          )}
          <button onClick={handleDelete} disabled={pending} className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors disabled:opacity-50">
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}
