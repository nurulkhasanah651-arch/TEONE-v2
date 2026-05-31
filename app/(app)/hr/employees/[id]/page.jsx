// Round 173 FIX: Employees list — pakai service client (bypass RLS)
// Path: app/(app)/hr/employees/page.jsx

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

const EMPLOYMENT_TYPE_BADGE = {
  fulltime:     { label: 'Full-time', color: 'bg-blue-100 text-blue-700' },
  parttime:     { label: 'Part-time', color: 'bg-purple-100 text-purple-700' },
  freelance:    { label: 'Freelance', color: 'bg-amber-100 text-amber-700' },
  tour_leader:  { label: 'Tour Leader', color: 'bg-pink-100 text-pink-700' },
  contract:     { label: 'Contract', color: 'bg-slate-100 text-slate-700' },
};

function fmtRupiah(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

export default async function EmployeesListPage(props) {
  const sp = await Promise.resolve(props.searchParams);
  const filterStatus = sp?.status || 'active';
  const filterType = sp?.type || '';

  // Pakai service client (bypass RLS)
  const supabase = getServiceClient() || createClient();

  let query = supabase.from('employees').select('*').order('full_name');
  if (filterStatus !== 'all') query = query.eq('status', filterStatus);
  if (filterType) query = query.eq('employment_type', filterType);

  const { data: employees, error } = await query;
  const list = employees || [];

  // Get TOTAL count regardless of filter (debug info)
  const { count: totalAll } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/hr" className="text-sm text-brand-600 font-medium hover:underline">← HR</Link>
          <h1 className="mt-1 text-3xl font-bold text-brand-700">👤 Karyawan</h1>
          <p className="mt-1 text-slate-600">
            {list.length} karyawan ({filterStatus === 'all' ? 'semua' : filterStatus})
            {totalAll != null && list.length !== totalAll && (
              <span className="ml-2 text-xs text-slate-500">· Total di DB: {totalAll}</span>
            )}
          </p>
        </div>
        <Link href="/hr/employees/new" className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card">
          + Tambah Karyawan
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
          ⚠ Error fetch: {error.message}
        </div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 uppercase">Filter:</span>
        <FilterLink current={filterStatus} value="active" param="status" label="Active" />
        <FilterLink current={filterStatus} value="inactive" param="status" label="Inactive" />
        <FilterLink current={filterStatus} value="all" param="status" label="Semua Status" />
        <span className="text-slate-300">|</span>
        <FilterLink current={filterType} value="" param="type" label="Semua Type" />
        <FilterLink current={filterType} value="fulltime" param="type" label="Full-time" />
        <FilterLink current={filterType} value="parttime" param="type" label="Part-time" />
        <FilterLink current={filterType} value="tour_leader" param="type" label="Tour Leader" />
        <FilterLink current={filterType} value="freelance" param="type" label="Freelance" />
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">👤</p>
          <p className="text-lg font-bold text-slate-700">
            {totalAll > 0 ? 'Tidak ada karyawan match filter' : 'Belum ada karyawan'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {totalAll > 0
              ? `Total ada ${totalAll} karyawan di DB. Coba ubah filter "Status" jadi "Semua Status".`
              : 'Klik "+ Tambah Karyawan" untuk mulai.'}
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
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Role / Department</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5 text-right">Gaji / Fee</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((e) => {
                  const type = EMPLOYMENT_TYPE_BADGE[e.employment_type] || { label: e.employment_type || '-', color: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {e.avatar_url ? (
                            <img src={e.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                              {(e.full_name || '?').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-brand-700">{e.full_name}</p>
                            {e.nickname && <p className="text-[10px] text-slate-500">({e.nickname})</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${type.color}`}>{type.label}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-700 capitalize">{e.role || '-'}</p>
                        <p className="text-[10px] text-slate-500">{e.department || ''}{e.position ? ` · ${e.position}` : ''}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{e.phone || '-'}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-mono">
                        {e.employment_type === 'tour_leader' && e.per_trip_fee > 0
                          ? <span>{fmtRupiah(e.per_trip_fee)}<span className="text-[10px] text-slate-500 block">/trip</span></span>
                          : e.employment_type === 'freelance' && e.hourly_rate > 0
                            ? <span>{fmtRupiah(e.hourly_rate)}<span className="text-[10px] text-slate-500 block">/hour</span></span>
                            : e.base_salary > 0
                              ? <span>{fmtRupiah(e.base_salary)}<span className="text-[10px] text-slate-500 block">/bulan</span></span>
                              : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          e.status === 'active' ? 'bg-green-100 text-green-700' :
                          e.status === 'resigned' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {e.status?.toUpperCase() || 'INACTIVE'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={`/hr/employees/${e.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
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
    </div>
  );
}

function FilterLink({ current, value, param, label }) {
  const isActive = current === value;
  return (
    <Link
      href={`/hr/employees?${param}=${value}`}
      className={`text-xs font-semibold px-3 py-1 rounded ${isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </Link>
  );
}
