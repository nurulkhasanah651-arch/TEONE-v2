// Round 176: TL Payments — list (terpisah dari payroll karyawan internal)
// Path: app/(app)/hr/tl-payments/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sweepGenerateAllTLPayments } from '@/lib/actions/tl-payments';

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

async function SweepButton() {
  async function action() {
    'use server';
    await sweepGenerateAllTLPayments();
  }
  return (
    <form action={action}>
      <button type="submit" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card">
        🔄 Sync dari Master Trip
      </button>
    </form>
  );
}

export default async function TLPaymentsListPage(props) {
  const sp = await Promise.resolve(props.searchParams);
  const filterStatus = sp?.status || 'all';
  const filterTL = sp?.tl_id || '';

  const supabase = getServiceClient() || createClient();

  let query = supabase.from('tl_payments').select('*');
  if (filterStatus !== 'all') query = query.eq('status', filterStatus);
  if (filterTL) query = query.eq('tl_employee_id', filterTL);
  query = query.order('trip_departure', { ascending: false }).order('payment_type');

  const { data: payments, error } = await query;
  const list = payments || [];

  // TL filter options
  const { data: tlList } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('employment_type', 'tour_leader')
    .order('full_name');

  // Stats
  const totalPending = list.filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPaid = list.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = list.filter((p) => p.status === 'pending' && p.due_date && p.due_date < today).length;

  // Group by trip
  const grouped = {};
  for (const p of list) {
    const key = p.trip_id;
    if (!grouped[key]) grouped[key] = { trip: p, items: [] };
    grouped[key].items.push(p);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/hr" className="text-sm text-brand-600 font-medium hover:underline">← HR</Link>
          <h1 className="mt-1 text-3xl font-bold text-brand-700">✈ TL Payments</h1>
          <p className="mt-1 text-slate-600">
            Pembayaran Tour Leader — <b>70% DP</b> sebelum keberangkatan + <b>30% Final</b> setelah final report.
          </p>
        </div>
        <SweepButton />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
          ⚠ {error.message}
          {/relation.*does not exist/i.test(error.message) && (
            <div className="mt-2 text-xs">Run dulu: <b>SQL_FIX_create_tl_payments_table.txt</b> di Supabase</div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Entries" value={list.length} color="bg-slate-50 text-slate-700" />
        <StatCard label="Pending" value={list.filter((p) => p.status === 'pending').length} sub={fmtIDR(totalPending)} color="bg-amber-50 text-amber-700" />
        <StatCard label="Paid" value={list.filter((p) => p.status === 'paid').length} sub={fmtIDR(totalPaid)} color="bg-green-50 text-green-700" />
        <StatCard label="Overdue" value={overdue} color="bg-red-50 text-red-700" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 uppercase">Filter:</span>
        <FilterLink current={filterStatus} value="all" param="status" label="Semua" />
        <FilterLink current={filterStatus} value="pending" param="status" label="Pending" />
        <FilterLink current={filterStatus} value="paid" param="status" label="Paid" />
        <span className="text-slate-300">|</span>
        <span className="text-xs font-bold text-slate-600">TL:</span>
        <form className="contents">
          <select
            name="tl_id"
            defaultValue={filterTL}
            className="text-xs px-2 py-1 border border-slate-300 rounded"
            onChange="this.form.submit()"
          >
            <option value="">— Semua TL —</option>
            {(tlList || []).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
          <input type="hidden" name="status" value={filterStatus} />
        </form>
      </div>

      {/* List grouped by trip */}
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">✈</p>
          <p className="text-lg font-bold text-slate-700">Belum ada TL payment</p>
          <p className="mt-1 text-sm text-slate-500">
            Klik tombol <b>🔄 Sync dari Master Trip</b> di atas untuk auto-generate entries dari trips yg ada TL ter-assign.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map(({ trip, items }) => {
            const totalTrip = items.reduce((s, x) => s + Number(x.amount || 0), 0);
            const paidTrip = items.filter((x) => x.status === 'paid').reduce((s, x) => s + Number(x.amount || 0), 0);
            return (
              <div key={trip.trip_id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase">{trip.trip_kode || trip.trip_id}</p>
                    <p className="text-base font-bold text-brand-700">{trip.trip_name || '-'}</p>
                    <p className="text-xs text-slate-600">
                      📅 {fmtDate(trip.trip_departure)} {trip.trip_return ? `→ ${fmtDate(trip.trip_return)}` : ''}
                      {' · TL: '}<span className="font-semibold text-pink-700">{trip.tl_name}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Progress</p>
                    <p className="text-sm font-mono">
                      {fmtIDR(paidTrip)} <span className="text-slate-400">/</span> {fmtIDR(totalTrip)}
                    </p>
                  </div>
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
  const today = new Date().toISOString().slice(0, 10);
  const overdue = p.status === 'pending' && p.due_date && p.due_date < today;
  const typeLabel = p.payment_type === 'dp_70' ? '70% DP' : '30% Final';
  const typeColor = p.payment_type === 'dp_70' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  return (
    <Link href={`/hr/tl-payments/${p.id}`} className="block px-4 py-3 hover:bg-slate-50 transition">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${typeColor}`}>{typeLabel}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{fmtIDR(p.amount)}</p>
          <p className="text-[11px] text-slate-500">
            Jatuh Tempo: <span className={overdue ? 'text-red-600 font-bold' : ''}>{fmtDate(p.due_date)}</span>
            {p.payment_type === 'final_30' && (
              <> · Final Report: {p.final_report_submitted ? <span className="text-green-700 font-bold">✓</span> : <span className="text-amber-600">⏳ belum</span>}</>
            )}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          p.status === 'paid' ? 'bg-green-100 text-green-700' :
          overdue ? 'bg-red-100 text-red-700' :
          'bg-amber-100 text-amber-700'
        }`}>
          {p.status === 'paid' ? 'PAID' : overdue ? 'OVERDUE' : 'PENDING'}
        </span>
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

function FilterLink({ current, value, param, label }) {
  const isActive = current === value;
  return (
    <Link
      href={`/hr/tl-payments?${param}=${value}`}
      className={`text-xs font-semibold px-3 py-1 rounded ${isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </Link>
  );
}
