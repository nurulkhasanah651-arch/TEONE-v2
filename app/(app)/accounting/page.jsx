// Round 158: Accounting dashboard + DATE RANGE FILTER + DOWNLOAD per kategori
// Filter: Hari ini / Minggu ini / Bulan ini / Tahun ini / Custom
// Download: Cash In / Cash Out / Cashflow Combined — semua dengan filter aktif
// Path: app/(app)/accounting/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import PaymentRequests from '@/components/accounting/PaymentRequests';
import DownloadButtons from '@/components/common/DownloadButtons';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const res = await promise; return res.data || fallback; } catch { return fallback; }
}

// ===== R158: Date range helpers =====
function getDateRange(period, customFrom, customTo) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  if (period === 'custom') {
    return { from: customFrom || '', to: customTo || todayStr };
  }
  if (period === 'today') {
    return { from: todayStr, to: todayStr };
  }
  if (period === 'week') {
    const start = new Date(today);
    const day = start.getDay() || 7; // Monday-based
    start.setDate(start.getDate() - day + 1);
    return { from: start.toISOString().slice(0, 10), to: todayStr };
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: start.toISOString().slice(0, 10), to: todayStr };
  }
  if (period === 'year') {
    const start = new Date(today.getFullYear(), 0, 1);
    return { from: start.toISOString().slice(0, 10), to: todayStr };
  }
  // 'all' or default
  return { from: '', to: '' };
}

function isInRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function getPeriodLabel(period) {
  switch (period) {
    case 'today':  return 'Hari Ini';
    case 'week':   return 'Minggu Ini';
    case 'month':  return 'Bulan Ini';
    case 'year':   return 'Tahun Ini';
    case 'custom': return 'Custom Range';
    default:       return 'Semua Periode';
  }
}

