import Link from 'next/link';
import AccountForm from '@/components/accounting/AccountForm';
import { createAccount } from '@/lib/actions/accounts';

export default function NewAccountPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/accounting/accounts" className="text-sm text-brand-600 font-medium hover:underline">← Bank & Cash Accounts</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Tambah Akun Baru</h1>
        <p className="mt-1 text-slate-600">Daftarkan rekening bank, kas, atau e-wallet baru.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <AccountForm onSubmit={createAccount} submitLabel="Tambah Akun" />
      </div>
    </div>
  );
}
