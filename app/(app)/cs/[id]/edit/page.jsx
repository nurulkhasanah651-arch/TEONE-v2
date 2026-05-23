// Edit existing CS Daily Update — simple form (no participants — those are managed in trip detail)

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import EditCSForm from './EditCSForm';

export default async function EditCSPage({ params }) {
  const { id } = await params;
  const supabase = createClient();

  const { data: update, error } = await supabase
    .from('cs_daily_updates')
    .select('*, trips(name, kode_trip)')
    .eq('id', id)
    .maybeSingle();

  if (error || !update) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/cs" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke CS Daily</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Edit CS Update</h1>
        <p className="mt-1 text-slate-600">
          <span className="font-mono font-bold">{update.trips?.kode_trip || `#${update.trip_id}`}</span> — {update.trips?.name || 'Unknown trip'}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <EditCSForm update={update} />
      </div>
    </div>
  );
}
