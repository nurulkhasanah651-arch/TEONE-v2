// Master Trip — list of all trips
// Server Component: fetches trips from Supabase, no client JS for data

import { createClient } from '@/lib/supabase/server';
import TripCard from '@/components/trips/TripCard';

export const dynamic = 'force-dynamic'; // always fresh data

export default async function TripsPage() {
  const supabase = createClient();
  const { data: trips, error } = await supabase
    .from('trips')
    .select('*')
    .order('departure', { ascending: true });

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-bold">Error loading trips</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  // Aggregate stats
  const totalTrips = trips?.length || 0;
  const openSelling = trips?.filter((t) => t.status === 'open selling').length || 0;
  const totalSeatLeft = trips?.reduce((sum, t) => sum + (t.seat_left || 0), 0) || 0;
  const totalRevenue = trips?.reduce((sum, t) => sum + (t.price || 0) * (t.sold || 0), 0) || 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Master Trip</h1>
        <p className="mt-1 text-slate-600">Kelola semua trip — buat, edit, dan pantau status penjualan.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Trip" value={totalTrips} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Open Selling" value={openSelling} color="text-blue-700" bg="bg-blue-50" />
        <StatCard label="Seat Tersisa" value={totalSeatLeft} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Total Revenue" value={`Rp ${(totalRevenue / 1_000_000).toFixed(1)}M`} color="text-green-700" bg="bg-green-50" small />
      </div>

      {/* Trip cards */}
      {totalTrips === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-lg font-bold text-slate-700">Belum ada trip</p>
          <p className="mt-1 text-sm text-slate-500">Trip yang dibuat akan muncul di sini.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-xl' : 'text-2xl'}`}>{value}</p>
      <div className={`mt-2 h-1 w-8 rounded-full ${bg}`} />
    </div>
  );
}
