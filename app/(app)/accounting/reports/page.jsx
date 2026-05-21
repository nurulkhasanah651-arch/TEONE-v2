// Monthly financial reports — Income Statement (P&L), Cash Flow, Per-Account Activity

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import { buildMonthlyReport } from '@/lib/utils/monthly-report';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function MonthlyReportsPage({ searchParams }) {
  const sp = await searchParams;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = sp?.month || currentMonth;
  const prevMonth = shiftMonth(month, -1);

  const supabase = createClient();
  const [payRes, hppRes, accEntRes, accountsRes] = await Promise.all([
    supabase.from('participant_payments').select('amount, paid_at'),
    supabase.from('trip_finance_items').select('total_amount, payment_status, payoff_date, dp_date, category, component').eq('item_type', 'hpp').eq('payment_status', 'lunas'),
    supabase.from('accounting_entries').select('type, amount, category, date, account_id, description'),
    supabase.from('accounts').select('*').eq('active', true),
  ]);

  const payments = payRes.data || [];
  const hppLunas = hppRes.data || [];
  const accEntries = accEntRes.data || [];
  const accounts = accountsRes.data || [];

  const report = buildMonthlyReport({ month, payments, hppLunas, accEntries, accounts });
  const prevReport = buildMonthlyReport({ month: prevMonth, payments, hppLunas, accEntries, accounts });

  // 6-month chart data
  const chartData = [];
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(currentMonth, -i);
    const r = buildMonthlyReport({ month: m, payments, hppLunas, accEntries, accounts });
    chartData.push({ month: m, label: fmtMonth(m), revenue: r.totalRevenue, profit: r.netProfit });
  }
  const chartMax = Math.max(...chartData.map((c) => Math.max(c.revenue, Math.abs(c.profit))), 1);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Laporan Keuangan Bulanan</h1>
          <p className="mt-1 text-slate-600">Income Statement, Cash Flow, Per-Account Activity untuk <strong>{fmtMonth(month)}</strong></p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/accounting/reports?month=${shiftMonth(month, -1)}`} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg">← Sebelumnya</Link>
          <span className="px-4 py-2 bg-brand-500 text-white text-sm font-bold rounded-lg">{fmtMonth(month)}</span>
          <Link href={`/accounting/reports?month=${shiftMonth(month, 1)}`} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg">Berikutnya →</Link>
          {month !== currentMonth && (
            <Link href={`/accounting/reports`} className="px-3 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-semibold rounded-lg">Hari Ini</Link>
          )}
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Revenue" value={fmtRupiah(report.totalRevenue)} prev={prevReport.totalRevenue} color="text-green-700" bg="bg-green-50" />
        <StatCard label="COGS (HPP)" value={fmtRupiah(report.cogs)} prev={prevReport.cogs} color="text-amber-700" bg="bg-amber-50" inverted />
        <StatCard label="Gross Profit" value={fmtRupiah(report.grossProfit)} prev={prevReport.grossProfit} color="text-blue-700" bg="bg-blue-50" subtext={`${report.grossMargin.toFixed(1)}% margin`} />
        <StatCard label="Net Profit" value={fmtRupiah(report.netProfit)} prev={prevReport.netProfit} color={report.netProfit >= 0 ? 'text-purple-700' : 'text-red-700'} bg={report.netProfit >= 0 ? 'bg-purple-50' : 'bg-red-50'} subtext={`${report.netMargin.toFixed(1)}% margin`} />
      </div>

      {/* 6-month trend */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">Trend 6 Bulan Terakhir</h3>
        <div className="grid grid-cols-6 gap-2">
          {chartData.map((c) => {
            const revH = (c.revenue / chartMax) * 100;
            const profH = (Math.abs(c.profit) / chartMax) * 100;
            const isCurrent = c.month === month;
            return (
              <Link key={c.month} href={`/accounting/reports?month=${c.month}`} className={`block ${isCurrent ? 'ring-2 ring-brand-500 rounded-lg' : ''}`}>
                <div className="flex items-end justify-center gap-1 h-24 mb-1">
                  <div className="w-3 bg-green-400 rounded-t transition-all" style={{ height: `${revH}%`, minHeight: '2px' }} title={`Revenue: ${fmtRupiah(c.revenue)}`} />
                  <div className={`w-3 rounded-t transition-all ${c.profit >= 0 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ height: `${profH}%`, minHeight: '2px' }} title={`Profit: ${fmtRupiah(c.profit)}`} />
                </div>
                <p className="text-[10px] text-center font-semibold text-slate-600">{c.label}</p>
                <p className="text-[10px] text-center text-slate-400">{(c.revenue / 1_000_000).toFixed(0)}jt</p>
              </Link>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-slate-500">
          <span><span className="inline-block w-2 h-2 bg-green-400 mr-1 rounded" />Revenue</span>
          <span><span className="inline-block w-2 h-2 bg-blue-500 mr-1 rounded" />Profit (positif)</span>
          <span><span className="inline-block w-2 h-2 bg-red-500 mr-1 rounded" />Loss</span>
        </div>
      </div>

      {/* Income Statement & Cash Flow side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* P&L */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-blue-50">
            <h2 className="font-bold text-blue-800">📊 Income Statement (Laba Rugi)</h2>
            <p className="text-xs text-blue-600">{fmtMonth(month)}</p>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <SectionTitle>Revenue</SectionTitle>
            <Row label="Pendapatan Trip (Payment Peserta)" value={report.tripRevenue} />
            <Row label="Pendapatan Lain (Komisi, Bunga, dll)" value={report.otherIncome} muted />
            <SubTotal label="Total Revenue" value={report.totalRevenue} color="text-green-700" />

            <SectionTitle className="mt-4">COGS — Cost of Goods Sold</SectionTitle>
            {Object.entries(report.cogsByCategory).length === 0 ? (
              <p className="text-xs text-slate-400 italic pl-2">Tidak ada HPP lunas bulan ini</p>
            ) : (
              Object.entries(report.cogsByCategory).map(([cat, amt]) => (
                <Row key={cat} label={cat} value={amt} muted />
              ))
            )}
            <SubTotal label="Total COGS" value={report.cogs} color="text-amber-700" />

            <div className="my-3 border-t-2 border-slate-200" />
            <Row label="GROSS PROFIT" value={report.grossProfit} bold color={report.grossProfit >= 0 ? 'text-blue-700' : 'text-red-700'} subtext={`${report.grossMargin.toFixed(1)}% margin`} />

            <SectionTitle className="mt-4">Operating Expenses</SectionTitle>
            {Object.entries(report.opexByCategory).length === 0 ? (
              <p className="text-xs text-slate-400 italic pl-2">Tidak ada OPEX bulan ini</p>
            ) : (
              Object.entries(report.opexByCategory).map(([cat, amt]) => (
                <Row key={cat} label={cat} value={amt} muted />
              ))
            )}
            <SubTotal label="Total OPEX" value={report.opex} color="text-amber-700" />

            <div className="my-3 border-t-2 border-slate-200" />
            <Row label="OPERATING PROFIT" value={report.operatingProfit} bold color={report.operatingProfit >= 0 ? 'text-blue-700' : 'text-red-700'} subtext={`${report.operatingMargin.toFixed(1)}% margin`} />

            {(report.financingIn > 0 || report.otherOut > 0) && (
              <>
                <SectionTitle className="mt-4">Non-Operating</SectionTitle>
                {report.financingIn > 0 && <Row label="Pinjaman / Investasi Masuk" value={report.financingIn} muted />}
                {report.otherOut > 0 && <Row label="Pengeluaran Lain" value={-report.otherOut} muted />}
              </>
            )}

            <div className="my-3 border-t-4 border-slate-300" />
            <Row label="NET PROFIT" value={report.netProfit} bold xl color={report.netProfit >= 0 ? 'text-purple-700' : 'text-red-700'} subtext={`${report.netMargin.toFixed(1)}% net margin`} />
          </div>
        </div>

        {/* Cash Flow */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-green-50">
            <h2 className="font-bold text-green-800">💰 Cash Flow Statement</h2>
            <p className="text-xs text-green-600">{fmtMonth(month)}</p>
          </div>
          <div className="p-5 space-y-3 text-sm">
            <SectionTitle>Cash IN</SectionTitle>
            <Row label="Payment Peserta" value={report.tripRevenue} muted />
            <Row label="Other Income (Komisi, dll)" value={report.otherIncome} muted />
            <Row label="Financing (Pinjaman/Investasi)" value={report.financingIn} muted />
            <SubTotal label="Total Cash IN" value={report.totalCashIn} color="text-green-700" />

            <SectionTitle className="mt-4">Cash OUT</SectionTitle>
            <Row label="HPP (Vendor lunas)" value={-report.cogs} muted />
            <Row label="OPEX (Gaji, Sewa, dll)" value={-report.opex} muted />
            {report.otherOut > 0 && <Row label="Other Outflows" value={-report.otherOut} muted />}
            <SubTotal label="Total Cash OUT" value={report.totalCashOut} color="text-amber-700" />

            <div className="my-3 border-t-4 border-slate-300" />
            <Row label="NET CASH FLOW" value={report.netCashFlow} bold xl color={report.netCashFlow >= 0 ? 'text-green-700' : 'text-red-700'} />

            <SectionTitle className="mt-4">Aktivitas per Akun</SectionTitle>
            {accounts.length === 0 ? (
              <p className="text-xs text-slate-400 italic pl-2">Belum ada akun bank. <Link href="/accounting/accounts/new" className="text-brand-600 hover:underline">+ Tambah</Link></p>
            ) : (
              accounts.map((a) => {
                const f = report.accountFlow[a.id];
                if (!f || f.count === 0) {
                  return (
                    <div key={a.id} className="flex justify-between py-1 text-slate-400">
                      <span>{a.name}</span>
                      <span className="text-xs italic">Tidak ada aktivitas</span>
                    </div>
                  );
                }
                return (
                  <div key={a.id} className="py-2 px-3 bg-slate-50 rounded-lg">
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>{a.name}</span>
                      <span className={f.net >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtRupiah(f.net)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 mt-0.5">
                      <span>IN {fmtRupiah(f.in)} · OUT {fmtRupiah(f.out)}</span>
                      <span>{f.count} txn</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Activity summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">Aktivitas Bulan Ini</h3>
        <div className="grid grid-cols-3 gap-3">
          <ActivityCard label="Payment Peserta" value={report.paymentCount} desc="transaksi" />
          <ActivityCard label="HPP Vendor Lunas" value={report.hppCount} desc="invoice dibayar" />
          <ActivityCard label="Entry Manual" value={report.manualEntryCount} desc="cash in/out manual" />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, className = '' }) {
  return <p className={`text-[11px] font-bold text-slate-600 uppercase tracking-wider ${className}`}>{children}</p>;
}

function Row({ label, value, muted, bold, xl, color = 'text-slate-700', subtext }) {
  return (
    <div className={`flex justify-between items-baseline ${muted ? 'pl-3 text-slate-600' : ''}`}>
      <span className={`${bold ? 'font-bold uppercase tracking-wider' : ''} ${xl ? 'text-base' : ''}`}>
        {label}
      </span>
      <div className="text-right">
        <span className={`${bold ? 'font-bold' : 'font-semibold'} ${xl ? 'text-xl' : ''} ${color}`}>{fmtRupiah(value)}</span>
        {subtext && <p className="text-[10px] text-slate-400">{subtext}</p>}
      </div>
    </div>
  );
}

function SubTotal({ label, value, color }) {
  return (
    <div className="flex justify-between items-center pt-1 border-t border-slate-200 mt-1">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{fmtRupiah(value)}</span>
    </div>
  );
}

function StatCard({ label, value, prev, color, bg, subtext, inverted }) {
  const change = prev != null ? value : null;
  const numValue = typeof value === 'string' ? 0 : value;
  // Compute change %
  let pct = null;
  if (typeof prev === 'number' && prev !== 0) {
    pct = ((numValue - prev) / Math.abs(prev)) * 100;
  }
  const isGood = inverted ? pct !== null && pct < 0 : pct !== null && pct > 0;

  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }) : value}</p>
      {subtext && <p className="text-[10px] text-slate-500 mt-0.5">{subtext}</p>}
      {pct !== null && (
        <p className={`text-[10px] mt-0.5 font-semibold ${isGood ? 'text-green-600' : pct === 0 ? 'text-slate-400' : 'text-red-600'}`}>
          {pct > 0 ? '↑' : pct < 0 ? '↓' : '→'} {Math.abs(pct).toFixed(1)}% vs bulan lalu
        </p>
      )}
    </div>
  );
}

function ActivityCard({ label, value, desc }) {
  return (
    <div className="p-3 bg-slate-50 rounded-lg text-center">
      <p className="text-2xl font-bold text-brand-700">{value}</p>
      <p className="text-xs font-semibold text-slate-700 mt-0.5">{label}</p>
      <p className="text-[10px] text-slate-500">{desc}</p>
    </div>
  );
}
