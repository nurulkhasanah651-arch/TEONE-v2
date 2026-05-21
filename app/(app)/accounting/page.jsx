// Accounting dashboard — overview cards + recent transactions

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { aggregateAccountBalances, computePiutang, computeHutang, computePnrDeposits } from '@/lib/utils/accounting-aggregator';
import AccountingRow from '@/components/accounting/AccountingRow';

export const dynamic = 'force-dynamic';

export default async function AccountingDashboard({ searchParams }) {
  const sp = await searchParams;
  const filterMonth = sp?.month || '';
  const filterType = sp?.type || 'all';

  const supabase = createClient();

  const [accountsRes, accEntriesRes, payRes, hppRes, passRes, custRes, finItemsAllRes, pnrRes, tripsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('active', true),
    supabase.from('accounting_entries').select('*').order('date', { ascending: false }),
    supabase.from('participant_payments').select('*').order('paid_at', { ascending: false, nullsFirst: false }),
    supabase.from('trip_finance_items').select('*').eq('item_type', 'hpp').eq('payment_status', 'lunas'),
    supabase.from('trip_passengers').select('id, trip_id, customer_id, price_paid'),
    supabase.from('customers').select('id, name'),
    supabase.from('trip_finance_items').select('item_type, total_amount, payment_status'),
    supabase.from('flight_inventory').select('deposit_total, payoff_amount'),
    supabase.from('trips').select('id, kode_trip, name'),
  ]);

  const accounts = accountsRes.data || [];
  const accEntries = accEntriesRes.data || [];
  const balances = aggregateAccountBalances(accounts, accEntries);
  const totalBank = Object.values(balances).reduce((s, b) => s + b.balance, 0);

  const piutang = computePiutang(passRes.data || [], payRes.data || []);
  const hutang = computeHutang(finItemsAllRes.data || []);
  const pnrDeposits = computePnrDeposits(pnrRes.data || []);

  const totalAssets = totalBank + piutang + pnrDeposits;
  const totalLiabilities = hutang;
  const netEquity = totalAssets - totalLiabilities;

  // Recent unified transactions (top 30)
  const trips = tripsRes.data || [];
  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));
  const passengers = passRes.data || [];
  const customers = custRes.data || [];
  const paxMap = Object.fromEntries(passengers.map((p) => [p.id, p]));
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  const entries = [];
  for (const p of (payRes.data || [])) {
    if (!p.amount || p.amount <= 0) continue;
    const passenger = paxMap[p.passenger_id];
    const customer = passenger ? custMap[passenger.customer_id] : null;
    const trip = passenger ? tripMap[passenger.trip_id] : null;
    entries.push({ id: `pay_${p.id}`, type: 'in', amount: p.amount, date: p.paid_at, category: p.type, description: customer?.name || 'Peserta', trip, source: 'payment', notes: p.notes });
  }
  for (const it of (hppRes.data || [])) {
    if (!it.total_amount || it.total_amount <= 0) continue;
    const trip = tripMap[it.trip_id];
    entries.push({ id: `hpp_${it.id}`, type: 'out', amount: it.total_amount, date: it.payoff_date, category: it.category, description: `${it.component}${it.vendor_name ? ` · ${it.vendor_name}` : ''}`, trip, source: 'hpp', notes: it.notes });
  }
  for (const m of accEntries) {
    entries.push({ id: `man_${m.id}`, manualId: m.id, type: m.type, amount: m.amount, date: m.date, category: m.category, description: m.description, trip: m.trip_id ? tripMap[m.trip_id] : null, source: 'manual', notes: null });
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
        <p className="mt-1 text-slate-600">Posisi keuangan real-time + cash flow + balance sheet.</p>
      </div>

      {/* Balance Sheet at-a-glance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="🏦 Total Saldo Bank/Kas" value={fmtRupiah(totalBank)} color="text-blue-700" bg="bg-blue-50" />
        <StatCard label="🧾 Piutang Peserta" value={fmtRupiah(piutang)} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="💼 Hutang Vendor" value={fmtRupiah(hutang)} color="text-red-700" bg="bg-red-50" />
        <StatCard label="📊 Net Equity" value={fmtRupiah(netEquity)} color={netEquity >= 0 ? 'text-green-700' : 'text-red-700'} bg={netEquity >= 0 ? 'bg-green-50' : 'bg-red-50'} />
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <SectionCard href="/accounting/reports" icon="📊" title="Laporan Bulanan" desc="P&L, Cash Flow, trend 6 bulan" color="from-indigo-500 to-blue-700" />
        <SectionCard href="/accounting/accounts" icon="🏦" title="Bank & Cash" desc={`${accounts.length} akun aktif`} color="from-blue-500 to-blue-700" />
        <SectionCard href="/accounting/groups" icon="📈" title="Real Cashflow per Group" desc="Cash flow real per trip" color="from-green-500 to-emerald-700" />
        <SectionCard href="/accounting/balance-sheet" icon="📋" title="Balance Sheet" desc="Assets vs Liabilities" color="from-purple-500 to-purple-700" />
        <SectionCard href="/accounting/new" icon="➕" title="Tambah Entry Manual" desc="Cash in/out non-trip" color="from-amber-500 to-orange-700" />
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Filter Transaksi</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Link href="/accounting" className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'all' && !filterMonth ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Semua</Link>
          <Link href={`/accounting?type=in${filterMonth ? `&month=${filterMonth}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'in' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>⬆ Cash In</Link>
          <Link href={`/accounting?type=out${filterMonth ? `&month=${filterMonth}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'out' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>⬇ Cash Out</Link>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Transaksi Terbaru ({filtered.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">30 terbaru dari payment + HPP lunas + entry manual.</p>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center"><p className="text-4xl mb-3">💰</p><p className="text-sm text-slate-500">Belum ada transaksi.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">{filtered.map((e) => <AccountingRow key={e.id} entry={e} />)}</div>
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

function SectionCard({ href, icon, title, desc, color }) {
  return (
    <Link href={href} className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${color}`} />
      <div className="p-4">
        <div className="text-2xl mb-1.5">{icon}</div>
        <p className="font-bold text-brand-700 text-sm">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}
