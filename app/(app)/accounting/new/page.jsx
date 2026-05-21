import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import AccountingForm from './AccountingForm';

export default async function NewAccountingPage() {
  const supabase = createClient();
  const [tripsRes, accountsRes, hppRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name').order('departure', { ascending: false, nullsFirst: false }),
    supabase.from('accounts').select('id, name, type, active').order('name'),
    // Ambil HPP items yang belum lunas — buat picker di cash out
    supabase
      .from('trip_finance_items')
      .select('id, trip_id, category, component, total_amount, vendor_name, payment_status, notes')
      .eq('item_type', 'hpp'),
  ]);

  // Filter active client-side — defaults to active=true if column missing/null
  const activeAccounts = (accountsRes.data || []).filter((a) => a.active !== false);

  // Hanya tampilkan HPP yang belum lunas (status null / 'belum bayar' / 'DP')
  const unpaidHpp = (hppRes.data || []).filter((h) => h.payment_status !== 'lunas');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Tambah Entry Manual</h1>
        <p className="mt-1 text-slate-600">Cash IN/OUT. Cash OUT bisa di-link ke HPP item finance — auto-mark lunas saat save.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <AccountingForm
          trips={tripsRes.data || []}
          accounts={activeAccounts}
          hppItems={unpaidHpp}
        />
      </div>
    </div>
  );
}
