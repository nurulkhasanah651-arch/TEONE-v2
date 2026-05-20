import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PnrForm from '@/components/finance/PnrForm';
import { updatePnr } from '@/lib/actions/pnr';

export default async function EditPnrPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: pnr, error } = await supabase.from('flight_inventory').select('*').eq('id', id).maybeSingle();

  if (error || !pnr) notFound();

  const updateThisPnr = updatePnr.bind(null, id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/finance/pnr" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke list</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Edit PNR</h1>
        <p className="mt-1 text-slate-600">
          <span className="font-mono font-bold">{pnr.pnr}</span>
          {pnr.route && ` — ${pnr.route}`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <PnrForm initial={pnr} onSubmit={updateThisPnr} submitLabel="Update PNR" />
      </div>
    </div>
  );
}
