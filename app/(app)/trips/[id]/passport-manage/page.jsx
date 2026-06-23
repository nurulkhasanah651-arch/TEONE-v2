// R215z: passport-manage per trip + Drive Sync Panel
// Path: app/(app)/trips/[id]/passport-manage/page.jsx
// FULL REPLACE — semua existing PRESERVED, tambahan minimal:
//   1. import PassportDriveSyncPanel
//   2. trip select query include passport_drive_* columns
//   3. <PassportDriveSyncPanel trip={trip} /> di antara action bar & passenger list

import Link from 'next/link';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import PassportDriveSyncPanel from '@/components/passport/PassportDriveSyncPanel';
import PassportUploadManager from '@/components/passport/PassportUploadManager';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
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

function passportStatus(expiry) {
  if (!expiry) return null;
  try {
    const exp = new Date(expiry);
    const today = new Date();
    const days = Math.ceil((exp - today) / 86400000);
    if (days < 0) return { label: 'EXPIRED', color: 'red' };
    if (days < 90) return { label: `${days}h lagi`, color: 'red' };
    if (days < 180) return { label: `${days}h lagi`, color: 'amber' };
    return { label: 'Valid', color: 'green' };
  } catch { return null; }
}

export const dynamic = 'force-dynamic';

export default async function PassportManagePage({ params }) {
  const { id: tripId } = await params;

  // Pakai service client utk bypass RLS
  const supabase = getServiceClient() || createClient();

  // R215z: tambahin passport_drive_* columns ke select
  const { data: trip } = await supabase
    .from('trips')
    .select('id, kode_trip, name, departure, passport_drive_parent_folder_id, passport_drive_trip_folder_id, passport_drive_trip_folder_url, passport_drive_last_sync_at')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip) {
    redirect('/trips');
  }

  // QUERY 1: ambil trip_passengers (tanpa nested customers)
  const { data: passengers } = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('trip_id', tripId);

  const list = passengers || [];

  // QUERY 2: ambil customers separately
  const customerIds = list.map((p) => p.customer_id).filter(Boolean);
  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .in('id', customerIds);
    customerMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));
  }

  // Merge customer data ke setiap passenger
  const enrichedList = list.map((p) => ({
    ...p,
    customers: customerMap[p.customer_id] || {},
  }));

  // ADDITIVE: data ringkas utk panel Upload Paspor via WA (tidak mengubah daftar di bawah)
  const uploadList = enrichedList.map((p) => ({
    id: p.id,
    name: p.customers?.name || `Peserta #${p.id}`,
    familyId: p.family_group_id || null,
    isHead: !!p.is_family_head,
    uploaded: !!p.passport_upload_path,
    uploadedAt: p.passport_uploaded_at || null,
    autofilled: !!p.passport_autofilled,
  }));

  // Stats
  const withPassport = enrichedList.filter((p) => p?.customers?.passport_no || p?.customers?.passport_photo_url).length;
  const withoutPassport = enrichedList.length - withPassport;
  const expiringSoon = enrichedList.filter((p) => {
    const exp = p?.customers?.passport_expiry;
    if (!exp) return false;
    try {
      const d = new Date(exp);
      const today = new Date();
      const days = Math.ceil((d - today) / 86400000);
      return days < 180 && days >= 0;
    } catch { return false; }
  }).length;
  const expired = enrichedList.filter((p) => {
    const exp = p?.customers?.passport_expiry;
    if (!exp) return false;
    try { return new Date(exp) < new Date(); } catch { return false; }
  }).length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <Link href={`/trips/${tripId}`} className="text-sm text-brand-600 font-medium hover:underline">
          ← Kembali ke Trip Detail
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-700 flex items-center gap-2">
          🛂 Passport Management
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {trip.kode_trip ? `${trip.kode_trip} — ` : ''}{trip.name}
          {trip.departure && ` · ${fmtDate(trip.departure)}`}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Peserta" value={enrichedList.length} icon="👥" color="brand" />
        <StatCard label="Sudah Ada Passport" value={withPassport} icon="✅" color="green" />
        <StatCard label="Belum Upload" value={withoutPassport} icon="⏳" color="amber" />
        <StatCard label="Expired/Hampir" value={expired + expiringSoon} icon="⚠" color="red" />
      </div>

      {/* Action bar */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href={`/trips/${tripId}/passport-ai`}
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold rounded-lg inline-flex items-center gap-2"
        >
          ➕ Tambah Peserta Baru via Passport AI
        </Link>
        <Link
          href={`/trips/${tripId}`}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg inline-flex items-center"
        >
          ← Master Trip
        </Link>
        <Link
          href="/passport-manage"
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg inline-flex items-center"
        >
          📋 Semua Trip
        </Link>
      </div>

      {/* R215z — Passport Drive Sync Panel (per trip, folder per peserta) */}
      <PassportDriveSyncPanel trip={trip} />

      {/* ADDITIVE: Upload Paspor via WA */}
      <PassportUploadManager tripId={tripId} passengers={uploadList} />

      {/* Passenger list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-brand-700">📋 Daftar Peserta — Kelola Passport</h2>
          <p className="text-xs text-slate-500 mt-0.5">Klik 🛂 Update Passport untuk upload + AI extract data passport</p>
        </div>

        {enrichedList.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">Belum ada peserta di trip ini.</p>
            <Link
              href={`/trips/${tripId}/passport-ai`}
              className="inline-block mt-3 text-sm text-purple-600 hover:underline font-semibold"
            >
              Tambah peserta pertama via passport AI →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {enrichedList.map((p, idx) => {
              const c = p?.customers || {};
              const fullName = `${c.first_name || ''} ${c.surname || ''}`.trim() || c.name || `Peserta #${idx + 1}`;
              const ppStatus = passportStatus(c.passport_expiry);
              const hasPassport = !!(c.passport_no || c.passport_photo_url);

              return (
                <div key={p.id} className="px-5 py-3 hover:bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                      <p className="font-bold text-brand-700">{fullName}</p>
                      {p.room_type && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{p.room_type}</span>}
                      {hasPassport ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-800 font-bold">✅ Ada passport</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">⏳ Belum upload</span>
                      )}
                      {ppStatus && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          ppStatus.color === 'red' ? 'bg-red-100 text-red-800' :
                          ppStatus.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {ppStatus.label}
                        </span>
                      )}
                    </div>
                    {hasPassport && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                        {c.passport_no && <span>📕 {c.passport_no}</span>}
                        {c.passport_expiry && <span>Exp: {fmtDate(c.passport_expiry)}</span>}
                        {c.nationality && <span>🌍 {c.nationality}</span>}
                        {c.passport_photo_url && (
                          <a href={c.passport_photo_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-semibold">
                            📎 Lihat foto
                          </a>
                        )}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/trips/${tripId}/passport-edit/${p.id}`}
                    className={`px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                      hasPassport
                        ? 'bg-blue-100 hover:bg-blue-200 text-blue-800'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    🛂 {hasPassport ? 'Update Passport' : 'Upload Passport AI'}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const bg = {
    brand: 'bg-brand-50 border-brand-200 text-brand-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  }[color] || 'bg-slate-50 border-slate-200 text-slate-700';

  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
