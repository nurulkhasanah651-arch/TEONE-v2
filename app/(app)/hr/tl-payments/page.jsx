// Round 177v4: TL Payments list (HR view) — + bulk sync to accounting button
// Path: app/(app)/hr/tl-payments/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { bulkSyncTLPaymentsToAccounting } from '@/lib/actions/tl-payments';
import BulkSyncAccountingButton from '@/components/hr/BulkSyncAccountingButton';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE = {
  requested: { label: 'DIAJUKAN', cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'APPROVED', cls: 'bg-blue-100 text-blue-700' },
  paid:      { label: 'PAID',     cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'REJECTED', cls: 'bg-red-100 text-red-700' },
  pending:   { label: 'PENDING',  cls: 'bg-slate-100 text-slate-700' },
};

export default async function TLPaymentsListPage(props) {
  const sp = await Promise.resolve(props.searchParams);
  const filterStatus = sp?.status || 'requested';  // Default: show queue (requested)
  const filterTL = sp?.tl_id || '';

  const supabase = getServiceClient() || createClient();

  let query = supabase.from('tl_payments').select('*');
  if (filterStatus !== 'all') query = query.eq('status', filterStatus);
  if (filterTL) query = query.eq('tl_employee_id', filterTL);
  query = query.order('trip_departure', { ascending: false }).order('payment_type');

  const { data: payments, error } = await query;
  const list = payments || [];

  const { data: tlList } = await supabase
    .from('employees')
    .select('id, full_name, per_trip_fee')
    .eq('employment_type', 'tour_leader')
    .order('full_name');

  // Quick stats untuk semua status
  let stats = { requested: 0, approved: 0, paid: 0, rejected: 0, sumRequested: 0, sumApproved: 0, sumPaid: 0 };
  try {
    const { data: all } = await supabase.from('tl_payments').select('status, amount');
    for (const r of all || []) {
      const amt = Number(r.amount || 0);
      if (r.status === 'requested') { stats.requested++; stats.sumRequested += amt; }
      else if (r.status === 'approved') { stats.approved++; stats.sumApproved += amt; }
      else if (r.status === 'paid') { stats.paid++; stats.sumPaid += amt; }
      else if (r.status === 'rejected') { stats.rejected++; }
    }
  } catch {}

  // Group by trip
  const grouped = {};
  for (const p of list) {
    const key = p.trip_id;
    if (!grouped[key]) grouped[key] = { trip: p, items: [] };
    grouped[key].items.push(p);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/hr" className="text-sm text-brand-600 font-medium hover:underline">← HR</Link>
          <h1 className="mt-1 text-3xl font-bold text-brand-700">✈ TL Payments</h1>
          <p className="mt-1 text-slate-600">
            Ops ajukan request dari Portal TL → HR approve → auto-booking di HPP/cashflow → mark paid masuk real cashflow.
          </p>
        </div>
        {/* R177v4: Bulk sync semua paid/approved ke trip_finance_items */}
        <BulkSyncAccountingButton bulkSyncAction={async () => {
          'use server';
          return await bulkSyncTLPaymentsToAccounting();
        }} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
          ⚠ {error.message}
          {/relation.*does not exist/i.test(error.message) && (
            <div className="mt-2 text-xs">Run SQL R176 + R177 dulu</div>
          )}
        </div>
      )}

      {/* HIGHLIGHT REQUEST QUEUE */}
      {stats.requested > 0 && filterStatus !== 'requested' && (
        <Link href="/hr/tl-payments?status=requested" className="block bg-gradient-to-r from-amber-50 to-amber-100 border-2 border-amber-300 rounded-xl p-4 hover:shadow-card-hover transition">
          <p className="text-sm font-bold text-amber-900">
            🔔 {stats.requested} request menunggu approval — total {fmtIDR(stats.sumRequested)}
          </p>
          <p className="text-xs text-amber-700 mt-1">Klik untuk lihat queue →</p>
        </Link>
      )}

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Requested" value={stats.requested} sub={fmtIDR(stats.sumRequested)} color="bg-amber-50 text-amber-700" />
        <StatCard label="Approved" value={stats.approved} sub={fmtIDR(stats.sumApproved)} color="bg-blue-50 text-blue-700" />
        <StatCard label="Paid" value={stats.paid} sub={fmtIDR(stats.sumPaid)} color="bg-green-50 text-green-700" />
        <StatCard label="Rejected" value={stats.rejected} color="bg-red-50 text-red-700" />
      </div>

      {/* Warning kalau TL belum di-set fee */}
      {tlList && tlList.some((t) => !t.per_trip_fee) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
          ⚠ TL belum di-set <b>Fee per Trip</b>:{' '}
          {tlList.filter((t) => !t.per_trip_fee).map((t) => (
            <Link key={t.id} href={`/hr/employees/${t.id}`} className="mx-1 underline font-semibold">{t.full_name}</Link>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 uppercase">Status:</span>
        <FilterLink current={filterStatus} value="requested" param="status" label={`Queue (${stats.requested})`} highlight />
        <FilterLink current={filterStatus} value="approved" param="status" label={`Approved (${stats.approved})`} />
        <FilterLink current={filterStatus} value="paid" param="status" label="Paid" />
        <FilterLink current={filterStatus} value="rejected" param="status" label="Rejected" />
        <FilterLink current={filterStatus} value="all" param="status" label="Semua" />
        <span className="text-slate-300">|</span>
        <span className="text-xs font-bold text-slate-600">TL:</span>
        <form className="contents">
          <select name="tl_id" defaultValue={filterTL} className="text-xs px-2 py-1 border border-slate-300 rounded">
            <option value="">— Semua TL —</option>
            {(tlList || []).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
          <input type="hidden" name="status" value={filterStatus} />
          <button type="submit" className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded">Apply</button>
        </form>
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">✈</p>
          <p className="text-lg font-bold text-slate-700">
            {filterStatus === 'requested' ? 'Belum ada request baru' : 'Belum ada data'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {filterStatus === 'requested'
              ? 'TL ajukan request dari Portal TL (/tl/[tripId]) — tombol "Ajukan Request 70%/30%".'
              : 'Coba ubah filter status di atas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map(({ trip, items }) => {
            const totalTrip = items.reduce((s, x) => s + Number(x.amount || 0), 0);
            return (
              <div key={trip.trip_id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase">{trip.trip_kode || trip.trip_id}</p>
                    <p className="text-base font-bold text-brand-700">{trip.trip_name || '-'}</p>
                    <p className="text-xs text-slate-600">
                      📅 {fmtDate(trip.trip_departure)}
                      {' · TL: '}<span className="font-semibold text-pink-700">{trip.tl_name}</span>
                    </p>
                  </div>
                  <p className="text-sm font-mono">{fmtIDR(totalTrip)}</p>
                </div>

                <div className="divide-y divide-slate-100">
                  {items.map((p) => (
                    <PaymentRow key={p.id} p={p} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaymentRow({ p }) {
  const typeLabel = p.payment_type === 'dp_70' ? '70% DP' : '30% Final';
  const typeColor = p.payment_type === 'dp_70' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  const statusInfo = STATUS_BADGE[p.status] || STATUS_BADGE.pending;
  return (
    <Link href={`/hr/tl-payments/${p.id}`} className="block px-4 py-3 hover:bg-slate-50 transition">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${typeColor}`}>{typeLabel}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{fmtIDR(p.amount)}</p>
          <p className="text-[11px] text-slate-500">
            {p.status === 'requested' && p.requested_at && <>Diajukan: {fmtDate(p.requested_at)} oleh {p.requested_by}</>}
            {p.status === 'approved' && p.approved_at && <>Approved: {fmtDate(p.approved_at)} oleh {p.approved_by}</>}
            {p.status === 'paid' && p.paid_at && <>Dibayar: {fmtDate(p.paid_at)}</>}
            {p.status === 'rejected' && p.reject_reason && <>Reject: {p.reject_reason}</>}
            {!['requested', 'approved', 'paid', 'rejected'].includes(p.status) && <>Due: {fmtDate(p.due_date)}</>}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusInfo.cls}`}>{statusInfo.label}</span>
        <span className="text-xs text-brand-600 font-semibold">Detail →</span>
      </div>
    </Link>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${color}`}>
      <p className="text-[10px] font-bold uppercase opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 font-mono opacity-80">{sub}</p>}
    </div>
  );
}

function FilterLink({ current, value, param, label, highlight }) {
  const isActive = current === value;
  return (
    <Link
      href={`/hr/tl-payments?${param}=${value}`}
      className={`text-xs font-semibold px-3 py-1 rounded ${
        isActive
          ? 'bg-brand-500 text-white'
          : highlight
            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {label}
    </Link>
  );
}
