// New Trip page — uses shared TripForm with TL master picker

import Link from 'next/link';
import TripForm from '@/components/trips/TripForm';
import { createTrip } from '../actions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function fetchTourLeaders() {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('tour_leaders')
      .select('*')
      .eq('active', true)
      .order('name');
    return data || [];
  } catch {
    return [];
  }
}

export default async function NewTripPage() {
  const tourLeaders = await fetchTourLeaders();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/trips" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke list</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Buat Trip Baru</h1>
        <p className="mt-1 text-slate-600">Isi info dasar trip — bisa di-edit kapan saja nanti.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <TripForm onSubmit={createTrip} submitLabel="Buat Trip" tourLeaders={tourLeaders} />
      </div>
    </div>
  );
}
