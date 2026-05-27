// Round 141 HOTFIX: Global passport-manage page — pakai 2 query terpisah
// Path: app/(app)/passport-manage/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

function daysUntil(s) {
  if (!s) return null;
  try {
    const target = new Date(s);
    const today = new Date();
    return Math.ceil((target - today) / 86400000);
  } catch { return null; }
}

export const dynamic = 'force-dynamic';

export default async function PassportManageGlobalPage() {
  const supabase = getServiceClient() || createClient();

  const { data: trips } = await supabase
    .from('trips')
    .select('id, kode_trip, name, departure, status, sold, quota')
    .order('departure', { ascending: true });

  const allTrips = trips || [];

  const activeTrips = allTrips.filter((t) => {
    const days = daysUntil(t.departure);
    const isCompleted = t.status === 'completed' || t.status === 'cancelled';
    const tooOld = days != null && days < -30;
    return !isCompleted && !tooOld;
  });

  // QUERY 1: trip_passengers utk semua active trips (tanpa nested)
  const tripIds = activeTrips.map((t) => t.id);
  let allPax = [];
  let allCustomers = [];
  if (tripIds.length > 0) {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id')
      .in('trip_id', tripIds);
    allPax = pax || [];

    // QUERY 2: customers separately
    const customerIds = allPax.map((p) => p.customer_id).filter(Boolean);
    if (customerIds.length > 0) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, passport_no, passport_photo_url, passport_expiry')
        .in('id', customerIds);
      allCustomers = cust || [];
    }
  }

  const customerMap = Object.fromEntries(allCustomers.map((c) => [c.id, c]));

  function getTripStats(tripId) {
    const tripPax = allPax.filter((p) => p.trip_id === tripId);
    const total = tripPax.length;
    const withPassport = tripPax.filter((p) => {
      const c = customerMap[p.customer_id];
      return !!(c?.passport_no || c?.passport_photo_url);
    }).length;
    const withoutPassport = total - withPassport;
    return { total, withPassport, withoutPassport };
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-700 flex items-center gap-2">
          🤖 Passport AI Management
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Kelola data passport semua peserta — upload foto, AI auto-extract data, update peserta existing.
        </p>
      </div>

      <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
        <p className="text-sm font-bold text-purple-800 mb-1">🛂 Cara kerja:</p>
        <ol className="text-xs text-purple-700 space-y-0.5 list-decimal list-inside">
          <li>Pilih trip yang aktif di bawah → klik tombol "Kelola Passport"</li>
          <li>Liat daftar peserta → klik 🛂 per peserta → upload foto passport</li>
          <li>AI extract data otomatis → cek & edit field passport</li>
          <li>Submit → data passport tersimpan di peserta yg sama</li>
        </ol>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-brand-700">✈ Daftar Trip Aktif</h2>
            <p className="text-xs text-slate-500 mt-0.5">{activeTrips.length} trip · Klik untuk kelola passport</p>
          </div>
          <Link href="/trips" className="text-xs text-brand-600 hover:underline font-semibold">
            ← Master Trip
          </Link>
        </div>

        {activeTrips.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p className="text-3xl mb-2">✈</p>
            <p className="text-sm">Belum ada trip aktif.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeTrips.map((trip) => {
              const stats = getTripStats(trip.id);
              const days = daysUntil(trip.departure);
              const completionPct = stats.total > 0 ? Math.round((stats.withPassport / stats.total) * 100) : 0;
              const isUrgent = days != null && days >= 0 && days <= 30 && stats.withoutPassport > 0;

              return (
                <div key={trip.id} className="px-5 py-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {trip.kode_trip && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-brand-100 text-brand-700">
                            {trip.kode_trip}
                          </span>
                        )}
                        <p className="font-bold text-brand-700">{trip.name}</p>
                        {days != null && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            days < 0 ? 'bg-slate-100 text-slate-600' :
                            days <= 14 ? 'bg-red-100 text-red-800 animate-pulse' :
                            days <= 30 ? 'bg-amber-100 text-amber-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {days < 0 ? `${Math.abs(days)}h lewat` : `${days}h lagi`}
                          </span>
                        )}
                        {isUrgent && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-red-100 text-red-800 animate-pulse">
                            ⚠ {stats.withoutPassport} blm upload passport!
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-2">
                        📅 {fmtDate(trip.departure)} · 🪑 {trip.sold || 0}/{trip.quota || 0} peserta
                      </p>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex-1 max-w-md">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                            <span>Passport Completion</span>
                            <span className="font-bold">{stats.withPassport}/{stats.total} ({completionPct}%)</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                completionPct === 100 ? 'bg-green-500' :
                                completionPct >= 70 ? 'bg-blue-500' :
                                completionPct >= 30 ? 'bg-amber-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${completionPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/trips/${trip.id}/passport-manage`}
                      className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      🛂 Kelola Passport →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
