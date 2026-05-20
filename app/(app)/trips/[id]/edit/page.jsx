// Edit Trip page — uses shared TripForm pre-filled with current trip data

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TripForm from '@/components/trips/TripForm';
import { updateTrip } from '../../actions';

export default async function EditTripPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: trip, error } = await supabase.from('trips').select('*').eq('id', id).maybeSingle();

  if (error || !trip) {
    notFound();
  }

  // Bind tripId to the server action
  const updateThisTrip = updateTrip.bind(null, id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href={`/trips/${id}`} className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke detail</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Edit Trip</h1>
        <p className="mt-1 text-slate-600">
          <span className="font-mono font-bold">{trip.kode_trip || `#${trip.id}`}</span> — {trip.name}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <TripForm initial={trip} onSubmit={updateThisTrip} submitLabel="Update Trip" />
      </div>
    </div>
  );
}
