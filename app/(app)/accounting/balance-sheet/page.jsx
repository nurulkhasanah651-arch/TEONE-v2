// Round 159: Balance Sheet + DOWNLOAD (Assets vs Liabilities)
// Path: app/(app)/accounting/balance-sheet/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { fmtRupiah } from '@/lib/utils/format';
import { aggregateAccountBalances, computePiutang, computeHutang, computePnrDeposits } from '@/lib/utils/accounting-aggregator';
import DownloadButtons from '@/components/common/DownloadButtons';

export const dynamic = 'force-dynamic';

export default async function BalanceSheetPage() {
  const supabase = createClient();
  const [accountsRes, accEntriesRes, payRes, passRes, finItemsRes, pnrRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('active', true),
    fetchAll(() => supabase.from('accounting_entries').select('account_id, type, amount')),
    fetchAll(() => supabase.from('participant_payments').select('passenger_id, amount')),
    fetchAll(() => supabase.from('trip_passengers').select('id, price_paid')),
    fetchAll(() => supabase.from('trip_finance_items').select('item_type, total_amount, payment_status')),
    supabase.from('flight_inventory').select('pnr, deposit_total, payoff_amount'),
  ]);

  const accounts = accountsRes.data || [];
  const balances = aggregateAccountBalances(accounts, accEntriesRes || []);
  const totalBankCash = Object.values(balances).reduce((s, b) => s + b.balance, 0);

  const piutang = computePiutang(passRes || [], payRes || []);
  const hutang = computeHutang(finItemsRes || []);
  const pnrDeposits = computePnrDeposits(pnrRes.data || []);

  const assets = [
    { label: 'Bank & Kas', value: totalBankCash, group: 'Aset Lancar' },
    { label: 'Piutang Peserta', value: piutang, group: 'Aset Lancar' },
    { label: 'Deposit PNR (parked at vendor)', value: pnrDeposits, group: 'Aset Tetap' },
  ];
  const totalAssets = assets.reduce((s, a) => s + a.value, 0);

  const liabilities = [
    { label: 'Hutang Vendor (HPP belum lunas)', value: hutang, group: 'Kewajiban Lancar' },
  ];
  const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0);

  const netEquity = totalAssets - totalLiabilities;

  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

  // R159: prep download rows
  const balanceSheetRows = [
    ...accounts.map((a) => ({
      side: 'ASSETS',
      group: 'Aset Lancar - Bank & Kas',
      item: a.name,
      amount: balances[a.id]?.balance || 0,
    })),
    { side: 'ASSETS', group: 'Aset Lancar - Bank & Kas', item: 'Subtotal Bank & Kas', amount: totalBankCash },
    { side: 'ASSETS', group: 'Aset Lancar - Piutang', item: 'Piutang Peserta', amount: piutang },
    { side: 'ASSETS', group: 'Aset Tetap - Deposit', item: 'Deposit PNR (parked at vendor)', amount: pnrDeposits },
    { side: 'ASSETS', group: 'TOTAL', item: 'TOTAL ASSETS', amount: totalAssets },
    { side: 'LIABILITIES', group: 'Kewajiban Lancar', item: 'Hutang Vendor (HPP belum lunas)', amount: hutang },
    { side: 'LIABILITIES', group: 'TOTAL', item: 'TOTAL LIABILITIES', amount: totalLiabilities },
    { side: 'EQUITY', group: 'Net Equity', item: 'Assets − Liabilities', amount: netEquity },
  ];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Balance Sheet</h1>
          <p className="mt-1 text-slate-600">Posisi keuangan per saat ini — Aset vs Kewajiban.</p>
        </div>
        {/* R159: Download Balance Sheet */}
        <DownloadButtons
          filename={`balance-sheet-${today}`}
          title="Balance Sheet"
          subtitle={`Per ${new Date().toLocaleDateString('id-ID')}`}
          extraInfo={[
            { label: 'Total Assets', value: fmtMoney(totalAssets) },
            { label: 'Total Liabilities', value: fmtMoney(totalLiabilities) },
            { label: 'Net Equity', value: fmtMoney(netEquity) },
          ]}
          columns={[
            { key: 'side', label: 'Side' },
            { key: 'group', label: 'Group' },
            { key: 'item', label: 'Item' },
            { key: 'amount', label: 'Amount', align: 'right', format: 'rupiah' },
          ]}
          rows={balanceSheetRows}
          summary={[
            { label: 'TOTAL ASSETS', value: fmtMoney(totalAssets) },
            { label: 'TOTAL LIABILITIES', value: fmtMoney(totalLiabilities) },
            { label: 'NET EQUITY', value: fmtMoney(netEquity) },
          ]}
          buttonSize="md"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ASSETS */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-blue-50">
            <h2 className="font-bold text-blue-800">Assets (Aset)</h2>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="p-4">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Aset Lancar — Bank & Kas</p>
              {accounts.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Belum ada akun bank. <Link href="/accounting/accounts/new" className="text-brand-600 hover:underline font-semibold">+ Tambah akun</Link></p>
              ) : (
                accounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1 text-sm">
                    <span className="text-slate-700">{a.name}</span>
                    <span className={`font-semibold ${(balances[a.id]?.balance || 0) >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{fmtRupiah(balances[a.id]?.balance || 0)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between mt-2 pt-2 border-t border-slate-200 text-sm font-bold">
                <span>Subtotal Bank & Kas</span>
                <span className="text-blue-700">{fmtRupiah(totalBankCash)}</span>
              </div>
            </div>

            <div className="p-4">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Aset Lancar — Piutang</p>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-slate-700">Piutang Peserta (expected − paid)</span>
                <span className="font-semibold text-slate-800">{fmtRupiah(piutang)}</span>
              </div>
              <p className="text-[11px] text-slate-400 italic mt-1">Total yang masih harus dibayar peserta.</p>
            </div>

            <div className="p-4">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Aset Tetap — Deposit</p>
              <div className="flex justify-between py-1 text-sm">
                <span className="text-slate-700">Deposit PNR (parked at vendor)</span>
                <span className="font-semibold text-slate-800">{fmtRupiah(pnrDeposits)}</span>
              </div>
              <p className="text-[11px] text-slate-400 italic mt-1">Total DP + pelunasan ke vendor maskapai.</p>
            </div>

            <div className="p-4 bg-blue-50">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-blue-800">TOTAL ASSETS</span>
                <span className="text-blue-700">{fmtRupiah(totalAssets)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* LIABILITIES + EQUITY */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-red-50">
              <h2 className="font-bold text-red-800">Liabilities</h2>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Hutang Vendor (HPP)</span>
                <span className="font-semibold text-slate-800">{fmtRupiah(hutang)}</span>
              </div>
              <p className="text-[11px] text-slate-400 italic">HPP yang belum lunas / DP.</p>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold">
                <span className="text-red-800">TOTAL LIABILITIES</span>
                <span className="text-red-700">{fmtRupiah(totalLiabilities)}</span>
              </div>
            </div>
          </div>

          <div className={`rounded-xl shadow-card overflow-hidden ${netEquity >= 0 ? 'bg-gradient-to-br from-green-500 to-emerald-700' : 'bg-gradient-to-br from-red-500 to-red-700'} text-white`}>
            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Net Equity</p>
              <p className="mt-1 text-3xl font-bold">{fmtRupiah(netEquity)}</p>
              <p className="text-xs opacity-90 mt-2">Assets − Liabilities</p>
              <p className="text-[11px] opacity-75 mt-1">{fmtRupiah(totalAssets)} − {fmtRupiah(totalLiabilities)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
