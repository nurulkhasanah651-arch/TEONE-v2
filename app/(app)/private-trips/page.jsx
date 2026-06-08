// R224: Private Trip Request — Dashboard List (internal team)
// Path: app/(app)/private-trips/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const dynamic = 'force-dynamic';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

function fmtRupiah(n) {
  if (!n) return '—';
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

function timeAgo(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
  return `${Math.floor(diff / 86400)}h lalu`;
}

const STATUS_BADGE = {
  new: { label: '🆕 NEW', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  contacted: { label: '📞 Contacted', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  quoted: { label: '📋 Quoted', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  accepted: { label: '✅ Accepted', color: 'bg-green-100 text-green-800 border-green-300' },
  declined: { label: '❌ Declined', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  archived: { label: '📦 Archived', color: 'bg-slate-50 text-slate-500 border-slate-200' },
};

const TRIP_TYPE_LABEL = {
  honeymoon: '💑 Honeymoon',
  family: '👨‍👩‍👧 Family',
  group: '👥 Group',
  corporate: '🏢 Corporate',
  school: '🎓 School',
  other: '🌐 Lainnya',
};

export default async function PrivateTripsListPage({ searchParams }) {
  const sp = await searchParams;
  const statusFilter = sp?.status || 'active';
  const search = sp?.search || '';

  const supabase = getServiceClient() || createClient();

  let q = supabase
    .from('private_trip_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter === 'active') {
    q = q.in('status', ['new', 'contacted', 'quoted']);
  } else if (statusFilter !== 'all') {
    q = q.eq('status', statusFilter);
  }

  if (search) {
    q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,destination.ilike.%${search}%`);
  }

  const { data: requests } = await q;
  const list = requests || [];

  // Stats
  const stats = {
    new: list.filter((r) => r.status === 'new').length,
    contacted: list.filter((r) => r.status === 'contacted').length,
    quoted: list.filter((r) => r.status === 'quoted').length,
    accepted: list.filter((r) => r.status === 'accepted').length,
    total_value: list.reduce((s, r) => s + (Number(r.estimate_budget) || 0) * (r.budget_type === 'per_pax' ? r.pax_count : 1), 0),
  };

  const publicUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://teone.dev';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-indigo-700 flex items-center gap-2">
            ✈ Private Trip Requests
          </h1>
          <p className="mt-1 text-slate-600">
            Lead form public-facing — kelola request custom trip dari calon peserta
          </p>
        </div>
        <a
          href={`${publicUrl}/request-private-trip`}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-lg hover:bg-indigo-200 inline-flex items-center gap-1.5"
        >
          🔗 Buka Public Form
        </a>
      </div>

      {/* Public link share box */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-4">
        <p className="text-sm font-bold text-indigo-800 mb-2">📣 Share Link Public Form:</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="flex-1 px-3 py-2 bg-white rounded font-mono text-sm border border-indigo-200 break-all">
            {publicUrl}/request-private-trip
          </code>
          <a
            href={`${publicUrl}/request-private-trip`}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700"
          >
            Preview ↗
          </a>
        </div>
        <p className="text-[11px] text-slate-600 mt-2">
          💡 Tambah UTM tracking buat analisa: <code>?utm_source=ig&utm_campaign=promo2026</code>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="🆕 Baru" value={stats.new} color="bg-emerald-50 border-emerald-200 text-emerald-700" />
        <StatCard label="📞 Contacted" value={stats.contacted} color="bg-blue-50 border-blue-200 text-blue-700" />
        <StatCard label="📋 Quoted" value={stats.quoted} color="bg-indigo-50 border-indigo-200 text-indigo-700" />
        <StatCard label="✅ Accepted" value={stats.accepted} color="bg-green-50 border-green-200 text-green-700" />
        <StatCard label="💰 Potential" value={fmtRupiah(stats.total_value)} color="bg-amber-50 border-amber-200 text-amber-700" small />
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <form className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1 flex-wrap">
            <FilterChip href="/private-trips?status=active" active={statusFilter === 'active'} label="🔥 Aktif" />
            <FilterChip href="/private-trips?status=new" active={statusFilter === 'new'} label="🆕 Baru" />
            <FilterChip href="/private-trips?status=contacted" active={statusFilter === 'contacted'} label="📞 Contacted" />
            <FilterChip href="/private-trips?status=quoted" active={statusFilter === 'quoted'} label="📋 Quoted" />
            <FilterChip href="/private-trips?status=accepted" active={statusFilter === 'accepted'} label="✅ Accepted" />
            <FilterChip href="/private-trips?status=declined" active={statusFilter === 'declined'} label="❌ Declined" />
            <FilterChip href="/private-trips?status=archived" active={statusFilter === 'archived'} label="📦 Archive" />
            <FilterChip href="/private-trips?status=all" active={statusFilter === 'all'} label="📋 Semua" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="🔍 Cari nama / phone / destinasi..."
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
            />
          </div>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-indigo-700">
            {list.length} request {statusFilter !== 'all' ? `(filter: ${statusFilter})` : ''}
          </h2>
        </div>

        {list.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-slate-500">Belum ada request masuk</p>
            <p className="text-xs text-slate-400 mt-1">Share link public form ke calon peserta</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((r) => {
              const badge = STATUS_BADGE[r.status] || STATUS_BADGE.new;
              const tripType = TRIP_TYPE_LABEL[r.trip_type] || r.trip_type || '—';
              const totalBudget = r.estimate_budget ? (r.budget_type === 'per_pax' ? r.estimate_budget * r.pax_count : r.estimate_budget) : 0;
              return (
                <Link
                  key={r.id}
                  href={`/private-trips/${r.id}`}
                  className="block px-5 py-4 hover:bg-indigo-50/30 transition"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">#{r.id}</span>
                        <span className="text-[10px] text-slate-500">· {timeAgo(r.created_at)}</span>
                        {tripType !== '—' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700">{tripType}</span>
                        )}
                      </div>
                      <p className="font-bold text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-600">
                        📞 {r.phone}
                        {r.email && <span> · ✉ {r.email}</span>}
                      </p>
                      <p className="text-sm text-slate-700 mt-1">
                        ✈ <b>{r.destination}</b> · 👥 {r.pax_count} pax
                        {r.start_date && (
                          <> · 📅 {fmtDate(r.start_date)}{r.end_date && ` - ${fmtDate(r.end_date)}`}</>
                        )}
                      </p>
                      {r.itinerary_idea && (
                        <p className="text-xs text-slate-500 mt-1 italic line-clamp-2">
                          💭 "{r.itinerary_idea.slice(0, 150)}{r.itinerary_idea.length > 150 ? '...' : ''}"
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {totalBudget > 0 && (
                        <>
                          <p className="text-[10px] text-slate-500">Budget {r.budget_type === 'per_pax' ? '/pax' : 'total'}</p>
                          <p className="font-bold text-amber-700">{fmtRupiah(r.estimate_budget)}</p>
                          {r.budget_type === 'per_pax' && r.pax_count > 1 && (
                            <p className="text-[10px] text-slate-500">≈ {fmtRupiah(totalBudget)} total</p>
                          )}
                        </>
                      )}
                      {r.assigned_to && (
                        <p className="text-[10px] text-slate-500 mt-1">👤 {r.assigned_to}</p>
                      )}
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

function StatCard({ label, value, color, small }) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${small ? 'text-base' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}

function FilterChip({ href, active, label }) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded font-semibold transition ${
        active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {label}
    </Link>
  );
}
