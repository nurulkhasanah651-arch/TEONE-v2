// Portal TL landing — Round 64: TL view tanpa revenue, cuma trip-info

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg, tripChecklist } from '@/lib/utils/trip-status';
import { getRoleFromUser } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

export default async function TLPortalPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const role = getRoleFromUser(user);
  const tlId = user?.user_metadata?.tl_id || null;
  const tlName = user?.user_metadata?.tl_name || '';
  const isTL = role === 'tour_leader';

  // STRICT GUARD untuk TL
  if (isTL && !tlId) {
    redirect('/auth/role-picker?error=tl_not_verified');
  }

  let trips = [];
  try {
    const { data } = await supabase
      .from('trips')
      .select('*')
      .order('departure', { ascending: true, nullsFirst: false });
    trips = data || [];
  } catch { trips = []; }

  let myTrips = [];
  if (isTL && tlId) {
    myTrips = trips.filter((t) => String(t.tl_id) === String(tlId));
    if (myTrips.length === 0 && tlName) {
      const lname = tlName.toLowerCase();
      myTrips = trips.filter((t) => (t.tl_name || '').toLowerCase().includes(lname));
    }
  } else if (role === 'owner' || role === 'manager' || role === 'ops') {
    myTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.tl_name);
  } else {
    redirect('/dashboard');
  }

  const activeTrips = myTrips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const totalPax = myTrips.reduce((s, t) => s + (t.sold || 0), 0);

  // Upcoming trips (next 30 days) — TL-only filter
  const upcoming = myTrips.filter((t) => {
    if (!t.departure || t.status === 'completed' || t.status === 'cancelled') return false;
    const d = daysUntil(t.departure);
    return d != null && d >= 0 && d <= 30;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Portal Tour Leader</h1>
        {isTL && tlName ? (
          <p className="mt-1 text-slate-600">
            Welcome, <strong>{tlName}</strong>. Trip yang di-assign ke kamu.
          </p>
        ) : (
          <p className="mt-1 text-slate-600">Trip yang ditugaskan ke TL.</p>
        )}
      </div>

      {/* TL Stats — tanpa revenue */}
      {isTL && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-pink-500 to-pink-700 text-white rounded-xl shadow-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">Total Trip Saya</p>
            <p className="mt-1 text-3xl font-bold">{myTrips.length}</p>
            <p className="text-[10px] opacity-70">{activeTrips.length} aktif</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Peserta</p>
            <p className="mt-1 text-3xl font-bold text-brand-700">{totalPax}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Gabungan semua trip</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Trip 30 Hari ke Depan</p>
            <p className="mt-1 text-3xl font-bold text-amber-700">{upcoming.length}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Persiapan keberangkatan</p>
          </div>
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-brand-50">
          <h2 className="font-bold text-brand-700">Trip Kamu ({activeTrips.length} aktif · {myTrips.length} total)</h2>
        </div>
        {myTrips.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-3xl mb-2">👤</p>
            {isTL ? (
              <>
                <p className="text-sm text-slate-500">Belum ada trip yang di-assign ke kamu.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Hubungi Ops untuk assign trip — pastikan TL ID kamu (#{tlId}) di-set di trip master file.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Belum ada trip aktif dengan TL assigned.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {myTrips.map((t) => <TripRow key={t.id} trip={t} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function TripRow({ trip: t }) {
  const s = statusCfg(t.status) || {};
  const days = daysUntil(t.departure);
  let checklist = [];
  try { const c = tripChecklist(t); checklist = Array.isArray(c) ? c : []; } catch {}
  const okCount = checklist.filter((c) => c?.ok).length;

  return (
    <Link href={`/tl/${t.id}`} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg || 'bg-slate-100'} ${s.text || 'text-slate-700'}`}>{s.label || t.status || '—'}</span>
            {days != null && days >= 0 && days <= 14 && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold animate-pulse">⏰ {days}h lagi</span>
            )}
          </div>
          <p className="mt-1 text-sm font-bold text-slate-800">{t.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(t.departure)}
            {t.arrival && ` → ${fmtDate(t.arrival)}`}
            {' · '}{t.sold || 0} peserta
          </p>
          {checklist.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {checklist.map((c, i) => (
                <span key={c?.label || i} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${c?.ok ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {c?.ok ? '✓' : '○'} {c?.label || '—'}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-brand-700">{okCount}/{checklist.length}</p>
          <p className="text-[10px] text-slate-400">checklist</p>
          <span className="text-xs text-brand-600 font-semibold mt-1 inline-block">Buka →</span>
        </div>
      </div>
    </Link>
  );
}
