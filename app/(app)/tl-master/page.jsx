// Round 175: Master Tour Leader — sync dengan HR employees (1 source of truth)
// Path: app/(app)/tl-master/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtRupiah(v) { return 'Rp ' + Number(v || 0).toLocaleString('id-ID'); }

const SUBTYPE_BADGE = {
  inhouse:   { label: 'IN-HOUSE',  color: 'bg-blue-100 text-blue-700' },
  freelance: { label: 'FREELANCE', color: 'bg-amber-100 text-amber-700' },
};

export default async function TLMasterPage(props) {
  const sp = await Promise.resolve(props.searchParams);
  const filterStatus = sp?.status || 'active';
  const filterSubtype = sp?.subtype || '';

  const supabase = getServiceClient() || createClient();

  // Query dari employees, filter tour_leader
  let query = supabase
    .from('employees')
    .select('*')
    .eq('employment_type', 'tour_leader')
    .order('full_name');

  if (filterStatus !== 'all') query = query.eq('status', filterStatus);
  if (filterSubtype) query = query.eq('tl_subtype', filterSubtype);

  const { data: tls, error } = await query;
  const list = tls || [];

  // Get total count untuk semua TL
  const { count: totalAll } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('employment_type', 'tour_leader');

  // Count trip handled per TL (untuk display di kolom)
  const tlIds = list.map((t) => t.id);
  let tripCountByTL = {};
  if (tlIds.length > 0) {
    const { data: trips } = await supabase
      .from('trips')
      .select('tl_id, status')
      .in('tl_id', tlIds);
    for (const t of (trips || [])) {
      const id = t.tl_id;
      if (!tripCountByTL[id]) tripCountByTL[id] = { total: 0, active: 0 };
      tripCountByTL[id].total++;
      if (['open', 'departed'].includes(t.status)) tripCountByTL[id].active++;
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">👥 Master Tour Leader</h1>
          <p className="mt-1 text-slate-600">
            {list.length} TL ({filterStatus === 'all' ? 'semua status' : filterStatus})
            {totalAll != null && list.length !== totalAll && (
              <span className="ml-2 text-xs text-slate-500">· Total di DB: {totalAll}</span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            💡 TL ter-sync dengan <Link href="/hr/employees" className="text-brand-600 hover:underline">HR Karyawan</Link>.
            Tambah/edit TL akan mempengaruhi data di HR juga.
          </p>
        </div>
        <Link href="/hr/employees/new" className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card">
          + Tambah TL Baru
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
          ⚠ Error: {error.message}
          <p className="text-xs mt-1">Pastikan SQL R175 migration udah di-run.</p>
        </div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 uppercase">Filter:</span>
        <FilterLink current={filterStatus} value="active" param="status" label="Active" subtype={filterSubtype} />
        <FilterLink current={filterStatus} value="inactive" param="status" label="Inactive" subtype={filterSubtype} />
        <FilterLink current={filterStatus} value="all" param="status" label="Semua Status" subtype={filterSubtype} />
        <span className="text-slate-300">|</span>
        <FilterLink current={filterSubtype} value="" param="subtype" label="Semua Tipe" status={filterStatus} />
        <FilterLink current={filterSubtype} value="inhouse" param="subtype" label="In-house" status={filterStatus} />
        <FilterLink current={filterSubtype} value="freelance" param="subtype" label="Freelance" status={filterStatus} />
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total TL" value={totalAll || 0} color="text-brand-700" bg="bg-brand-50" />
        <StatCard
          label="In-house"
          value={list.filter((t) => t.tl_subtype === 'inhouse').length}
          color="text-blue-700" bg="bg-blue-50"
        />
        <StatCard
          label="Freelance"
          value={list.filter((t) => t.tl_subtype === 'freelance').length}
          color="text-amber-700" bg="bg-amber-50"
        />
        <StatCard
          label="Active Trip"
          value={Object.values(tripCountByTL).reduce((s, c) => s + c.active, 0)}
          color="text-green-700" bg="bg-green-50"
        />
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">👤</p>
          <p className="text-lg font-bold text-slate-700">
            {totalAll > 0 ? 'Tidak ada TL match filter' : 'Belum ada Tour Leader'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {totalAll > 0
              ? 'Coba ubah filter status atau tipe.'
              : 'Klik "+ Tambah TL Baru" untuk mulai. Pilih employment_type = "tour_leader" di form.'}
          </p>
          {totalAll === 0 && (
            <Link href="/hr/employees/new" className="mt-4 inline-block px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
              + Tambah Sekarang
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-bold text-slate-600 uppercase">
                  <th className="px-4 py-2.5">Nama</th>
                  <th className="px-3 py-2.5">Tipe</th>
                  <th className="px-3 py-2.5">Contact</th>
                  <th className="px-3 py-2.5 text-right">Fee/Trip</th>
                  <th className="px-3 py-2.5 text-center">Trip</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((t) => {
                  const subtype = SUBTYPE_BADGE[t.tl_subtype] || { label: '—', color: 'bg-slate-100 text-slate-600' };
                  const tripCount = tripCountByTL[t.id] || { total: 0, active: 0 };
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {t.avatar_url ? (
                            <img src={t.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center text-xs font-bold">
                              {(t.full_name || '?').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-brand-700">{t.full_name}</p>
                            {t.nickname && <p className="text-[10px] text-slate-500">({t.nickname})</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${subtype.color}`}>{subtype.label}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs text-slate-700">{t.phone || t.whatsapp || '-'}</p>
                        {t.email && <p className="text-[10px] text-slate-500">{t.email}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono">
                        {t.per_trip_fee > 0 ? fmtRupiah(t.per_trip_fee) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <p className="text-xs font-bold">{tripCount.total}</p>
                        {tripCount.active > 0 && <p className="text-[10px] text-green-600">{tripCount.active} active</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {t.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={`/hr/employees/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-bold mb-1">💡 Setelah R175 — Master TL & HR Karyawan ter-sync:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Tambah TL via tombol "+ Tambah TL Baru" → otomatis masuk HR juga</li>
          <li>Edit TL otomatis update di HR (klik tombol "Edit" di list)</li>
          <li>Set <code>fee per trip</code>, BPJS, dan rekening bank di form HR</li>
          <li>Pas generate payroll, TL otomatis di-list dengan trip-trip yg dia handle</li>
        </ul>
      </div>
    </div>
  );
}

function FilterLink({ current, value, param, label, status, subtype }) {
  const isActive = current === value;
  const params = new URLSearchParams();
  if (param === 'status') {
    params.set('status', value);
    if (subtype) params.set('subtype', subtype);
  } else {
    if (status) params.set('status', status);
    if (value) params.set('subtype', value);
  }
  return (
    <Link
      href={`/tl-master?${params.toString()}`}
      className={`text-xs font-semibold px-3 py-1 rounded ${isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </Link>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
