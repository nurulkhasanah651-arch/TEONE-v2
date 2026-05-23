// Accounting dashboard — Round 94: tambah link Bank Reconciliation + Invoices

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import PaymentRequests from '@/components/accounting/PaymentRequests';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try {
    const res = await promise;
    return res.data || fallback;
  } catch (e) {
    return fallback;
  }
}

export default async function AccountingDashboard({ searchParams }) {
  const sp = await searchParams;
  const filterMonth = sp?.month || '';
  const filterType = sp?.type || 'all';

  const supabase = createClient();

  const [accounts, accEntries, payments, hppLunas, passengers, customers, allFinItems, pnrs, trips, pendingRequests] = await Promise.all([
    safeQuery(supabase.from('accounts').select('*').eq('active', true)),
    safeQuery(supabase.from('accounting_entries').select('*').order('date', { ascending: false })),
    safeQuery(supabase.from('participant_payments').select('*').order('paid_at', { ascending: false, nullsFirst: false })),
    safeQuery(supabase.from('trip_finance_items').select('*').eq('item_type', 'hpp').eq('payment_status', 'lunas')),
    safeQuery(supabase.from('trip_passengers').select('id, trip_id, customer_id, price_paid')),
    safeQuery(supabase.from('customers').select('id, name')),
    safeQuery(supabase.from('trip_finance_items').select('item_type, total_amount, payment_status')),
    safeQuery(supabase.from('flight_inventory').select('deposit_total, payoff_amount')),
    safeQuery(supabase.from('trips').select('id, kode_trip, name')),
    safeQuery(supabase.from('trip_finance_items').select('*').eq('item_type', 'hpp').eq('payment_request_status', 'requested').order('payment_requested_at', { ascending: true })),
  ]);

  const accountBalances = {};
  for (const a of accounts) accountBalances[a.id] = (a.starting_balance || 0);
  for (const e of accEntries) {
    if (!e.account_id || accountBalances[e.account_id] == null) continue;
    if (e.type === 'in') accountBalances[e.account_id] += e.amount || 0;
    else if (e.type === 'out') accountBalances[e.account_id] -= e.amount || 0;
  }
  const totalBank = Object.values(accountBalances).reduce((s, b) => s + b, 0);

  const paidByPassenger = {};
  for (const p of payments) paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
  let piutang = 0;
  for (const pax of passengers) {
    const expected = pax.price_paid || 0;
    const paid = paidByPassenger[pax.id] || 0;
    if (expected > paid) piutang += (expected - paid);
  }

  let hutang = 0;
  for (const it of allFinItems) {
    if (it.item_type !== 'hpp') continue;
    if (it.payment_status === 'lunas' || it.payment_status === 'tidak perlu') continue;
    hutang += (it.total_amount || 0);
  }

  const totalAssets = totalBank + piutang;
  const netEquity = totalAssets - hutang;
  const realCompanyMoney = totalBank - hutang;

  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));
  const paxMap = Object.fromEntries(passengers.map((p) => [p.id, p]));
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  const entries = [];
  for (const p of payments) {
    if (!p.amount || p.amount <= 0) continue;
    const passenger = paxMap[p.passenger_id];
    const customer = passenger ? custMap[passenger.customer_id] : null;
    const trip = passenger ? tripMap[passenger.trip_id] : null;
    entries.push({ id: `pay_${p.id}`, type: 'in', amount: p.amount, date: p.paid_at, category: p.type, description: customer?.name || 'Peserta', trip, source: 'payment' });
  }
  for (const it of hppLunas) {
    if (!it.total_amount || it.total_amount <= 0) continue;
    entries.push({ id: `hpp_${it.id}`, type: 'out', amount: it.total_amount, date: it.transfer_date || it.payoff_date, category: it.category, description: `${it.component}${it.vendor_name ? ` · ${it.vendor_name}` : ''}`, trip: tripMap[it.trip_id], source: 'hpp' });
  }
  for (const m of accEntries) {
    entries.push({ id: `man_${m.id}`, type: m.type, amount: m.amount, date: m.date, category: m.category, description: m.description, trip: m.trip_id ? tripMap[m.trip_id] : null, source: 'manual' });
  }

  let filtered = entries;
  if (filterMonth) filtered = filtered.filter((e) => e.date && e.date.startsWith(filterMonth));
  if (filterType !== 'all') filtered = filtered.filter((e) => e.type === filterType);
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  filtered = filtered.slice(0, 30);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Accounting</h1>
        <p className="mt-1 text-slate-600">Posisi keuangan real-time + approve payment dari Finance.</p>
      </div>

      <PaymentRequests
        requests={pendingRequests}
        accounts={accounts}
        trips={trips}
      />

      <Link href="/accounting/cash-position" className={`block rounded-xl shadow-card overflow-hidden transition-all hover:shadow-card-hover hover:-translate-y-0.5 ${realCompanyMoney >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-700' : 'bg-gradient-to-br from-red-500 to-red-700'} text-white`}>
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">💼 Real Uang Perusahaan</p>
              <p className="text-[11px] opacity-70 mt-0.5">Bank Cash − Hutang Vendor (uang yang benar-benar milik perusahaan)</p>
              <p className="mt-2 text-3xl font-bold">{fmtRupiah(realCompanyMoney)}</p>
            </div>
            <span className="text-xs opacity-90 hover:underline">Detail →</span>
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="🏦 Saldo Bank/Kas" value={fmtRupiah(totalBank)} color="text-blue-700" bg="bg-blue-50" />
        <StatCard label="🧾 Piutang Peserta" value={fmtRupiah(piutang)} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="💼 Hutang Vendor" value={fmtRupiah(hutang)} color="text-red-700" bg="bg-red-50" />
        <StatCard label="📊 Net Equity" value={fmtRupiah(netEquity)} color={netEquity >= 0 ? 'text-green-700' : 'text-red-700'} bg={netEquity >= 0 ? 'bg-green-50' : 'bg-red-50'} />
      </div>

      {/* Round 94: tambah Bank Reconciliation + Invoices (jadi 8 card) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <SectionCard href="/accounting/reports" icon="📊" title="Laporan Bulanan" color="from-indigo-500 to-blue-700" />
        <SectionCard href="/accounting/cash-position" icon="💼" title="Posisi Kas" color="from-emerald-500 to-green-700" />
        <SectionCard href="/accounting/accounts" icon="🏦" title="Bank & Cash" color="from-blue-500 to-blue-700" />
        <SectionCard href="/accounting/groups" icon="📈" title="Real Cashflow per Group" color="from-green-500 to-emerald-700" />
        <SectionCard href="/accounting/balance-sheet" icon="📋" title="Balance Sheet" color="from-purple-500 to-purple-700" />
        <SectionCard href="/accounting/reconcile" icon="🔄" title="Bank Reconciliation" color="from-cyan-500 to-blue-700" />
        <SectionCard href="/invoices" icon="📄" title="Invoices" color="from-pink-500 to-rose-700" />
        <SectionCard href="/accounting/new" icon="➕" title="Entry Manual" color="from-amber-500 to-orange-700" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Filter Transaksi</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Link href="/accounting" className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'all' && !filterMonth ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Semua</Link>
          <Link href={`/accounting?type=in${filterMonth ? `&month=${filterMonth}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'in' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>⬆ Cash In</Link>
          <Link href={`/accounting?type=out${filterMonth ? `&month=${filterMonth}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'out' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>⬇ Cash Out</Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Transaksi Terbaru ({filtered.length})</h2>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center"><p className="text-4xl mb-3">💰</p><p className="text-sm text-slate-500">Belum ada transaksi.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((e) => (
              <div key={e.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${e.type === 'in' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>{e.type === 'in' ? '⬆ IN' : '⬇ OUT'}</span>
                      {e.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{e.category}</span>}
                      {e.trip && <Link href={`/trips/${e.trip.id}`} className="text-[11px] font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700">{e.trip.kode_trip || `#${e.trip.id}`}</Link>}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{e.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDate(e.date)}</p>
                  </div>
                  <p className={`text-lg font-bold ${e.type === 'in' ? 'text-green-700' : 'text-amber-700'}`}>
                    {e.type === 'in' ? '+' : '−'} {fmtRupiah(e.amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function SectionCard({ href, icon, title, color }) {
  return (
    <Link href={href} className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${color}`} />
      <div className="p-3 text-center">
        <div className="text-2xl mb-1">{icon}</div>
        <p className="font-bold text-brand-700 text-xs">{title}</p>
      </div>
    </Link>
  );
}
