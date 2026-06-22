// R169 + R196 + R215: Accounting dashboard + search & filter kategori
// R215: TAMBAH search box + source chip filter + category dropdown
//       Filter periode (Hari/Minggu/Bulan/Tahun/Custom) TETAP utuh
//       Type filter (Semua/Cash In/Cash Out) TETAP utuh
//       AccountingSheetPanel + PaymentRequests TETAP utuh
// Path: app/(app)/accounting/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import PaymentRequests from '@/components/accounting/PaymentRequests';
import DownloadButtons from '@/components/common/DownloadButtons';
import AccountingSheetPanel from '@/components/accounting/AccountingSheetPanel';
import DeleteTxButton from '@/components/accounting/DeleteTxButton';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const res = await promise; return res.data || fallback; } catch { return fallback; }
}

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
    const day = start.getDay() || 7;
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

// R215: helper utk build URL preserving semua params
function buildUrl(base, params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== null && v !== undefined && v !== 'all') {
      sp.set(k, String(v));
    }
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

// R215: helper deteksi keyword DP / Cicilan dari category text
function isDpKeyword(cat) {
  const c = String(cat || '').toLowerCase();
  return /\bdp\b/.test(c) || /down\s*payment/.test(c) || c === 'dp';
}
function isCicilanKeyword(cat) {
  const c = String(cat || '').toLowerCase();
  return /cicil/.test(c) || /\bp[1-9]\b/.test(c) || /pelunasan/.test(c) || /milestone/.test(c);
}

