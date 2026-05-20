// Daily Leads form — input/edit leads for a specific date (upsert)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LeadsForm from './LeadsForm';

export default async function NewLeadsPage({ searchParams }) {
  const sp = await searchParams;
  const requestedDate = sp?.date || new Date().toISOString().slice(0, 10);

  const supabase = createClient();
  const { data: existing } = await supabase
    .from('cs_daily_leads')
    .select('*')
    .eq('tanggal', requestedDate)
    .maybeSingle();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/cs/leads" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke list</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">
          {existing ? 'Edit' : 'Input'} Leads Harian
        </h1>
        <p className="mt-1 text-slate-600">Total leads masuk dari setiap channel pada tanggal terpilih.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <LeadsForm initial={existing || { tanggal: requestedDate }} />
      </div>
    </div>
  );
}
