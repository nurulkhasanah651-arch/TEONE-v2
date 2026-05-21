import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AccountForm from '@/components/accounting/AccountForm';
import { updateAccount } from '@/lib/actions/accounts';

export default async function EditAccountPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: account, error } = await supabase.from('accounts').select('*').eq('id', id).maybeSingle();

  if (error || !account) notFound();

  const updateThis = updateAccount.bind(null, id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/accounting/accounts" className="text-sm text-brand-600 font-medium hover:underline">← Bank & Cash Accounts</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Edit Akun</h1>
        <p className="mt-1 text-slate-600">{account.name}</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <AccountForm initial={account} onSubmit={updateThis} submitLabel="Update Akun" />
      </div>
    </div>
  );
}
