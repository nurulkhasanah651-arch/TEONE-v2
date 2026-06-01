// Round 178: TL Payment History — grouped per TL, dengan totals
// Path: app/(app)/hr/tl-payments/history/page.jsx

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

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function TLPaymentHistoryPage(props) {
  const sp = await Promise.resolve(props.searchParams);
  const year = parseInt(sp?.year || new Date().getFullYear());
  const filterTL = sp?.tl_id || '';

  const supabase = getServiceClient() || createClient();

  // Ambil semua payment paid
  let query = supabase
    .from('tl_payments')
    .select('*')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false });

  if (filterTL) query = query.eq('tl_employee_id', filterTL);

  const { data: payments, error } = await query;

  // Filter by year (client-side filter on paid_at)
  const yearStr = String(year);
  const filteredByYear = (payments || []).filter((p) => {
    if (!p.paid_at) return false;
    return p.paid_at.slice(0, 4) === yearStr;
  });

  // TL list untuk filter
  const { data: tlList } = await supabase
    .from('employees')
    .select('id, full_name, employment_type, tl_subtype')
    .eq('employment_type', 'tour_leader')
    .order('full_name');

  // Group by TL
  const grouped = {};
  for (const p of filteredByYear) {
    const key = String(p.tl_employee_id || p.tl_name || '?');
    if (!grouped[key]) {
      grouped[key] = {
        tl_id: p.tl_employee_id,
        tl_name: p.tl_name,
        total: 0,
        dp_count: 0,
        final_count: 0,
        trip_kodes: new Set(),
        items: [],
      };
    }
    grouped[key].items.push(p);
    grouped[key].total += Number(p.amount || 0);
    if (p.payment_type === 'dp_70') grouped[key].dp_count++;
    else grouped[key].final_count++;
    if (p.trip_kode) grouped[key].trip_kodes.add(p.trip_kode);
  }

  // Sort by total desc
  const groupedArr = Object.values(grouped).sort((a, b) => b.total - a.total);

  // Grand totals
  const grandTotal = filteredByYear.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalDP = filteredByYear.filter((p) => p.payment_type === 'dp_70').reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalFinal = filteredByYear.filter((p) => p.payment_type === 'final_30').reduce((s, p) => s + Number(p.amount || 0), 0);

  // Available years (untuk filter)
  const allYears = new Set();
  for (const p of (payments || [])) {
    if (p.paid_at) allYears.add(p.paid_at.slice(0, 4));
  }
  const yearOptions = Array.from(allYears).sort((a, b) => b.localeCompare(a));
  if (!yearOptions.includes(yearStr)) yearOptions.unshift(yearStr);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <Link href="/hr/tl-payments" className="text-sm text-brand-600 font-medium hover:underline">← TL Payments</Link>
        <h1 className="mt-1 text-3xl font-bold text-brand-700">📜 History Pembayaran TL</h1>
        <p className="mt-1 text-slate-600">Semua TL payment yg sudah dibayar — grouped per TL, sortable per tahun.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">⚠ {error.message}</div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 uppercase">Tahun:</span>
        {yearOptions.map((y) => (
          <Link
            key={y}
            href={`/hr/tl-payments/history?year=${y}${filterTL ? `&tl_id=${filterTL}` : ''}`}
            className={`text-xs font-semibold px-3 py-1 rounded ${
              y === yearStr ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {y}
          </Link>
        ))}
        <span className="text-slate-300">|</span>
        <span className="text-xs font-bold text-slate-600">TL:</span>
        <form className="contents">
          <select name="tl_id" defaultValue={filterTL} className="text-xs px-2 py-1 border border-slate-300 rounded">
            <option value="">— Semua TL —</option>
            {(tlList || []).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
          <input type="hidden" name="year" value={yearStr} />
          <button type="submit" className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded">Apply</button>
        </form>
      </div>

      {/* Grand Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={`Total Paid ${yearStr}`} value={fmtIDR(grandTotal)} sub={`${filteredByYear.length} pembayaran`} color="bg-green-50 text-green-800" />
        <StatCard label="DP 70%" value={fmtIDR(totalDP)} sub={`${filteredByYear.filter((p) => p.payment_type === 'dp_70').length} entries`} color="bg-blue-50 text-blue-700" />
        <StatCard label="Final 30%" value={fmtIDR(totalFinal)} sub={`${filteredByYear.filter((p) => p.payment_type === 'final_30').length} entries`} color="bg-purple-50 text-purple-700" />
        <StatCard label="Jumlah TL" value={groupedArr.length} sub="TL aktif" color="bg-amber-50 text-amber-700" />
      </div>

      {/* List grouped per TL */}
      {groupedArr.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">📜</p>
          <p className="text-lg font-bold text-slate-700">Belum ada history tahun {yearStr}</p>
          <p className="mt-1 text-sm text-slate-500">Coba pilih tahun lain di filter di atas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedArr.map((g) => (
            <div key={String(g.tl_id || g.tl_name)} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
              <div className="bg-gradient-to-r from-pink-50 to-purple-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase">Tour Leader</p>
                  <p className="text-lg font-bold text-pink-700">{g.tl_name || '—'}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {g.items.length} pembayaran · {g.trip_kodes.size} trip
                    {' · '}DP: {g.dp_count} · Final: {g.final_count}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Total {yearStr}</p>
                  <p className="text-2xl font-bold text-pink-700 font-mono">{fmtIDR(g.total)}</p>
                  {g.tl_id && (
                    <Link
                      href={`/hr/employees/${g.tl_id}`}
                      className="text-[11px] text-brand-600 hover:underline"
                    >
                      Lihat profil TL →
                    </Link>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-2 font-bold">Tgl Bayar</th>
                      <th className="px-3 py-2 font-bold">Trip</th>
                      <th className="px-3 py-2 font-bold">Termin</th>
                      <th className="px-3 py-2 font-bold text-right">Nominal</th>
                      <th className="px-3 py-2 font-bold">Metode</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.items.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs">{fmtDate(p.paid_at)}</td>
                        <td className="px-3 py-2 text-xs">
                          <p className="font-bold text-brand-700">{p.trip_kode}</p>
                          <p className="text-[10px] text-slate-500">{p.trip_name}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            p.payment_type === 'dp_70' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {p.payment_type === 'dp_70' ? '70% DP' : '30% Final'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{fmtIDR(p.amount)}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{p.payment_method || '-'}</td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/hr/tl-payments/${p.id}`}
                            className="text-xs font-semibold text-brand-600 hover:underline"
                          >
                            Detail →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${color}`}>
      <p className="text-[10px] font-bold uppercase opacity-70">{label}</p>
      <p className="text-xl font-bold mt-1 font-mono">{value}</p>
      {sub && <p className="text-[11px] mt-1 opacity-80">{sub}</p>}
    </div>
  );
}
