// R215s: Visa list page + NEW UPLOAD NOTIFICATION badges
// Tampilan trip dgn dokumen baru di-upload peserta → highlight + counter
// Path: app/(app)/visa/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';
import { fmtDate, daysUntil } from '@/lib/utils/format';
import { VISA_STATUS_OPTS, STATUS_COLOR_CLASS, deriveVisaStage } from '@/lib/utils/visa-constants';
import { getPicScope, filterTripsForPic } from '@/lib/auth/pic-scope';
import VisaTripFilter from '@/components/visa/VisaTripFilter';

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

  // Data trip & peserta diambil via service-role (bypass RLS) supaya SEMUA staf yang
  // berhak (owner/manager/pic/ops) lihat status visa yang sama. Sebelumnya pakai koneksi
  // ber-RLS → hanya owner yang dapat data, manager/pic dapat kosong (semua 0).
  // Scope PIC tetap diterapkan di bawah lewat filterTripsForPic.
  const _svcUrl = brandSupabaseUrl(); const _svcKey = brandServiceRoleKey();
  const db = (_svcUrl && _svcKey)
    ? createServiceClient(_svcUrl, _svcKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : supabase;

  // R215s — fetch visa_uploaded_docs + visa_uploads_last_viewed_at juga
  const trips = await safeQuery(db.from('trips').select('*').order('departure', { ascending: true, nullsFirst: false }));
  // trip_passengers bisa > 1000 baris → paginate biar tidak kena cap PostgREST (max-rows 1000).
  let passengers = [];
  try {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('trip_passengers')
        .select('id, trip_id, visa_docs, visa_uploaded_docs, visa_uploads_last_viewed_at, visa_status, visa_biometric_date, include_visa, visa_ready, visa_result')
        .order('id', { ascending: true })
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      passengers = passengers.concat(data);
      if (data.length < 1000) break;
    }
  } catch { passengers = []; }

  let activeTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  // KHASANAH: PIC hanya lihat trip visanya sendiri (teone tak terpengaruh)
  { const { data: { user } } = await supabase.auth.getUser(); const scope = await getPicScope(supabase, user); activeTrips = filterTripsForPic(activeTrips, scope); }

  const paxByTrip = {};
  for (const p of passengers) {
    if (!paxByTrip[p.trip_id]) paxByTrip[p.trip_id] = [];
    paxByTrip[p.trip_id].push(p);
  }

  // Sudah bayar VISA (dari Finance) → dipakai status "Siap Biometrik / perlu dijadwalkan"
  try {
    const _u = brandSupabaseUrl(); const _k = brandServiceRoleKey();
    if (_u && _k && passengers.length) {
      const _svc = createServiceClient(_u, _k, { auth: { persistSession: false, autoRefreshToken: false } });
      const _ids = passengers.map((p) => p.id);
      const paid = {};
      for (let i = 0; i < _ids.length; i += 1000) {
        const { data: pays } = await _svc.from('participant_payments')
          .select('passenger_id, amount, is_transferred').eq('type', 'Visa').in('passenger_id', _ids.slice(i, i + 1000));
        for (const r of (pays || [])) { if (r.is_transferred !== true && Number(r.amount) > 0) paid[r.passenger_id] = true; }
      }
      for (const p of passengers) p.visaPaid = paid[p.id] === true;
    }
  } catch (e) {}

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

  // ═══ RINGKASAN STATUS VISA OTOMATIS (per peserta, seluruh trip aktif) ═══
  // Pakai deriveVisaStage (sama dgn badge per peserta) supaya angka ringkasan & detail konsisten.
  const _tmplById = Object.fromEntries((trips || []).map((t) => [t.id, t.visa_doc_template || []]));
  const allActivePax = activeTrips.flatMap((t) => paxByTrip[t.id] || []);
  const st = { belum_mulai: 0, lengkapi_dokumen: 0, siap_biometrik: 0, biometrik_terjadwal: 0, proses: 0, approved: 0, rejected: 0, punya_visa: 0, tidak_perlu: 0 };
  for (const p of allActivePax) {
    const stage = deriveVisaStage(p, _tmplById[p.trip_id]);
    st[stage.key] = (st[stage.key] || 0) + 1;
  }
  const VISA_CARDS = [
    { label: 'Belum Diurus', value: st.belum_mulai, cls: 'bg-rose-50 border-rose-200 text-rose-700', hint: 'Belum ada payment, belum ada dokumen, belum diupdate apa-apa' },
    { label: 'Lengkapi Dokumen', value: st.lengkapi_dokumen, cls: 'bg-amber-50 border-amber-200 text-amber-800', hint: 'Sudah mulai tapi dokumen belum lengkap' },
    { label: 'Siap Biometrik', value: st.siap_biometrik, cls: 'bg-indigo-50 border-indigo-200 text-indigo-800', hint: 'Dokumen lengkap / sudah bayar — perlu dijadwalkan biometrik' },
    { label: 'Biometrik Terjadwal', value: st.biometrik_terjadwal, cls: 'bg-blue-50 border-blue-200 text-blue-800', hint: 'Sudah ada tanggal biometrik (akan datang)' },
    { label: 'Proses / Sudah Biometrik', value: st.proses, cls: 'bg-purple-50 border-purple-200 text-purple-800', hint: 'Biometrik selesai, menunggu hasil visa' },
    { label: 'Approved', value: st.approved, cls: 'bg-green-50 border-green-200 text-green-800', hint: 'Visa disetujui' },
    { label: 'Ditolak', value: st.rejected, cls: 'bg-red-50 border-red-200 text-red-700', hint: 'Visa ditolak' },
    { label: 'Sudah Punya Visa', value: st.punya_visa, cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', hint: 'Peserta sudah punya visa sendiri' },
  ];

  // Data per trip utk daftar (bisa di-search by trip / bulan di client)
  const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const tripCards = sortedTrips.map((t) => {
    const pax = paxByTrip[t.id] || [];
    const docTemplate = t.visa_doc_template || [];
    const docsNeeded = docTemplate.length * pax.length;
    let docsComplete = 0;
    for (const p of pax) { const docs = p.visa_docs || []; for (const dn of docTemplate) { if (Array.isArray(docs) && docs.find((d) => d.name === dn && d.complete)) docsComplete++; } }
    const progress = docsNeeded > 0 ? Math.round((docsComplete / docsNeeded) * 100) : 0;
    const sc = { belum_mulai: 0, lengkapi_dokumen: 0, siap_biometrik: 0, biometrik_terjadwal: 0, proses: 0, approved: 0, rejected: 0, punya_visa: 0, tidak_perlu: 0 };
    for (const p of pax) { const s = deriveVisaStage(p, docTemplate); sc[s.key] = (sc[s.key] || 0) + 1; }
    const chips = [
      sc.belum_mulai > 0 && { t: `🔴 ${sc.belum_mulai} belum diurus`, c: 'text-rose-700 font-semibold' },
      sc.lengkapi_dokumen > 0 && { t: `📄 ${sc.lengkapi_dokumen} lengkapi dok`, c: 'text-amber-700' },
      sc.siap_biometrik > 0 && { t: `🧬 ${sc.siap_biometrik} siap biometrik`, c: 'text-indigo-700 font-semibold' },
      sc.biometrik_terjadwal > 0 && { t: `📅 ${sc.biometrik_terjadwal} terjadwal`, c: 'text-blue-700' },
      sc.proses > 0 && { t: `⏳ ${sc.proses} proses`, c: 'text-purple-700 font-semibold' },
      sc.approved > 0 && { t: `✅ ${sc.approved} approved`, c: 'text-green-700 font-semibold' },
      sc.rejected > 0 && { t: `✗ ${sc.rejected} ditolak`, c: 'text-red-700 font-semibold' },
      sc.punya_visa > 0 && { t: `🛂 ${sc.punya_visa} punya visa`, c: 'text-emerald-700' },
    ].filter(Boolean);
    const stats = tripStats[t.id] || { totalUploads: 0, newUploadsCount: 0, totalPaxWithUploads: 0 };
    let monthKey = '', monthLabel = '';
    if (t.departure) { const d = new Date(t.departure); monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; monthLabel = `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`; }
    const days = daysUntil(t.departure);
    return {
      id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '',
      departureFmt: t.departure ? fmtDate(t.departure) : '—', monthKey, monthLabel,
      paxCount: pax.length, progress, docsComplete, docsNeeded,
      visaCountry: t.visa_country || null,
      tripBiometricFmt: t.visa_biometric_date ? fmtDate(t.visa_biometric_date) : null,
      daysLeft: (days != null && days >= 0 && days <= 60) ? days : null,
      newUploadsCount: stats.newUploadsCount || 0, totalUploads: stats.totalUploads || 0, totalPaxWithUploads: stats.totalPaxWithUploads || 0,
      formSubmitted: formSubmittedByTrip[t.id] || 0,
      chips, searchText: `${t.kode_trip || ''} ${t.name || ''}`.toLowerCase(),
    };
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

      {/* RINGKASAN STATUS VISA — seluruh trip aktif */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {VISA_CARDS.map((c) => (
          <div key={c.label} title={c.hint} className={`rounded-xl border p-3 ${c.cls}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide leading-tight">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
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

      <VisaTripFilter trips={tripCards} />
    </div>
  );
}
