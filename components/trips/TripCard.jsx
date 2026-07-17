// TripCard — displays a single trip in the Master Trip list
// Server Component (no client interactivity needed inside)

import Link from 'next/link';
import { fmtShort, fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg, tripChecklist, effectiveSellingStatus } from '@/lib/utils/trip-status';

export default function TripCard({ trip }) {
  const s = statusCfg(trip._sellingStatus || effectiveSellingStatus(trip));
  const days = daysUntil(trip.departure);
  const checklist = tripChecklist(trip);
  const okCount = checklist.filter((c) => c.ok).length;

  return (
    <Link
      href={`/trips/${trip.id}`}
      className={`block bg-white rounded-xl border border-slate-200 border-l-4 ${s.accent} p-4 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
              {trip.kode_trip || `#${trip.id}`}
            </span>
            {days > 0 && days <= 7 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-600 text-white">
                Berangkat {days}h
              </span>
            )}
            {trip.tl_assignment_status === 'pending' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-500 text-white">
                Menunggu TL
              </span>
            )}
            {trip.tl_assignment_status === 'approved' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-600 text-white">
                TL Approve
              </span>
            )}
          </div>
          <p className="text-lg font-bold text-brand-700 leading-tight">{trip.name}</p>
          <p className="mt-1.5 text-sm text-slate-600">
            <span className="font-semibold text-slate-700">PIC:</span> {trip.pic || '—'} ·{' '}
            <span className="font-semibold text-slate-700">TL:</span>{' '}
            <span className={trip.tl_name ? 'text-brand-700 font-semibold' : 'text-slate-400'}>
              {trip.tl_name || '—'}
            </span>
            {trip.ticket && ` · ${trip.ticket}`}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${s.bg} ${s.text} ${s.border} whitespace-nowrap`}>
          {s.label}
        </span>
      </div>

      {/* Seat bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-slate-600 font-medium mb-1">
          <span>Seat: {trip._soldReal ?? trip.sold ?? 0} / {trip.quota || 0}</span>
          <span>Sisa: {trip._seatLeftReal ?? trip.seat_left ?? '—'}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-700"
            style={{ width: `${trip.quota ? ((trip._soldReal ?? trip.sold ?? 0) / trip.quota) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Footer: date + price */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">
          ✈ {fmtDate(trip.departure)}
          {days > 0 && days < 180 && (
            <span className={`ml-1 font-bold ${days < 14 ? 'text-red-600' : 'text-slate-500'}`}>
              ({days}h)
            </span>
          )}
        </p>
        <p className="text-base font-bold text-brand-700">
          {trip.price > 0 ? fmtShort(trip.price) : '—'}
        </p>
      </div>

      {/* Checklist */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {checklist.map((c) => (
          <span
            key={c.label}
            className={`text-[11px] px-2 py-0.5 rounded font-semibold border ${
              c.ok
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
        <span className="ml-auto text-xs font-bold text-brand-700">{okCount}/{checklist.length}</span>
      </div>
    </Link>
  );
}
