// Master Mitra (internal) — kelola mitra, fee template, penjualan & pencairan fee
import { getMitraStats } from '@/lib/actions/mitra';
import { createClient } from '@/lib/supabase/server';
import MitraMasterClient from '@/components/mitra/MitraMasterClient';

export const dynamic = 'force-dynamic';

export default async function MitraMasterPage() {
  const supabase = createClient();
  const { data: template } = await supabase.from('mitra_fee_template').select('*').order('category');
  const res = await getMitraStats();
  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-brand-700">🤝 Master Mitra</h1>
      <p className="mt-1 text-slate-600 mb-5">Kelola mitra, fee per kategori, penjualan & pencairan fee.</p>
      <MitraMasterClient stats={res?.stats || []} template={template || []} />
    </div>
  );
}
