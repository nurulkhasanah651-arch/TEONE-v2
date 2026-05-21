// Roomlist editor — Round 49

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils/format';
import RoomlistEditor from '@/components/visa/RoomlistEditor';

export const dynamic = 'force-dynamic';

export default async function RoomlistPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  const { data: tp } = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });
  const passengers = tp || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);

  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }
  const passWithCust = passengers.map((p) => ({ ...p, customers: customerMap[p.customer_id] || null }));

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <Link href={`/visa/${tripId}`} className="text-sm text-brand-600 font-medium hover:underline">← Visa Trip</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">🛏 Roomlist — {trip.kode_trip || `#${trip.id}`}</h1>
        <p className="mt-1 text-slate-600">
          {trip.name} · {passengers.length} peserta · Berangkat {fmtDate(trip.departure)}
        </p>
      </div>

      <RoomlistEditor tripId={tripId} tripCode={trip.kode_trip || trip.id} passengers={passWithCust} />
    </div>
  );
}
