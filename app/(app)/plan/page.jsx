// Plan Trip — board rencana penjualan per region
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PlanBoard from '@/components/plan/PlanBoard';

export default async function PlanPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role || null;
  const canEdit = ['owner', 'accounting', 'manager', 'ops'].includes(role);

  const { data: plans } = await supabase
    .from('trip_plans')
    .select('*')
    .order('planned_departure', { ascending: true, nullsFirst: false });

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-700">🗺 Plan Trip</h1>
        <p className="text-xs text-slate-500">Rencana penjualan trip 6–12 bulan ke depan, per region. Tanggal, harga, deadline release & status.</p>
      </div>
      <PlanBoard plans={plans || []} canEdit={canEdit} />
    </div>
  );
}
