// Detail Optional Tour per group (Operasional). ADITIF: halaman baru.
// Path: app/(app)/operasional/optional-tour/[tripId]/page.jsx
import Link from 'next/link';
import { getTripOptionalTours } from '@/lib/actions/optional-tours';
import OptionalTourManager from '@/components/operasional/OptionalTourManager';

export const dynamic = 'force-dynamic';

export default async function OptionalTourTripPage({ params }) {
  const tripId = params?.tripId;
  const r = await getTripOptionalTours(tripId).catch(() => null);
  const trip = r?.ok ? r.trip : null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <Link href="/operasional/optional-tour" className="text-xs text-brand-600 hover:underline">← Semua Group</Link>
          <h1 className="text-2xl font-bold text-brand-700 mt-1">
            {trip ? <>🎈 {trip.kode} · <span className="font-semibold text-slate-700">{trip.name}</span></> : '🎈 Optional Tour'}
          </h1>
        </div>
        {trip && <Link href={`/trips/${trip.id}`} className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">Buka Master Trip →</Link>}
      </div>

      {r?.error ? (
        <div className="bg-white rounded-xl border border-rose-200 p-4 text-sm text-rose-600">⚠ {r.error}</div>
      ) : (
        <OptionalTourManager tripId={tripId} />
      )}
    </div>
  );
}