export default async function AccountingDashboard({ searchParams }) {
  const sp = await searchParams;
  const period = sp?.period || 'month'; // default bulan ini
  const customFrom = sp?.from || '';
  const customTo = sp?.to || '';
  const filterType = sp?.type || 'all';

  const { from, to } = getDateRange(period, customFrom, customTo);
  const periodLabel = getPeriodLabel(period);

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

  // === Saldo per account (full history) ===
  const accountBalances = {};
  for (const a of accounts) accountBalances[a.id] = (a.starting_balance || 0);
  for (const e of accEntries) {
    if (!e.account_id || accountBalances[e.account_id] == null) continue;
    if (e.type === 'in') accountBalances[e.account_id] += e.amount || 0;
    else if (e.type === 'out') accountBalances[e.account_id] -= e.amount || 0;
  }
  const manualBankSum = Object.values(accountBalances).reduce((s, b) => s + b, 0);

  // === Auto cashflow (FULL history) ===
  let autoCashInAll = 0;
  for (const p of payments) autoCashInAll += Number(p.amount || 0);
  let autoCashOutAll = 0;
  for (const it of hppLunas) autoCashOutAll += Number(it.total_amount || 0);
  const totalBank = manualBankSum + (autoCashInAll - autoCashOutAll);

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
  const realCompanyMoney = totalBank - hutang;
  const netEquity = (totalBank + piutang) - hutang;

  // === Maps for entry construction ===
  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));
  const paxMap = Object.fromEntries(passengers.map((p) => [p.id, p]));
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  // === Build all entries (cash in + cash out combined) ===
  const allEntries = [];
  for (const p of payments) {
    if (!p.amount || p.amount <= 0) continue;
    const passenger = paxMap[p.passenger_id];
    const customer = passenger ? custMap[passenger.customer_id] : null;
    const trip = passenger ? tripMap[passenger.trip_id] : null;
    allEntries.push({
      id: `pay_${p.id}`,
      type: 'in',
      amount: Number(p.amount) || 0,
      date: (p.paid_at || '').slice(0, 10),
      category: p.type || 'payment',
      description: customer?.name || 'Peserta',
      trip_kode: trip ? (trip.kode_trip || `#${trip.id}`) : '-',
      trip_name: trip ? trip.name : '-',
      source: 'payment',
      source_label: 'Peserta',
    });
  }
  for (const it of hppLunas) {
    if (!it.total_amount || it.total_amount <= 0) continue;
    allEntries.push({
      id: `hpp_${it.id}`,
      type: 'out',
      amount: Number(it.total_amount) || 0,
      date: ((it.transfer_date || it.payoff_date) || '').slice(0, 10),
      category: it.category || 'HPP',
      description: `${it.component}${it.vendor_name ? ` · ${it.vendor_name}` : ''}`,
      trip_kode: tripMap[it.trip_id] ? (tripMap[it.trip_id].kode_trip || `#${it.trip_id}`) : '-',
      trip_name: tripMap[it.trip_id] ? tripMap[it.trip_id].name : '-',
      source: 'hpp',
      source_label: 'Vendor',
    });
  }
  for (const m of accEntries) {
    if (!m.amount || m.amount <= 0) continue;
    allEntries.push({
      id: `man_${m.id}`,
      type: m.type,
      amount: Number(m.amount) || 0,
      date: (m.date || '').slice(0, 10),
      category: m.category || 'Manual',
      description: m.description || '-',
      trip_kode: m.trip_id && tripMap[m.trip_id] ? (tripMap[m.trip_id].kode_trip || `#${m.trip_id}`) : '-',
      trip_name: m.trip_id && tripMap[m.trip_id] ? tripMap[m.trip_id].name : '-',
      source: 'manual',
      source_label: 'Manual',
    });
  }

  // === Apply date filter ===
  let inRangeEntries = allEntries;
  if (from || to) {
    inRangeEntries = allEntries.filter((e) => isInRange(e.date, from, to));
  }

  // Type filter (for display only, downloads use full inRange)
  let filteredForDisplay = inRangeEntries;
  if (filterType === 'in') filteredForDisplay = inRangeEntries.filter((e) => e.type === 'in');
  if (filterType === 'out') filteredForDisplay = inRangeEntries.filter((e) => e.type === 'out');
  filteredForDisplay.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // === Filtered totals for stats ===
  const cashInEntries = inRangeEntries.filter((e) => e.type === 'in');
  const cashOutEntries = inRangeEntries.filter((e) => e.type === 'out');
  const periodCashIn = cashInEntries.reduce((s, e) => s + e.amount, 0);
  const periodCashOut = cashOutEntries.reduce((s, e) => s + e.amount, 0);
  const periodNet = periodCashIn - periodCashOut;

  // === Sort untuk download (date descending) ===
  cashInEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  cashOutEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const cashflowCombined = [...inRangeEntries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const subtitleDate = from && to
    ? `${periodLabel} · ${from} s/d ${to}`
    : from
      ? `${periodLabel} · sejak ${from}`
      : periodLabel;

  // === Common columns ===
  const detailColumns = [
    { key: 'date', label: 'Tanggal', format: 'date' },
    { key: 'source_label', label: 'Sumber' },
    { key: 'category', label: 'Kategori' },
    { key: 'description', label: 'Keterangan' },
    { key: 'trip_kode', label: 'Trip' },
    { key: 'amount', label: 'Nominal', align: 'right', format: 'rupiah' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Accounting</h1>
        <p className="mt-1 text-slate-600">Posisi keuangan real-time + laporan bisa di-download.</p>
      </div>

      <PaymentRequests
        requests={pendingRequests}
        accounts={accounts}
        trips={trips}
      />

      {/* === R158: PERIODE FILTER === */}
      <div className="bg-white rounded-xl border-2 border-brand-200 shadow-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">📅 Periode Laporan</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Filter semua data (stats + transaksi + download) berdasarkan tanggal</p>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <PeriodLink current={period} value="today" label="Hari Ini" />
            <PeriodLink current={period} value="week" label="Minggu Ini" />
            <PeriodLink current={period} value="month" label="Bulan Ini" />
            <PeriodLink current={period} value="year" label="Tahun Ini" />
            <PeriodLink current={period} value="all" label="Semua" />
          </div>
        </div>

        {/* Custom range form */}
        <form action="/accounting" method="get" className="mt-3 flex items-center gap-2 flex-wrap">
          <input type="hidden" name="period" value="custom" />
          <label className="text-[11px] font-bold text-slate-700">Custom:</label>
          <input type="date" name="from" defaultValue={customFrom || from} className="px-2 py-1 border border-slate-300 rounded text-xs" />
          <span className="text-xs text-slate-500">s/d</span>
          <input type="date" name="to" defaultValue={customTo || to} className="px-2 py-1 border border-slate-300 rounded text-xs" />
          <button type="submit" className="px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded">
            Apply
          </button>
          {(from || to) && (
            <span className="text-[11px] text-slate-600 ml-2">
              📊 <strong>{periodLabel}</strong>: {from || '—'} s/d {to || '—'} · {inRangeEntries.length} transaksi
            </span>
          )}
        </form>
      </div>

      {/* === R158: STATS UNTUK PERIODE INI === */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard
          label={`⬆ Cash In (${periodLabel})`}
          value={fmtRupiah(periodCashIn)}
          sub={`${cashInEntries.length} transaksi`}
          color="text-green-700"
          bg="bg-green-50"
        />
        <StatCard
          label={`⬇ Cash Out (${periodLabel})`}
          value={fmtRupiah(periodCashOut)}
          sub={`${cashOutEntries.length} transaksi`}
          color="text-amber-700"
          bg="bg-amber-50"
        />
        <StatCard
          label={`Net Cashflow (${periodLabel})`}
          value={fmtRupiah(periodNet)}
          sub={periodNet >= 0 ? '✓ Positif' : '⚠ Negatif'}
          color={periodNet >= 0 ? 'text-blue-700' : 'text-red-700'}
          bg={periodNet >= 0 ? 'bg-blue-50' : 'bg-red-50'}
        />
        <StatCard
          label="💼 Real Uang Perusahaan"
          value={fmtRupiah(realCompanyMoney)}
          sub="Bank − Hutang (semua periode)"
          color={realCompanyMoney >= 0 ? 'text-emerald-700' : 'text-red-700'}
          bg={realCompanyMoney >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
        />
      </div>

      {/* === R158: DOWNLOAD CENTER === */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-blue-200 bg-blue-100/50">
          <h2 className="font-bold text-blue-800">📥 Download Center</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Periode aktif: <strong>{periodLabel}</strong>
            {(from || to) && <span> · {from || '—'} s/d {to || '—'}</span>}
            <span> · {inRangeEntries.length} transaksi</span>
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Cash In Download */}
          <div className="bg-white rounded-lg border border-green-200 p-4">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wider">⬆ Cash In</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{fmtRupiah(periodCashIn)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{cashInEntries.length} transaksi</p>
            <div className="mt-3">
              <DownloadButtons
                filename={`cash-in-${period}${from ? `-${from}` : ''}`}
                title={`Cash In — ${periodLabel}`}
                subtitle={subtitleDate}
                extraInfo={[
                  { label: 'Total Cash In', value: `Rp ${periodCashIn.toLocaleString('id-ID')}` },
                  { label: 'Jumlah Transaksi', value: cashInEntries.length },
                ]}
                columns={detailColumns}
                rows={cashInEntries}
                summary={[
                  { label: 'TOTAL CASH IN', value: `Rp ${periodCashIn.toLocaleString('id-ID')}` },
                ]}
              />
            </div>
          </div>

          {/* Cash Out Download */}
          <div className="bg-white rounded-lg border border-amber-200 p-4">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">⬇ Cash Out</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{fmtRupiah(periodCashOut)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{cashOutEntries.length} transaksi</p>
            <div className="mt-3">
              <DownloadButtons
                filename={`cash-out-${period}${from ? `-${from}` : ''}`}
                title={`Cash Out — ${periodLabel}`}
                subtitle={subtitleDate}
                extraInfo={[
                  { label: 'Total Cash Out', value: `Rp ${periodCashOut.toLocaleString('id-ID')}` },
                  { label: 'Jumlah Transaksi', value: cashOutEntries.length },
                ]}
                columns={detailColumns}
                rows={cashOutEntries}
                summary={[
                  { label: 'TOTAL CASH OUT', value: `Rp ${periodCashOut.toLocaleString('id-ID')}` },
                ]}
              />
            </div>
          </div>

          {/* Cashflow Combined Download */}
          <div className="bg-white rounded-lg border border-blue-200 p-4">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">📊 Cashflow Combined</p>
            <p className={`mt-1 text-2xl font-bold ${periodNet >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
              {fmtRupiah(periodNet)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{inRangeEntries.length} transaksi (in + out)</p>
            <div className="mt-3">
              <DownloadButtons
                filename={`cashflow-${period}${from ? `-${from}` : ''}`}
                title={`Cashflow Combined — ${periodLabel}`}
                subtitle={subtitleDate}
                extraInfo={[
                  { label: 'Total Cash In', value: `Rp ${periodCashIn.toLocaleString('id-ID')}` },
                  { label: 'Total Cash Out', value: `Rp ${periodCashOut.toLocaleString('id-ID')}` },
                  { label: 'Net Cashflow', value: `Rp ${periodNet.toLocaleString('id-ID')}` },
                ]}
                columns={[
                  { key: 'date', label: 'Tanggal', format: 'date' },
                  { key: 'type', label: 'Type' },
                  { key: 'source_label', label: 'Sumber' },
                  { key: 'category', label: 'Kategori' },
                  { key: 'description', label: 'Keterangan' },
                  { key: 'trip_kode', label: 'Trip' },
                  { key: 'amount', label: 'Nominal', align: 'right', format: 'rupiah' },
                ]}
                rows={cashflowCombined}
                summary={[
                  { label: 'TOTAL CASH IN', value: `Rp ${periodCashIn.toLocaleString('id-ID')}` },
                  { label: 'TOTAL CASH OUT', value: `Rp ${periodCashOut.toLocaleString('id-ID')}` },
                  { label: 'NET CASHFLOW', value: `Rp ${periodNet.toLocaleString('id-ID')}` },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SHORTCUT TO OTHER ACCOUNTING SECTIONS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <SectionCard href="/accounting/reports" icon="📊" title="Laporan Bulanan" color="from-indigo-500 to-blue-700" />
        <SectionCard href="/accounting/cash-position" icon="💼" title="Posisi Kas" color="from-emerald-500 to-green-700" />
        <SectionCard href="/accounting/accounts" icon="🏦" title="Bank & Cash" color="from-blue-500 to-blue-700" />
        <SectionCard href="/accounting/groups" icon="📈" title="Real Cashflow per Group" color="from-green-500 to-emerald-700" />
        <SectionCard href="/accounting/balance-sheet" icon="📋" title="Balance Sheet" color="from-purple-500 to-purple-700" />
        <SectionCard href="/accounting/reconcile" icon="🔄" title="Bank Reconciliation" color="from-cyan-500 to-blue-700" />
        <SectionCard href="/accounting/new" icon="➕" title="Entry Manual" color="from-amber-500 to-orange-700" />
      </div>

      {/* === Saldo Bank/Kas (full history, tidak terpengaruh filter) === */}
      <div className="bg-white rounded-xl border border-blue-300 shadow-card overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-200">
          <h2 className="font-bold text-brand-700 flex items-center gap-2">
            🏦 Saldo Bank/Kas
            <span className="text-2xl font-bold text-blue-700">{fmtRupiah(totalBank)}</span>
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Auto-sync semua cash in/out · Saldo total (tidak terpengaruh filter periode)
          </p>
        </div>
        <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="p-2 bg-amber-50 rounded">
            <p className="text-[10px] font-bold text-amber-700 uppercase">🧾 Piutang Peserta</p>
            <p className="mt-0.5 font-bold text-amber-700">{fmtRupiah(piutang)}</p>
          </div>
          <div className="p-2 bg-red-50 rounded">
            <p className="text-[10px] font-bold text-red-700 uppercase">💼 Hutang Vendor</p>
            <p className="mt-0.5 font-bold text-red-700">{fmtRupiah(hutang)}</p>
          </div>
          <div className="p-2 bg-green-50 rounded">
            <p className="text-[10px] font-bold text-green-700 uppercase">📊 Net Equity</p>
            <p className={`mt-0.5 font-bold ${netEquity >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtRupiah(netEquity)}</p>
          </div>
        </div>
      </div>

      {/* TYPE FILTER + TRANSAKSI LIST (preview) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Filter Type</p>
        <div className="flex flex-wrap gap-2 items-center">
          <TypeFilterLink current={filterType} value="all" label="Semua" period={period} from={customFrom} to={customTo} color="bg-brand-500" />
          <TypeFilterLink current={filterType} value="in" label="⬆ Cash In" period={period} from={customFrom} to={customTo} color="bg-green-500" />
          <TypeFilterLink current={filterType} value="out" label="⬇ Cash Out" period={period} from={customFrom} to={customTo} color="bg-amber-500" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-brand-700">Transaksi · {periodLabel} ({filteredForDisplay.length})</h2>
            <p className="text-xs text-slate-500 mt-0.5">Menampilkan max 50 transaksi terbaru</p>
          </div>
          {filteredForDisplay.length > 0 && (
            <DownloadButtons
              filename={`transaksi-${filterType}-${period}`}
              title={`Transaksi ${filterType === 'in' ? 'Cash In' : filterType === 'out' ? 'Cash Out' : 'Semua'} — ${periodLabel}`}
              subtitle={subtitleDate}
              columns={[
                { key: 'date', label: 'Tanggal', format: 'date' },
                { key: 'type', label: 'Type' },
                { key: 'source_label', label: 'Sumber' },
                { key: 'category', label: 'Kategori' },
                { key: 'description', label: 'Keterangan' },
                { key: 'trip_kode', label: 'Trip' },
                { key: 'amount', label: 'Nominal', align: 'right', format: 'rupiah' },
              ]}
              rows={filteredForDisplay}
            />
          )}
        </div>
        {filteredForDisplay.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-sm text-slate-500">Tidak ada transaksi di periode ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredForDisplay.slice(0, 50).map((e) => (
              <div key={e.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${e.type === 'in' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>{e.type === 'in' ? '⬆ IN' : '⬇ OUT'}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        e.source === 'payment' ? 'bg-green-100 text-green-700' :
                        e.source === 'hpp' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {e.source === 'payment' ? '🤝 Peserta' : e.source === 'hpp' ? '💼 Vendor' : '✎ Manual'}
                      </span>
                      {e.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{e.category}</span>}
                      {e.trip_kode !== '-' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700">{e.trip_kode}</span>}
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
            {filteredForDisplay.length > 50 && (
              <div className="p-3 text-center text-xs text-slate-500 bg-slate-50">
                +{filteredForDisplay.length - 50} transaksi lagi · Download untuk lihat semua
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PeriodLink({ current, value, label }) {
  const isActive = current === value;
  return (
    <Link
      href={`/accounting?period=${value}`}
      className={`text-xs font-semibold px-3 py-1.5 rounded ${isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </Link>
  );
}

function TypeFilterLink({ current, value, label, period, from, to, color }) {
  const isActive = current === value;
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (value !== 'all') params.set('type', value);
  return (
    <Link
      href={`/accounting?${params.toString()}`}
      className={`text-xs font-semibold px-3 py-1.5 rounded ${isActive ? `${color} text-white` : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </Link>
  );
}

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
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