export default async function AccountingDashboard({ searchParams }) {
  const sp = await searchParams;
  const period = sp?.period || 'month';
  const customFrom = sp?.from || '';
  const customTo = sp?.to || '';
  const filterType = sp?.type || 'all';
  // R215 — params baru
  const filterSource = sp?.source || 'all';
  const filterCategory = sp?.category || '';
  const q = (sp?.q || '').trim();

  const { from, to } = getDateRange(period, customFrom, customTo);
  const periodLabel = getPeriodLabel(period);

  const supabase = createClient();

  const [accounts, accEntries, payments, hppLunas, passengers, customers, allFinItems, pnrs, trips, pendingRequests, tlRequests] = await Promise.all([
    safeQuery(supabase.from('accounts').select('*').eq('active', true)),
    safeQuery(supabase.from('accounting_entries').select('*').order('date', { ascending: false })),
    safeQuery(supabase.from('participant_payments').select('*').order('paid_at', { ascending: false, nullsFirst: false })),
    safeQuery(supabase.from('trip_finance_items').select('*').eq('item_type', 'hpp').or('payment_status.eq.lunas,dp_paid.gt.0')),
    safeQuery(supabase.from('trip_passengers').select('id, trip_id, customer_id, price_paid')),
    safeQuery(supabase.from('customers').select('id, name')),
    safeQuery(supabase.from('trip_finance_items').select('item_type, total_amount, payment_status')),
    safeQuery(supabase.from('flight_inventory').select('deposit_total, payoff_amount')),
    safeQuery(supabase.from('trips').select('id, kode_trip, name')),
    safeQuery(supabase.from('trip_finance_items').select('*').eq('item_type', 'hpp').eq('payment_request_status', 'requested').order('payment_requested_at', { ascending: true })),
    safeQuery(supabase.from('tl_payments').select('*').eq('status', 'requested').order('requested_at', { ascending: true })),
  ]);

  const accountBalances = {};
  for (const a of accounts) accountBalances[a.id] = (a.starting_balance || 0);
  for (const e of accEntries) {
    if (!e.account_id || accountBalances[e.account_id] == null) continue;
    if (e.type === 'in') accountBalances[e.account_id] += e.amount || 0;
    else if (e.type === 'out') accountBalances[e.account_id] -= e.amount || 0;
  }
  const manualBankSum = Object.values(accountBalances).reduce((s, b) => s + b, 0);

  let autoCashInAll = 0;
  for (const p of payments) autoCashInAll += Number(p.amount || 0);
  let autoCashOutAll = 0;
  for (const it of hppLunas) {
    // Deposit/HPP yang berasal dari PNR inventory sudah diinput manual sebagai
    // cash out → jangan dihitung lagi di sini biar tidak dobel (tetap tampil di HPP cashflow).
    if (it.pnr_id) continue;
    const paid = Number(it.dp_paid) || 0;
    autoCashOutAll += paid > 0 ? paid : Number(it.total_amount || 0);
  }
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

  // Resolve peserta/customer/trip yg dirujuk pembayaran — atasi cap 1000 baris (peserta sudah ribuan).
  // Tanpa ini, pembayaran peserta baru tampil "Peserta · -" (nama/trip hilang) → seolah tidak masuk.
  const payPaxIds = [...new Set(payments.map((p) => p.passenger_id).filter(Boolean))];
  let paxExtra = [];
  for (let i = 0; i < payPaxIds.length; i += 500) {
    const chunk = payPaxIds.slice(i, i + 500);
    const r = await safeQuery(supabase.from('trip_passengers').select('id, trip_id, customer_id, price_paid').in('id', chunk));
    if (Array.isArray(r)) paxExtra = paxExtra.concat(r);
  }
  const allPax = [...passengers, ...paxExtra];
  const paxMap = Object.fromEntries(allPax.map((p) => [p.id, p]));

  const needCustIds = [...new Set(paxExtra.map((p) => p.customer_id).filter((id) => id && !customers.find((c) => c.id === id)))];
  let custExtra = [];
  for (let i = 0; i < needCustIds.length; i += 500) {
    const chunk = needCustIds.slice(i, i + 500);
    const r = await safeQuery(supabase.from('customers').select('id, name').in('id', chunk));
    if (Array.isArray(r)) custExtra = custExtra.concat(r);
  }
  const custMap = Object.fromEntries([...customers, ...custExtra].map((c) => [c.id, c]));

  const needTripIds = [...new Set(paxExtra.map((p) => p.trip_id).filter((id) => id && !trips.find((t) => t.id === id)))];
  let tripExtra = [];
  if (needTripIds.length) {
    const r = await safeQuery(supabase.from('trips').select('id, kode_trip, name').in('id', needTripIds));
    if (Array.isArray(r)) tripExtra = r;
  }
  const tripMap = Object.fromEntries([...trips, ...tripExtra].map((t) => [t.id, t]));

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
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const it of hppLunas) {
    // Item dari PNR inventory: deposit sudah dicatat manual → jangan tampil sebagai
    // cash out otomatis (hindari dobel). Tetap muncul di HPP cashflow per-trip.
    if (it.pnr_id) continue;
    const dpPaid = Number(it.dp_paid) || 0;
    const amount = dpPaid > 0 ? dpPaid : Number(it.total_amount || 0);
    if (amount <= 0) continue;

    const dateRaw =
      it.transfer_date ||
      it.payoff_date ||
      it.payment_approved_at ||
      it.updated_at ||
      todayStr;
    const date = String(dateRaw).slice(0, 10);

    const isRefund = (it.category || '').toLowerCase().includes('refund');
    const status = String(it.payment_status || '').toLowerCase();
    const statusLabel = status === 'lunas' ? '✅ Lunas' : (status.includes('dp') ? '🟡 DP' : '');

    allEntries.push({
      id: `hpp_${it.id}`,
      type: 'out',
      amount,
      date,
      category: it.category || 'HPP',
      description: `${it.component}${statusLabel ? ' · ' + statusLabel : ''}${it.vendor_name ? ' · ' + it.vendor_name : ''}`,
      trip_kode: tripMap[it.trip_id] ? (tripMap[it.trip_id].kode_trip || `#${it.trip_id}`) : '-',
      trip_name: tripMap[it.trip_id] ? tripMap[it.trip_id].name : '-',
      source: 'hpp',
      source_label: isRefund ? 'Refund' : 'Vendor',
    });
  }

  const hppItemIdsInLunas = new Set(hppLunas.map((it) => it.id));
  const paymentIdsCovered = new Set(payments.map((p) => p.id));

  for (const m of accEntries) {
    if (!m.amount || m.amount <= 0) continue;
    if (m.linked_finance_item_id && hppItemIdsInLunas.has(m.linked_finance_item_id)) continue;
    if (m.linked_payment_id && paymentIdsCovered.has(m.linked_payment_id)) continue;
    if (m.source === 'tl_payment') continue;

    const dateRaw = m.date || m.created_at || todayStr;
    const date = String(dateRaw).slice(0, 10);

    const isOrphanLinked = m.linked_finance_item_id || m.linked_payment_id;

    allEntries.push({
      id: `man_${m.id}`,
      type: m.type,
      amount: Number(m.amount) || 0,
      date,
      category: m.category || 'Manual',
      description: m.description || '-',
      trip_kode: m.trip_id && tripMap[m.trip_id] ? (tripMap[m.trip_id].kode_trip || `#${m.trip_id}`) : '-',
      trip_name: m.trip_id && tripMap[m.trip_id] ? tripMap[m.trip_id].name : '-',
      source: isOrphanLinked ? 'auto' : 'manual',
      source_label: isOrphanLinked ? (m.linked_finance_item_id ? 'Auto Vendor' : 'Auto Peserta') : 'Manual',
    });
  }

  let inRangeEntries = allEntries;
  if (from || to) {
    inRangeEntries = allEntries.filter((e) => isInRange(e.date, from, to));
  }

  // R215: derive list kategori unique untuk dropdown (dari data in-range supaya relevan)
  const allCategoriesSet = new Set();
  for (const e of inRangeEntries) {
    if (e.category) allCategoriesSet.add(e.category);
  }
  const allCategories = Array.from(allCategoriesSet).sort((a, b) => a.localeCompare(b));

  // R215: filter logic
  let filteredForDisplay = inRangeEntries;

  // Type filter (Cash In / Out / Semua)
  if (filterType === 'in') filteredForDisplay = filteredForDisplay.filter((e) => e.type === 'in');
  if (filterType === 'out') filteredForDisplay = filteredForDisplay.filter((e) => e.type === 'out');

  // R215 — Source filter (Peserta/Vendor/Manual/Refund + virtual: payment_dp, payment_cicilan)
  if (filterSource === 'payment_dp') {
    filteredForDisplay = filteredForDisplay.filter((e) => e.source === 'payment' && isDpKeyword(e.category));
  } else if (filterSource === 'payment_cicilan') {
    filteredForDisplay = filteredForDisplay.filter((e) => e.source === 'payment' && isCicilanKeyword(e.category));
  } else if (filterSource === 'refund') {
    filteredForDisplay = filteredForDisplay.filter((e) =>
      String(e.source_label || '').toLowerCase() === 'refund' ||
      String(e.category || '').toLowerCase().includes('refund') ||
      String(e.description || '').toLowerCase().includes('refund')
    );
  } else if (filterSource === 'ongkir') {
    filteredForDisplay = filteredForDisplay.filter((e) =>
      String(e.category || '').toLowerCase().includes('ongkir') ||
      String(e.description || '').toLowerCase().includes('ongkir')
    );
  } else if (filterSource === 'tiket') {
    filteredForDisplay = filteredForDisplay.filter((e) =>
      String(e.category || '').toLowerCase().includes('tiket') ||
      String(e.description || '').toLowerCase().includes('tiket') ||
      String(e.description || '').toLowerCase().includes('maskapai') ||
      String(e.description || '').toLowerCase().includes('pnr')
    );
  } else if (filterSource !== 'all') {
    filteredForDisplay = filteredForDisplay.filter((e) => e.source === filterSource);
  }

  // R215 — Category dropdown (exact match)
  if (filterCategory) {
    filteredForDisplay = filteredForDisplay.filter((e) =>
      String(e.category || '').toLowerCase() === filterCategory.toLowerCase()
    );
  }

  // R215 — Search free text
  if (q) {
    const ql = q.toLowerCase();
    filteredForDisplay = filteredForDisplay.filter((e) =>
      String(e.description || '').toLowerCase().includes(ql) ||
      String(e.category || '').toLowerCase().includes(ql) ||
      String(e.trip_kode || '').toLowerCase().includes(ql) ||
      String(e.trip_name || '').toLowerCase().includes(ql) ||
      String(e.source_label || '').toLowerCase().includes(ql)
    );
  }

  filteredForDisplay.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const cashInEntries = inRangeEntries.filter((e) => e.type === 'in');
  const cashOutEntries = inRangeEntries.filter((e) => e.type === 'out');
  const periodCashIn = cashInEntries.reduce((s, e) => s + e.amount, 0);
  const periodCashOut = cashOutEntries.reduce((s, e) => s + e.amount, 0);
  const periodNet = periodCashIn - periodCashOut;

  // R215: subtotal yg ke-filter (in/out terpisah biar user tau dampaknya)
  const filteredCashIn = filteredForDisplay.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0);
  const filteredCashOut = filteredForDisplay.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0);

  cashInEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  cashOutEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const subtitleDate = from && to
    ? `${periodLabel} · ${from} s/d ${to}`
    : from
      ? `${periodLabel} · sejak ${from}`
      : periodLabel;

  // R215: aktif filter detection
  const hasActiveFilter = filterSource !== 'all' || filterCategory || q;

  // R215: common params utk semua link (preserve filter state)
  const commonParams = {
    period,
    from: customFrom,
    to: customTo,
    type: filterType,
    source: filterSource,
    category: filterCategory,
    q,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Accounting</h1>
        <p className="mt-1 text-slate-600">Posisi keuangan real-time + laporan bisa di-download.</p>
      </div>

      <PaymentRequests
        requests={pendingRequests}
        tlRequests={tlRequests}
        accounts={accounts}
        trips={trips}
      />

      <AccountingSheetPanel />

      {/* PERIODE FILTER */}
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

        <form action="/accounting" method="get" className="mt-3 flex items-center gap-2 flex-wrap">
          <input autoComplete="off" type="hidden" name="period" value="custom" />
          <label className="text-[11px] font-bold text-slate-700">Custom:</label>
          <input autoComplete="off" type="date" name="from" defaultValue={customFrom || from} className="px-2 py-1 border border-slate-300 rounded text-xs" />
          <span className="text-xs text-slate-500">s/d</span>
          <input autoComplete="off" type="date" name="to" defaultValue={customTo || to} className="px-2 py-1 border border-slate-300 rounded text-xs" />
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <SectionCard href="/accounting/reports" icon="📊" title="Laporan Bulanan" color="from-indigo-500 to-blue-700" />
        <SectionCard href="/accounting/cash-position" icon="💼" title="Posisi Kas" color="from-emerald-500 to-green-700" />
        <SectionCard href="/accounting/accounts" icon="🏦" title="Bank & Cash" color="from-blue-500 to-blue-700" />
        <SectionCard href="/accounting/groups" icon="📈" title="Real Cashflow per Group" color="from-green-500 to-emerald-700" />
        <SectionCard href="/accounting/balance-sheet" icon="📋" title="Balance Sheet" color="from-purple-500 to-purple-700" />
        <SectionCard href="/accounting/reconcile" icon="🔄" title="Bank Reconciliation" color="from-cyan-500 to-blue-700" />
        <SectionCard href="/accounting/pajak" icon="🧾" title="Pajak Tahunan" color="from-rose-500 to-red-700" />
        <SectionCard href="/accounting/new" icon="➕" title="Entry Manual" color="from-amber-500 to-orange-700" />
      </div>

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

      {/* TYPE FILTER (existing) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Filter Type</p>
        <div className="flex flex-wrap gap-2 items-center">
          <TypeFilterLink current={filterType} value="all" label="Semua" common={commonParams} color="bg-brand-500" />
          <TypeFilterLink current={filterType} value="in" label="⬆ Cash In" common={commonParams} color="bg-green-500" />
          <TypeFilterLink current={filterType} value="out" label="⬇ Cash Out" common={commonParams} color="bg-amber-500" />
        </div>
      </div>

      {/* R215: KATEGORI & SEARCH PANEL */}
      <div className="bg-white rounded-xl border-2 border-amber-200 shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">🔍 Filter Kategori & Search</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Pilih sumber spesifik atau ketik nama peserta/vendor untuk filter detail</p>
          </div>
          {hasActiveFilter && (
            <Link
              href={buildUrl('/accounting', { period, from: customFrom, to: customTo, type: filterType })}
              className="text-[11px] font-semibold px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded"
            >
              ✕ Reset semua filter
            </Link>
          )}
        </div>

        {/* Quick source chips */}
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Sumber / Jenis Transaksi:</p>
          <div className="flex flex-wrap gap-1.5">
            <SourceLink current={filterSource} value="all" label="🌐 Semua Sumber" common={commonParams} color="bg-brand-500" />
            <SourceLink current={filterSource} value="payment" label="🤝 Semua Peserta" common={commonParams} color="bg-green-500" />
            <SourceLink current={filterSource} value="payment_dp" label="💰 DP Peserta" common={commonParams} color="bg-emerald-500" />
            <SourceLink current={filterSource} value="payment_cicilan" label="👤 Cicilan / Pelunasan" common={commonParams} color="bg-teal-500" />
            <SourceLink current={filterSource} value="hpp" label="✈️ Vendor / HPP" common={commonParams} color="bg-amber-500" />
            <SourceLink current={filterSource} value="tiket" label="🎫 Tiket / PNR" common={commonParams} color="bg-orange-500" />
            <SourceLink current={filterSource} value="ongkir" label="📦 Ongkir" common={commonParams} color="bg-purple-500" />
            <SourceLink current={filterSource} value="refund" label="💸 Refund" common={commonParams} color="bg-red-500" />
            <SourceLink current={filterSource} value="manual" label="✎ Manual" common={commonParams} color="bg-slate-500" />
          </div>
        </div>

        {/* Search + Category dropdown */}
        <form action="/accounting" method="get" className="flex flex-wrap gap-2 items-end pt-2 border-t border-amber-100">
          {period && <input autoComplete="off" type="hidden" name="period" value={period} />}
          {customFrom && <input autoComplete="off" type="hidden" name="from" value={customFrom} />}
          {customTo && <input autoComplete="off" type="hidden" name="to" value={customTo} />}
          {filterType && filterType !== 'all' && <input autoComplete="off" type="hidden" name="type" value={filterType} />}
          {filterSource && filterSource !== 'all' && <input autoComplete="off" type="hidden" name="source" value={filterSource} />}

          <div className="flex-1 min-w-[220px]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
              🔎 Cari (peserta / vendor / kode trip / kategori):
            </label>
            <input autoComplete="off"
              type="text"
              name="q"
              defaultValue={q}
              placeholder="contoh: zazan, Tiket Maskapai, 4UW2CS, ..."
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <div className="min-w-[200px]">
            <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
              📂 Kategori spesifik:
            </label>
            <select
              name="category"
              defaultValue={filterCategory}
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
            >
              <option value="">— Semua Kategori —</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded"
          >
            🔍 Apply
          </button>
        </form>

        {/* Active filter badge */}
        {hasActiveFilter && (
          <div className="text-xs bg-amber-50 border border-amber-200 px-3 py-2 rounded space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-800">📊 Filter aktif:</span>
              {filterSource !== 'all' && (
                <span className="font-mono text-amber-700 bg-white px-1.5 py-0.5 rounded border border-amber-300">
                  sumber={filterSource}
                </span>
              )}
              {filterCategory && (
                <span className="font-mono text-amber-700 bg-white px-1.5 py-0.5 rounded border border-amber-300">
                  kategori={filterCategory}
                </span>
              )}
              {q && (
                <span className="font-mono text-amber-700 bg-white px-1.5 py-0.5 rounded border border-amber-300">
                  cari="{q}"
                </span>
              )}
            </div>
            <div className="flex gap-3 flex-wrap">
              <span className="text-amber-700">
                <strong>{filteredForDisplay.length}</strong> hasil
              </span>
              <span className="text-green-700">
                ⬆ Cash In ter-filter: <strong>{fmtRupiah(filteredCashIn)}</strong>
              </span>
              <span className="text-red-700">
                ⬇ Cash Out ter-filter: <strong>{fmtRupiah(filteredCashOut)}</strong>
              </span>
              <span className={filteredCashIn - filteredCashOut >= 0 ? 'text-blue-700' : 'text-red-700'}>
                Net: <strong>{fmtRupiah(filteredCashIn - filteredCashOut)}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* TRANSAKSI LIST */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-brand-700">
              Transaksi · {periodLabel} ({filteredForDisplay.length})
              {hasActiveFilter && <span className="text-xs ml-2 text-amber-700 font-semibold">[FILTERED]</span>}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Menampilkan max 50 transaksi terbaru</p>
          </div>
          {filteredForDisplay.length > 0 && (
            <DownloadButtons
              filename={`transaksi-${filterType}-${filterSource}-${period}${filterCategory ? '-' + filterCategory.replace(/\s+/g, '_') : ''}`}
              title={`Transaksi ${filterType === 'in' ? 'Cash In' : filterType === 'out' ? 'Cash Out' : 'Semua'} — ${periodLabel}${hasActiveFilter ? ' (filtered)' : ''}`}
              subtitle={`${subtitleDate}${hasActiveFilter ? ` · Filter: ${[filterSource !== 'all' && filterSource, filterCategory, q && `cari "${q}"`].filter(Boolean).join(' · ')}` : ''}`}
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
              summary={[
                { label: 'TOTAL CASH IN', value: fmtRupiah(filteredCashIn) },
                { label: 'TOTAL CASH OUT', value: fmtRupiah(filteredCashOut) },
                { label: 'NET', value: fmtRupiah(filteredCashIn - filteredCashOut) },
              ]}
            />
          )}
        </div>
        {filteredForDisplay.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-sm text-slate-500">
              Tidak ada transaksi {hasActiveFilter ? 'yang match filter' : 'di periode ini'}.
            </p>
            {hasActiveFilter && (
              <Link
                href={buildUrl('/accounting', { period, from: customFrom, to: customTo, type: filterType })}
                className="inline-block mt-3 text-xs font-semibold px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded"
              >
                ✕ Reset filter
              </Link>
            )}
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
                  <div className="flex items-center gap-2 shrink-0">
                    <p className={`text-lg font-bold ${e.type === 'in' ? 'text-green-700' : 'text-amber-700'}`}>
                      {e.type === 'in' ? '+' : '−'} {fmtRupiah(e.amount)}
                    </p>
                    <DeleteTxButton source={e.source} id={e.id} label={e.description} />
                  </div>
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

// R215: TypeFilterLink — preserve source, category, q
function TypeFilterLink({ current, value, label, common, color }) {
  const isActive = current === value;
  const params = {
    period: common.period,
    from: common.from,
    to: common.to,
    type: value,
    source: common.source,
    category: common.category,
    q: common.q,
  };
  return (
    <Link
      href={buildUrl('/accounting', params)}
      className={`text-xs font-semibold px-3 py-1.5 rounded ${isActive ? `${color} text-white` : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </Link>
  );
}

// R215: SourceLink — chip filter by sumber
function SourceLink({ current, value, label, common, color }) {
  const isActive = current === value;
  const params = {
    period: common.period,
    from: common.from,
    to: common.to,
    type: common.type,
    source: value,
    category: common.category,
    q: common.q,
  };
  return (
    <Link
      href={buildUrl('/accounting', params)}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded transition ${isActive ? `${color} text-white shadow` : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
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
