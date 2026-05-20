// Accounting — combined cash flow from payments + HPP lunas + manual entries

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import AccountingRow from '@/components/accounting/AccountingRow';

export const dynamic = 'force-dynamic';

export default async function AccountingPage({ searchParams }) {
  const sp = await searchParams;
  const filterMonth = sp?.month || ''; // YYYY-MM, empty = all
  const filterType = sp?.type || 'all'; // 'in' | 'out' | 'all'

  const supabase = createClient();

  // Fetch all data in parallel
  const [payRes, hppRes, manualRes, tripsRes, passRes, custRes] = await Promise.all([
    supabase.from('participant_payments').select('*').order('paid_at', { ascending: false, nullsFirst: false }),
    supabase.from('trip_finance_items').select('*').eq('item_type', 'hpp').eq('payment_status', 'lunas'),
    supabase.from('accounting_entries').select('*').order('date', { ascending: false }),
    supabase.from('trips').select('id, kode_trip, name'),
    supabase.from('trip_passengers').select('id, trip_id, customer_id'),
    supabase.from('customers').select('id, name'),
  ]);

  const trips = tripsRes.data || [];
  const passengers = passRes.data || [];
  const customers = custRes.data || [];
  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));
  const paxMap = Object.fromEntries(passengers.map((p) => [p.id, p]));
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  // Build unified entries list
  const entries = [];

  // Cash IN from participant_payments
  for (const p of (payRes.data || [])) {
    if (!p.amount || p.amount <= 0) continue;
    const passenger = paxMap[p.passenger_id];
    const customer = passenger ? custMap[passenger.customer_id] : null;
    const trip = passenger ? tripMap[passenger.trip_id] : null;
    entries.push({
      id: `pay_${p.id}`,
      type: 'in',
      amount: p.amount,
      date: p.paid_at || p.created_at?.slice(0, 10),
      category: p.type,
      description: customer?.name || 'Peserta',
      trip,
      source: 'payment',
      notes: p.notes,
      autoSource: true,
    });
  }

  // Cash OUT from trip_finance_items (HPP lunas)
  for (const it of (hppRes.data || [])) {
    if (!it.total_amount || it.total_amount <= 0) continue;
    const trip = tripMap[it.trip_id];
    entries.push({
      id: `hpp_${it.id}`,
      type: 'out',
      amount: it.total_amount,
      date: it.payoff_date || it.dp_date || it.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      category: it.category,
      description: `${it.component}${it.vendor_name ? ` · ${it.vendor_name}` : ''}`,
      trip,
      source: 'hpp',
      notes: it.notes,
      autoSource: true,
    });
  }

  // Manual accounting_entries
  for (const m of (manualRes.data || [])) {
    entries.push({
      id: `man_${m.id}`,
      manualId: m.id,
      type: m.type,
      amount: m.amount,
      date: m.date,
      category: m.category,
      description: m.description,
      trip: m.trip_id ? tripMap[m.trip_id] : null,
      source: 'manual',
      notes: null,
      autoSource: false,
    });
  }

  // Filter
  let filtered = entries;
  if (filterMonth) {
    filtered = filtered.filter((e) => e.date && e.date.startsWith(filterMonth));
  }
  if (filterType !== 'all') {
    filtered = filtered.filter((e) => e.type === filterType);
  }
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Totals
  const totalIn = filtered.filter((e) => e.type === 'in').reduce((s, e) => s + (e.amount || 0), 0);
  const totalOut = filtered.filter((e) => e.type === 'out').reduce((s, e) => s + (e.amount || 0), 0);
  const net = totalIn - totalOut;

  // Available months for filter
  const monthSet = new Set();
  for (const e of entries) if (e.date) monthSet.add(e.date.slice(0, 7));
  const months = Array.from(monthSet).sort().reverse();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">Accounting</h1>
          <p className="mt-1 text-slate-600">Cash flow real: payment peserta + HPP lunas + entry manual.</p>
        </div>
        <Link
          href="/accounting/new"
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
        >
          <span>+</span> Tambah Entry Manual
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Cash In" value={fmtRupiah(totalIn)} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Total Cash Out" value={fmtRupiah(totalOut)} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Net (Saldo)" value={fmtRupiah(net)} color={net >= 0 ? 'text-blue-700' : 'text-red-700'} bg={net >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Filter</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Link href="/accounting" className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'all' && !filterMonth ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            Semua
          </Link>
          <Link href={`/accounting?type=in${filterMonth ? `&month=${filterMonth}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'in' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
            ⬆ Cash In
          </Link>
          <Link href={`/accounting?type=out${filterMonth ? `&month=${filterMonth}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${filterType === 'out' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
            ⬇ Cash Out
          </Link>
          <span className="text-xs text-slate-400 mx-2">·</span>
          {months.length > 0 && (
            <>
              <Link href={`/accounting${filterType !== 'all' ? `?type=${filterType}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${!filterMonth ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                Semua bulan
              </Link>
              {months.slice(0, 6).map((m) => (
                <Link key={m} href={`/accounting?month=${m}${filterType !== 'all' ? `&type=${filterType}` : ''}`} className={`text-xs font-semibold px-3 py-1.5 rounded ${filterMonth === m ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {monthLabel(m)}
                </Link>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Entries list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Daftar Transaksi ({filtered.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Auto dari Payment + HPP lunas + Entry manual.</p>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-lg font-bold text-slate-700">Belum ada transaksi</p>
            <p className="mt-1 text-sm text-slate-500">Entry akan muncul otomatis dari Payment Checklist + HPP lunas.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((e) => <AccountingRow key={e.id} entry={e} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
