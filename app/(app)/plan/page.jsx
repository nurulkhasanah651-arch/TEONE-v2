// Plan Trip — board rencana penjualan per region + section "Trip Siap Publish"
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PlanBoard from '@/components/plan/PlanBoard';
import PlanPublishSection from '@/components/plan/PlanPublishSection';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { effectiveSellingStatus } from '@/lib/utils/trip-status';

export default async function PlanPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role || user?.user_metadata?.role || null;
  // Semua role internal (kantor) boleh isi jadwal & publish. TL & Mitra tidak.
  const canEdit = ['owner', 'accounting', 'manager', 'ops', 'cs', 'pic'].includes(role);

  const { data: plans } = await supabase
    .from('trip_plans')
    .select('*')
    .order('planned_departure', { ascending: true, nullsFirst: false });

  // Trip asli berstatus "prepare to sell" (belum dipublish) -> Trip Siap Publish.
  let readyTrips = [];
  try {
    const { data: prep } = await supabase.from('trips').select('*').eq('status', 'prepare to sell');
    const ids = (prep || []).map((t) => t.id);
    const counts = {};
    if (ids.length) {
      const px = await fetchAll(() => supabase
        .from('trip_passengers')
        .select('trip_id, transfer_status, refund_status')
        .in('trip_id', ids));
      for (const p of px) {
        if (p.transfer_status === 'transferred' || p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
        counts[p.trip_id] = (counts[p.trip_id] || 0) + 1;
      }
    }
    readyTrips = (prep || [])
      .map((t) => ({ ...t, _soldReal: counts[t.id] || 0 }))
      // Hanya yg benar-benar masih prepare (bukan yg sudah ada peserta / lewat tanggal).
      .filter((t) => effectiveSellingStatus(t) === 'prepare to sell')
      .sort((a, b) => String(a.publish_date || a.departure || '').localeCompare(String(b.publish_date || b.departure || '')));
  } catch {}

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-700">🗺 Plan Trip</h1>
        <p className="text-xs text-slate-500">Rencana penjualan trip 6–12 bulan ke depan, per region. Tanggal, harga, deadline release & status.</p>
      </div>

      <PlanPublishSection trips={readyTrips} canEdit={canEdit} />

      <PlanBoard plans={plans || []} canEdit={canEdit} />
    </div>
  );
}
