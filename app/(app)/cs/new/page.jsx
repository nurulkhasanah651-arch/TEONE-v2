// CS New Daily Update — form to input today's CS data
// Server Component fetches trips; form submits via Server Action

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import CSForm from './CSForm';

export default async function NewCSPage() {
  const supabase = createClient();
  const { data: trips } = await supabase
    .from('trips')
    .select('id, kode_trip, name, status, seat_left')
    .in('status', ['open selling', 'prepare to sell', 'closed selling'])
    .order('departure', { ascending: true });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/cs" className="text-sm text-brand-600 font-medium hover:underline">← Kembali</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Input CS Daily Update</h1>
        <p className="mt-1 text-slate-600">Catat progres penjualan harian per trip.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <CSForm trips={trips || []} />
      </div>
    </div>
  );
}
