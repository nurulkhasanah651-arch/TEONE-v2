import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import AccountingForm from './AccountingForm';

export default async function NewAccountingPage() {
  const supabase = createClient();
  const [tripsRes, accountsRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name').order('departure', { ascending: false, nullsFirst: false }),
    supabase.from('accounts').select('id, name, type').eq('active', true).order('sort_order').order('name'),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Tambah Entry Manual</h1>
        <p className="mt-1 text-slate-600">Untuk cash in/out dari sumber selain Payment & HPP.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <AccountingForm trips={tripsRes.data || []} accounts={accountsRes.data || []} />
      </div>
    </div>
  );
}
