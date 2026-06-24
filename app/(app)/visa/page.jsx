// R215s: Visa list page + NEW UPLOAD NOTIFICATION badges
// Tampilan trip dgn dokumen baru di-upload peserta → highlight + counter
// Path: app/(app)/visa/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';
import { fmtDate, daysUntil } from '@/lib/utils/format';
import { VISA_STATUS_OPTS, STATUS_COLOR_CLASS } from '@/lib/utils/visa-constants';
import { getPicScope, filterTripsForPic } from '@/lib/auth/pic-scope';

export const dynamic = 'force-dynamic';

const STATUS_MAP = Object.fromEntries(VISA_STATUS_OPTS.map((s) => [s.value, s]));

async function safeQuery(promise, fallback = []) {
  try {
    const res = await promise;
    return res.data || fallback;
  } catch {
    return fallback;
  }
}

export default async function VisaListPage() {
  const supabase = createClient();

  // R215s — fetch visa_uploaded_docs + visa_uploads_last_viewed_at juga
  const [trips, passengers] = await Promise.all([
    safeQuery(supabase.from('trips').select('*').order('departure', { ascending: true, nullsFirst: false })),
    safeQuery(supabase.from('trip_passengers').select('id, trip_id, visa_docs, visa_uploaded_docs, visa_uploads_last_viewed_at, visa_status, visa_biometric_date')),
  ]);

  let activeTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  // KHASANAH: PIC hanya lihat trip visanya sendiri (teone tak terpengaruh)
  { const { data: { user } } = await supabase.auth.getUser(); const scope = await getPicScope(supabase, user); activeTrips = filterTripsForPic(activeTrips, scope); }

  const paxByTrip = {};
  for (const p of passengers) {
    if (!paxByTrip[p.trip_id]) paxByTrip[p.trip_id] = [];
    paxByTrip[p.trip_id].push(p);
  }

  const sampleTrip = trips[0];
  const hasMigration = sampleTrip && 'visa_doc_template' in sampleTrip;

  // R215s — Compute upload stats per trip
  function getUploadStats(pax) {
    let totalUploads = 0;
    let totalPaxWithUploads = 0;
    let newUploadsCount = 0;
    let newUploadsByPax = 0;
    let latestUploadAt = null;

    for (const p of pax) {
      const uploads = Array.isArray(p.visa_uploaded_docs) ? p.visa_uploaded_docs : [];
      if (uploads.length === 0) continue;
      totalUploads += uploads.length;
      totalPaxWithUploads++;

      const lastViewed = p.visa_uploads_last_viewed_at ? new Date(p.visa_uploads_last_viewed_at).getTime() : 0;
      let paxHasNew = false;
      for (const u of uploads) {
        const uploadTime = u.uploaded_at ? new Date(u.uploaded_at).getTime() : 0;
        if (uploadTime > lastViewed) {
          newUploadsCount++;
          paxHasNew = true;
        }
        if (uploadTime > (latestUploadAt || 0)) latestUploadAt = uploadTime;
      }
      if (paxHasNew) newUploadsByPax++;
    }

    return { totalUploads, totalPaxWithUploads, newUploadsCount, newUploadsByPax, latestUploadAt };
  }

  // R215s — Trip-level upload stats
  // ADDITIVE: jumlah Form Tambahan Visa yg sudah submit per trip (service client; tabel RLS tanpa policy)
  const formSubmittedByTrip = {};
  try {
    const _u = brandSupabaseUrl(); const _k = brandServiceRoleKey();
    if (_u && _k) {
      const _svc = createServiceClient(_u, _k, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: _fr } = await _svc.from('visa_form_responses').select('trip_id, status').eq('status', 'submitted');
      for (const r of (_fr || [])) formSubmittedByTrip[r.trip_id] = (formSubmittedByTrip[r.trip_id] || 0) + 1;
    }
  } catch (e) {}

  const tripStats = {};
  let globalNewUploads = 0;
  for (const t of activeTrips) {
    const pax = paxByTrip[t.id] || [];
    const stats = getUploadStats(pax);
    tripStats[t.id] = stats;
    globalNewUploads += stats.newUploadsCount;
  }

  // R215s — Sort: trips with new uploads first
  const sortedTrips = [...activeTrips].sort((a, b) => {
    const aNew = tripStats[a.id]?.newUploadsCount || 0;
    const bNew = tripStats[b.id]?.newUploadsCount || 0;
    if (aNew !== bNew) return bNew - aNew;
    return 0;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">Visa</h1>
          <p className="mt-1 text-slate-600">Checklist dokumen visa per peserta, biometrik, status pengajuan.</p>
        </div>
        {/* R215s — Global notification badge */}
        {globalNewUploads > 0 && (
          <div className="bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-card animate-pulse">
            <p className="text-xs font-bold uppercase">🔔 Notifikasi</p>
            <p className="text-sm">{globalNewUploads} dokumen baru di-upload peserta</p>
          </div>
        )}
      </div>

      {!hasMigration && trips.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-bold text-amber-800 mb-2">⚠ SQL Migration Belum Dijalankan</h3>
          <p className="text-sm text-amber-700 mb-2">Untuk activate fitur Visa, jalankan SQL berikut di Supabase SQL Editor:</p>
          <pre className="text-xs bg-amber-100 p-3 rounded overflow-x-auto text-amber-900">{`ALTER TABLE trips ADD COLUMN IF NOT EXISTS visa_country TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS visa_biometric_date DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS visa_status TEXT DEFAULT 'pending';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS visa_doc_template JSONB DEFAULT '[]'::jsonb;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS visa_notes TEXT;
ALTER TABLE trip_passengers ADD COLUMN IF NOT EXISTS visa_docs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE trip_passengers ADD COLUMN IF NOT EXISTS visa_personal_notes TEXT;
NOTIFY pgrst, 'reload schema';`}</pre>
          <p className="text-xs text-amber-700 mt-2">Setelah run, refresh halaman ini.</p>
        </div>
      )}

      {/* R215s — Recent uploads summary card */}
      {globalNewUploads > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-xl p-4">
          <p className="text-sm font-bold text-emerald-800 mb-2">📤 Dokumen Baru Di-upload Peserta</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            {Object.entries(tripStats)
              .filter(([, s]) => s.newUploadsCount > 0)
              .sort((a, b) => b[1].newUploadsCount - a[1].newUploadsCount)
              .slice(0, 6)
              .map(([tripId, stats]) => {
                const trip = activeTrips.find((t) => t.id === tripId);
                if (!trip) return null;
                return (
                  <Link
                    key={tripId}
                    href={`/visa/${tripId}`}
                    className="block p-3 bg-white rounded-lg border border-emerald-200 hover:border-emerald-400 transition"
                  >
                    <p className="font-bold text-emerald-700 text-sm">{trip.kode_trip || `#${trip.id}`}</p>
                    <p className="text-[11px] text-slate-600 truncate">{trip.name}</p>
                    <p className="mt-1 text-xs font-bold text-emerald-800">
                      ✨ {stats.newUploadsCount} doc baru dari {stats.newUploadsByPax} peserta
                    </p>
                  </Link>
                );
              })}
          </div>
          <p className="text-[10px] text-slate-500 mt-2 italic">
            ℹ Buka trip → scroll ke "Download Dokumen Visa" untuk lihat & download
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Trip Aktif ({sortedTrips.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Pilih trip untuk masuk checklist dokumen. Trip dgn upload baru di atas.</p>
        </div>
        {sortedTrips.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">🛂</p>
            <p className="text-lg font-bold text-slate-700">Belum ada trip aktif</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedTrips.map((t) => {
              const pax = paxByTrip[t.id] || [];
              const docTemplate = t.visa_doc_template || [];
              const totalDocsNeeded = docTemplate.length * pax.length;
              let totalDocsComplete = 0;
              for (const p of pax) {
                const docs = p.visa_docs || [];
                for (const docName of docTemplate) {
                  if (Array.isArray(docs) && docs.find((d) => d.name === docName && d.complete)) totalDocsComplete++;
                }
              }
              const progress = totalDocsNeeded > 0 ? Math.round((totalDocsComplete / totalDocsNeeded) * 100) : 0;
              const statusCfg = STATUS_MAP[t.visa_status || 'pending'];
              const days = daysUntil(t.departure);
              const stats = tripStats[t.id] || { totalUploads: 0, newUploadsCount: 0, newUploadsByPax: 0 };
              const bioScheduled = pax.filter((p) => p.visa_biometric_date).length;
              const vApproved = pax.filter((p) => p.visa_status === 'approved').length;
              const vRejected = pax.filter((p) => p.visa_status === 'rejected').length;
              const vProcess = pax.filter((p) => ['ready_to_submit', 'submitted', 'biometric', 'on_process'].includes(p.visa_status)).length;

              return (
                <Link key={t.id} href={`/visa/${t.id}`} className={`block px-5 py-3 hover:bg-slate-50 transition-colors ${stats.newUploadsCount > 0 ? 'bg-emerald-50/50' : ''}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
                        {statusCfg && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_COLOR_CLASS[statusCfg.color]}`}>{statusCfg.label}</span>}
                        {t.visa_country && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">🌍 {t.visa_country}</span>}
                        {t.visa_biometric_date && <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">📅 Biometrik: {fmtDate(t.visa_biometric_date)}</span>}
                        {days != null && days >= 0 && days <= 60 && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold animate-pulse">⏰ {days}h lagi</span>
                        )}
                        {/* R215s — NEW upload badge */}
                        {stats.newUploadsCount > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500 text-white font-bold animate-pulse">
                            🔔 {stats.newUploadsCount} doc BARU
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fmtDate(t.departure)} · {pax.length} peserta
                        {stats.totalUploads > 0 && (
                          <span className="ml-2 text-emerald-700 font-semibold">
                            · 📤 {stats.totalUploads} doc dari {stats.totalPaxWithUploads} peserta
                          </span>
                        )}
                      </p>
                      <p className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className={bioScheduled >= pax.length && pax.length > 0 ? 'text-indigo-700 font-semibold' : 'text-slate-500'}>📅 Bio terjadwal: {bioScheduled}/{pax.length}</span>
                        {(formSubmittedByTrip[t.id] || 0) > 0 && <span className="text-brand-700 font-semibold">📝 Form: {formSubmittedByTrip[t.id]}</span>}
                        {vApproved > 0 && <span className="text-green-700 font-semibold">✓ Approved: {vApproved}</span>}
                        {vProcess > 0 && <span className="text-purple-700 font-semibold">⏳ Proses: {vProcess}</span>}
                        {vRejected > 0 && <span className="text-red-700 font-semibold">✗ Reject: {vRejected}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-brand-700">{progress}%</p>
                      <p className="text-xs text-slate-500">{totalDocsComplete} / {totalDocsNeeded} docs</p>
                      <div className="mt-1 w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-400 to-green-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
