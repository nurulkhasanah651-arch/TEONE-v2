// Master Trip — SAFE version: no crash even kalau dependencies hilang
// Round 54 hotfix: defensive imports + fallback

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import TripCard from '@/components/trips/TripCard';
import { fmtRupiah } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

// Defensive: load optional Round 50/51 dependencies
let mainExpectedPerPassenger = null;
try {
  mainExpectedPerPassenger = require('@/lib/utils/price-breakdown').mainExpectedPerPassenger;
} catch {}

let TripsListView = null;
try { TripsListView = require('@/components/trips/TripsListView').default; } catch {}

let TripsCalendarView = null;
try { TripsCalendarView = require('@/components/trips/TripsCalendarView').default; } catch {}

export default async function TripsPage({ searchParams }) {
  const sp = await searchParams;
  const view = sp?.view || 'card';

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

  // Fetch passengers (defensive)
  let allPax = [];
  try {
    const { data } = await supabase.from('trip_passengers').select('*');
    allPax = data || [];
  } catch {}
  const paxByTrip = {};
  for (const p of allPax) {
    if (!paxByTrip[p.trip_id]) paxByTrip[p.trip_id] = [];
    paxByTrip[p.trip_id].push(p);
  }

  const totalTrips = trips?.length || 0;
  const openSelling = trips?.filter((t) => t.status === 'open selling').length || 0;
  const totalSeatLeft = trips?.reduce((sum, t) => sum + (t.seat_left || 0), 0) || 0;

  // Expected revenue — pakai helper kalau ada, fallback ke price × sold
  let totalRevenue = 0;
  if (typeof mainExpectedPerPassenger === 'function') {
    for (const t of trips || []) {
      if (t.status === 'cancelled') continue;
      const breakdown = t.price_breakdown || {};
      const pax = paxByTrip[t.id] || [];
      for (const p of pax) {
        try { totalRevenue += mainExpectedPerPassenger(p, breakdown); } catch {}
      }
    }
  } else {
    // Fallback legacy
    totalRevenue = trips?.reduce((s, t) => s + (t.price || 0) * (t.sold || 0), 0) || 0;
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
        <StatCard label="Revenue" value={fmtRupiah(totalRevenue)} color="text-green-700" bg="bg-green-50" small />
      </div>

      {/* View toggle — hanya muncul kalau Round 51 deps ada */}
      {(TripsListView || TripsCalendarView) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex gap-2 flex-wrap">
          <ViewButton current={view} value="card" icon="🎴" label="Card View" />
          {TripsListView && <ViewButton current={view} value="list" icon="📋" label="List (Priority)" />}
          {TripsCalendarView && <ViewButton current={view} value="calendar" icon="📅" label="Calendar" />}
        </div>
      )}

      {totalTrips === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-lg font-bold text-slate-700">Belum ada trip</p>
        </div>
      ) : view === 'list' && TripsListView ? (
        <TripsListView trips={trips} />
      ) : view === 'calendar' && TripsCalendarView ? (
        <TripsCalendarView trips={trips} />
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

function ViewButton({ current, value, icon, label }) {
  const active = current === value;
  return (
    <Link
      href={`/trips?view=${value}`}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
        active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      <span className="mr-1">{icon}</span> {label}
    </Link>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
      <div className={`mt-2 h-1 w-8 rounded-full ${bg}`} />
    </div>
  );
}
