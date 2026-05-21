// Master Trip list — Round 50: revenue pakai expected dari price_breakdown × pax

import { createClient } from '@/lib/supabase/server';
import TripCard from '@/components/trips/TripCard';
import { fmtRupiah } from '@/lib/utils/format';
import { mainExpectedPerPassenger } from '@/lib/utils/price-breakdown';

export const dynamic = 'force-dynamic';

export default async function TripsPage() {
  const supabase = createClient();
  const { data: trips, error } = await supabase
    .from('trips')
    .select('*')
    .order('departure', { ascending: true, nullsFirst: false });

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

  // Fetch all passengers untuk hitung expected revenue
  let allPax = [];
  try {
    const { data } = await supabase.from('trip_passengers').select('*');
    allPax = data || [];
  } catch {
    allPax = [];
  }
  const paxByTrip = {};
  for (const p of allPax) {
    if (!paxByTrip[p.trip_id]) paxByTrip[p.trip_id] = [];
    paxByTrip[p.trip_id].push(p);
  }

  // Aggregate stats
  const totalTrips = trips?.length || 0;
  const openSelling = trips?.filter((t) => t.status === 'open selling').length || 0;
  const totalSeatLeft = trips?.reduce((sum, t) => sum + (t.seat_left || 0), 0) || 0;

  // Expected Revenue = sum mainExpectedPerPassenger (room + tips + city_tax) untuk semua peserta non-cancelled
  let totalExpectedRevenue = 0;
  for (const t of trips || []) {
    if (t.status === 'cancelled') continue;
    const breakdown = t.price_breakdown || {};
    const pax = paxByTrip[t.id] || [];
    for (const p of pax) {
      totalExpectedRevenue += mainExpectedPerPassenger(p, breakdown);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">Master Trip</h1>
          <p className="mt-1 text-slate-600">Kelola semua trip — buat, edit, dan pantau status penjualan.</p>
        </div>
        <a
          href="/trips/new"
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
        >
          <span>+</span> Buat Trip Baru
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Trip" value={totalTrips} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Open Selling" value={openSelling} color="text-blue-700" bg="bg-blue-50" />
        <StatCard label="Seat Tersisa" value={totalSeatLeft} color="text-amber-700" bg="bg-amber-50" />
        <StatCard
          label="Expected Revenue"
          value={fmtRupiah(totalExpectedRevenue)}
          color="text-green-700"
          bg="bg-green-50"
          sub="Wajib: room + tips + city tax × peserta"
          small
        />
      </div>

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

function StatCard({ label, value, color, bg, small = false, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-base' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      <div className={`mt-2 h-1 w-8 rounded-full ${bg}`} />
    </div>
  );
}
