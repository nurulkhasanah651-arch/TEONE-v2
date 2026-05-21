// Bank/cash accounts management

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import { aggregateAccountBalances } from '@/lib/utils/accounting-aggregator';
import AccountRow from '@/components/accounting/AccountRow';

export const dynamic = 'force-dynamic';

const TYPE_LABEL = {
  bank:     { label: 'Bank',      icon: '🏦', bg: 'bg-blue-50',   text: 'text-blue-700' },
  cash:     { label: 'Kas',       icon: '💵', bg: 'bg-green-50',  text: 'text-green-700' },
  'e-wallet': { label: 'E-Wallet', icon: '📱', bg: 'bg-purple-50', text: 'text-purple-700' },
  other:    { label: 'Lainnya',   icon: '💰', bg: 'bg-slate-100', text: 'text-slate-700' },
};

export default async function AccountsPage() {
  const supabase = createClient();
  const [accountsRes, entriesRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('active', true).order('sort_order', { ascending: true }).order('name'),
    supabase.from('accounting_entries').select('account_id, type, amount'),
  ]);

  const accounts = accountsRes.data || [];
  const balances = aggregateAccountBalances(accounts, entriesRes.data || []);
  const totalBalance = Object.values(balances).reduce((s, b) => s + b.balance, 0);

  // Group by type
  const grouped = { bank: [], cash: [], 'e-wallet': [], other: [] };
  for (const a of accounts) {
    const type = grouped[a.type] ? a.type : 'other';
    grouped[type].push({ ...a, ...balances[a.id] });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Bank & Cash Accounts</h1>
          <p className="mt-1 text-slate-600">Saldo per akun bank/kas. Saldo = starting balance + sum cash in − sum cash out.</p>
        </div>
        <Link href="/accounting/accounts/new" className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2">
          <span>+</span> Tambah Akun
        </Link>
      </div>

      <div className="bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl p-6 shadow-card text-white">
        <p className="text-xs font-bold uppercase tracking-wider opacity-80">Total Saldo Semua Akun</p>
        <p className="mt-1 text-4xl font-bold">{fmtRupiah(totalBalance)}</p>
        <p className="text-xs opacity-80 mt-1">{accounts.length} akun aktif</p>
      </div>

      {Object.entries(grouped).map(([type, list]) => {
        if (list.length === 0) return null;
        const cfg = TYPE_LABEL[type] || TYPE_LABEL.other;
        return (
          <section key={type} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            <div className={`px-5 py-3 border-b border-slate-200 ${cfg.bg}`}>
              <h2 className={`font-bold ${cfg.text} flex items-center gap-2`}>
                <span>{cfg.icon}</span> {cfg.label} ({list.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {list.map((a) => <AccountRow key={a.id} account={a} />)}
            </div>
          </section>
        );
      })}

      {accounts.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-4xl mb-3">🏦</p>
          <p className="text-lg font-bold text-slate-700">Belum ada akun</p>
          <p className="mt-1 text-sm text-slate-500">Klik "Tambah Akun" untuk daftarkan bank Mandiri, BCA, Kas Kecil, dll.</p>
        </div>
      )}
    </div>
  );
}
