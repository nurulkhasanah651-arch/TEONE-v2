// Master Trip — Round 77: Active/Monthly/Yearly/History + download (via client component)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPicScope, filterTripsForPic } from '@/lib/auth/pic-scope';
import TripsMasterView from '@/components/trips/TripsMasterView';
import { fmtRupiah } from '@/lib/utils/format';
import { fetchAll } from '@/lib/supabase/fetch-all';

export const dynamic = 'force-dynamic';

let mainExpectedPerPassenger = null;
try {
  mainExpectedPerPassenger = require('@/lib/utils/price-breakdown').mainExpectedPerPassenger;
} catch {}

export default async function TripsPage() {
  const supabase = createClient();
  let { data: trips, error } = await supabase
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

  // KHASANAH: PIC hanya lihat trip miliknya (teone tak terpengaruh — brand-gated)
  { const { data: { user } } = await supabase.auth.getUser(); const scope = await getPicScope(supabase, user); trips = filterTripsForPic(trips, scope); }

  // Fetch passengers (defensive)
  let allPax = [];
  try {
    // R: fetchAll (paginasi) — hindari cap 1000 yg bikin trip dgn peserta di baris >1000
    //    tampil 0 (mis. 536). Kolom minimal: cukup utk hitung aktif + revenue.
    allPax = await fetchAll(() => supabase
      .from('trip_passengers')
      .select('trip_id, transfer_status, refund_status, room_type, age_type, price_paid, discount_amount'));
  } catch {}
  const isActivePax = (p) => p.transfer_status !== 'transferred'
    && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
  const paxByTrip = {};
  for (const p of allPax) {
    if (!isActivePax(p)) continue;
    if (!paxByTrip[p.trip_id]) paxByTrip[p.trip_id] = [];
    paxByTrip[p.trip_id].push(p);
  }
  // Sold riil = jumlah peserta aktif; sisa = quota - sold
  for (const t of (trips || [])) {
    const cnt = (paxByTrip[t.id] || []).length;
    t._soldReal = cnt;
    t._seatLeftReal = Math.max((t.quota || 0) - cnt, 0);
  }

  // Hero stats — semua trip (kecuali cancelled untuk revenue/seat)
  const safeTrips = trips || [];
  const totalTrips = safeTrips.length;
  const activeTrips = safeTrips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const openSelling = safeTrips.filter((t) => t.status === 'open selling').length;
  const completedCount = safeTrips.filter((t) => t.status === 'completed').length;
  const totalSeatLeft = activeTrips.reduce((sum, t) => sum + (t._seatLeftReal ?? 0), 0);

  let totalRevenue = 0;
  if (typeof mainExpectedPerPassenger === 'function') {
    for (const t of safeTrips) {
      if (t.status === 'cancelled') continue;
      const breakdown = t.price_breakdown || {};
      const pax = paxByTrip[t.id] || [];
      for (const p of pax) {
        try { totalRevenue += mainExpectedPerPassenger(p, breakdown); } catch {}
      }
    }
  } else {
    totalRevenue = safeTrips.reduce((s, t) => s + (t.price || 0) * (t.sold || 0), 0);
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Trip" value={totalTrips} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Open Selling" value={openSelling} color="text-blue-700" bg="bg-blue-50" />
        <StatCard label="Completed" value={completedCount} color="text-slate-700" bg="bg-slate-100" />
        <StatCard label="Seat Tersisa" value={totalSeatLeft} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Revenue" value={fmtRupiah(totalRevenue)} color="text-green-700" bg="bg-green-50" small />
      </div>

      <TripsMasterView trips={safeTrips} paxByTrip={paxByTrip} />
    </div>
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
