// Itinerary Only (Operasional) — editor + generator PDF per trip.
// Path: app/(app)/operasional/itinerary/page.jsx
import Link from 'next/link';
import { listItineraryTrips, getItineraryDoc } from '@/lib/actions/itinerary-doc';
import ItineraryTripPicker from '@/components/operasional/ItineraryTripPicker';
import ItineraryDocEditor from '@/components/operasional/ItineraryDocEditor';

export const dynamic = 'force-dynamic';

export default async function ItineraryPage({ searchParams }) {
  const sp = await searchParams;
  const tripId = sp?.trip || null;

  if (!tripId) {
    const res = await listItineraryTrips();
    if (res?.error) return <div className="max-w-3xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div></div>;
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">🧭 Itinerary Only</h1>
          <p className="mt-1 text-slate-600">Pilih trip untuk buat / edit itinerary (detail penerbangan + jadwal harian). Bisa di-download PDF per trip.</p>
        </div>
        <ItineraryTripPicker trips={res.trips || []} />
      </div>
    );
  }

  const res = await getItineraryDoc(tripId);
  if (res?.error) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <Link href="/operasional/itinerary" className="text-sm text-brand-600 font-medium hover:underline">← Pilih trip lain</Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div>
      </div>
    );
  }
  return (
    <div className="max-w-4xl mx-auto">
      <ItineraryDocEditor trip={res.trip} doc={res.doc} />
    </div>
  );
}
