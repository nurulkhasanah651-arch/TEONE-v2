// TL Portal — Round 129: Dual view (TL vs Internal Management)
// Path: app/(app)/tl/page.jsx

import Link from 'next/link';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fmtDate, daysUntil, fmtRupiah } from '@/lib/utils/format';
import { statusCfg, tripChecklist } from '@/lib/utils/trip-status';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function TLPortalPage() {
  const supabase = createClient();
  const serviceClient = getServiceClient() || supabase;
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role || user?.app_metadata?.role || 'pending';
  const isInternal = ['manager', 'owner', 'ops', 'cs'].includes(role);

  // Fetch all active trips
  let activeTrips = [];
  try {
    const { data } = await supabase
      .from('trips')
      .select('*')
      .order('departure', { ascending: true, nullsFirst: false });
    activeTrips = (data || []).filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  } catch {
    activeTrips = [];
  }

  // ROUND 129: Fetch petty cash + reimbursements summary for ALL trips (internal view)
  let pettyCashByTrip = {};
  let reimbursementsByTrip = {};
  let pendingReimbursementCount = 0;
  if (isInternal && activeTrips.length > 0) {
    const tripIds = activeTrips.map((t) => t.id);
    try {
      const { data: petty } = await serviceClient
        .from('trip_petty_cash').select('*').in('trip_id', tripIds);
      for (const p of (petty || [])) {
        pettyCashByTrip[p.trip_id] = p;
      }
    } catch {}
    try {
      const { data: reimburs } = await serviceClient
        .from('reimbursement_requests').select('*').in('trip_id', tripIds);
      for (const r of (reimburs || [])) {
        if (!reimbursementsByTrip[r.trip_id]) {
          reimbursementsByTrip[r.trip_id] = { pending: 0, approved: 0, paid: 0, totalAmount: 0 };
        }
        if (r.status === 'pending') {
          reimbursementsByTrip[r.trip_id].pending++;
          pendingReimbursementCount++;
        } else if (r.status === 'approved') {
          reimbursementsByTrip[r.trip_id].approved++;
        } else if (r.status === 'paid') {
          reimbursementsByTrip[r.trip_id].paid++;
        }
        reimbursementsByTrip[r.trip_id].totalAmount += Number(r.amount || 0);
      }
    } catch {}
  }

  const userName = user?.user_metadata?.full_name?.toLowerCase() || user?.email?.split('@')[0]?.toLowerCase() || '';
  const myTrips = activeTrips.filter((t) => t.tl_name && (t.tl_name || '').toLowerCase().includes(userName));
  const tripsWithTL = activeTrips.filter((t) => t.tl_name && t.tl_name.trim());

  // ═══ INTERNAL MANAGEMENT VIEW (Manager / Ops / Owner / CS) ═══
  if (isInternal) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-brand-700">🧑‍💼 TL Portal — Manajemen</h1>
            <p className="mt-1 text-slate-600">Kelola petty cash, dokumen trip, approval reimbursement untuk semua trip.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {pendingReimbursementCount > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
                ⏳ {pendingReimbursementCount} reimbursement pending
              </span>
            )}
            <span className="px-3 py-1.5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold uppercase tracking-wider">
              {role}
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Trip Aktif" value={activeTrips.length} color="text-brand-700" bg="bg-brand-50" />
          <StatCard label="Trip dengan TL" value={tripsWithTL.length} color="text-purple-700" bg="bg-purple-50" />
          <StatCard label="Reimbursement Pending" value={pendingReimbursementCount} color="text-amber-700" bg="bg-amber-50" />
          <StatCard label="Total Petty Cash Allocated" value={fmtRupiah(Object.values(pettyCashByTrip).reduce((s, p) => s + Number(p.allocated_amount || 0), 0))} color="text-green-700" bg="bg-green-50" small />
        </div>

        {/* Trips List */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h2 className="font-bold text-brand-700">List Trip Aktif ({activeTrips.length})</h2>
            <p className="text-xs text-slate-500 mt-0.5">Klik trip untuk manage petty cash, upload dokumen, approve reimbursement.</p>
          </div>
          {activeTrips.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Belum ada trip aktif.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Trip</th>
                    <th className="px-3 py-2.5">TL</th>
                    <th className="px-3 py-2.5">Berangkat</th>
                    <th className="px-3 py-2.5 text-right">Petty Cash</th>
                    <th className="px-3 py-2.5 text-center">Reimburs</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTrips.map((t) => {
                    const s = statusCfg(t.status);
                    const days = daysUntil(t.departure);
                    const petty = pettyCashByTrip[t.id];
                    const reimb = reimbursementsByTrip[t.id] || { pending: 0, approved: 0, paid: 0 };
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
                              {t.kode_trip || `#${t.id}`}
                            </span>
                            <p className="font-bold text-slate-800 text-sm">{t.name}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{t.destination || '—'}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-sm font-semibold text-slate-700">{t.tl_name || <span className="text-amber-600">— belum assign</span>}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-xs">{fmtDate(t.departure)}</p>
                          {days != null && days >= 0 && (
                            <p className={`text-[10px] font-bold ${days <= 14 ? 'text-red-700' : 'text-amber-700'}`}>
                              {days}h lagi
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {petty ? (
                            <>
                              <p className="text-xs font-bold text-green-700">{fmtRupiah(petty.allocated_amount)}</p>
                              <p className="text-[10px] text-slate-500">spent {fmtRupiah(petty.spent_amount)}</p>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 italic">belum set</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {reimb.pending > 0 && (
                            <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold mr-1 animate-pulse">
                              {reimb.pending} pending
                            </span>
                          )}
                          {reimb.approved > 0 && (
                            <span className="inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold mr-1">
                              {reimb.approved} approved
                            </span>
                          )}
                          {reimb.paid > 0 && (
                            <span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-800 text-[10px] font-bold">
                              {reimb.paid} paid
                            </span>
                          )}
                          {!reimb.pending && !reimb.approved && !reimb.paid && (
                            <span className="text-xs text-slate-400 italic">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link href={`/tl/${t.id}`} className="text-xs font-bold text-brand-600 hover:underline">
                            Kelola →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  // ═══ TL VIEW (Tour Leader role) ═══
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Portal Tour Leader</h1>
        <p className="mt-1 text-slate-600">Trip yang ditugaskan ke kamu — info trip, checklist, peserta.</p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-brand-50">
          <h2 className="font-bold text-brand-700">Trip Kamu ({myTrips.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Auto-detect dari nama TL di trip yang match dengan akun kamu.</p>
        </div>
        {myTrips.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-3xl mb-2">👤</p>
            <p className="text-sm text-slate-500">Belum ada trip yang di-assign ke kamu.</p>
            <p className="text-xs text-slate-400 mt-1">Ops akan assign trip + nama TL match dengan nama akun kamu.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {myTrips.map((t) => <TripRow key={t.id} trip={t} isMine />)}
          </div>
        )}
      </section>
    </div>
  );
}

function TripRow({ trip: t, isMine }) {
  const s = statusCfg(t.status);
  const days = daysUntil(t.departure);
  const checklist = tripChecklist(t);
  const okCount = checklist.filter((c) => c.ok).length;

  return (
    <Link
      href={`/tl/${t.id}`}
      className="block px-5 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
              {t.kode_trip || `#${t.id}`}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
              {s.label}
            </span>
            {days != null && days >= 0 && (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${days <= 14 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
                ⏰ {days}h lagi
              </span>
            )}
            {isMine && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">
                ✓ MY TRIP
              </span>
            )}
          </div>
          <p className="font-bold text-slate-800">{t.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {t.destination && `${t.destination} · `}{fmtDate(t.departure)} · TL: {t.tl_name || '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-brand-600">{okCount}/{checklist.length}</p>
          <p className="text-[10px] text-slate-500">checklist</p>
        </div>
      </div>
    </Link>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
