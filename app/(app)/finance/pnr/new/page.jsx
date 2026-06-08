import Link from 'next/link';
import PnrForm from '@/components/finance/PnrForm';
import { createPnr } from '@/lib/actions/pnr';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewPnrPage() {
  const supabase = createClient();
  const { data: trips } = await supabase
    .from('trips').select('id, kode_trip, name, departure, status')
    .order('departure', { ascending: false, nullsFirst: false });
  const activeTrips = (trips || []).filter((t) => t.status !== 'completed' && t.status !== 'cancelled');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/finance/pnr" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke list</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Tambah PNR Baru</h1>
        <p className="mt-1 text-slate-600">Deposit tiket group (PNR) atau tiket FIT yang dibeli setelah trip jadi.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <PnrForm onSubmit={createPnr} submitLabel="Tambah PNR" trips={activeTrips} />
      </div>
    </div>
  );
}
