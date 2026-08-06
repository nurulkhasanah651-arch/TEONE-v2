// Final Roomlist (Operasional) — editor roomlist per trip. Save → sinkron ke master trip,
// Proyeksi Income, dan semua PDF (roomlist/manifest) otomatis mengikuti.
// Path: app/(app)/operasional/roomlist/page.jsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getTripCrew } from '@/lib/actions/crew';
import RoomlistPanel from '@/components/finance/RoomlistPanel';
import RoomlistTripPicker from '@/components/operasional/RoomlistTripPicker';

export const dynamic = 'force-dynamic';

function isActive(p) {
  return p.status !== 'cancelled' && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}

export default async function OpsRoomlistPage({ searchParams }) {
  const sp = await searchParams;
  const tripId = sp?.trip || null;
  const supabase = createClient();

  if (!tripId) {
    const [{ data: trips }, { data: withRl }, { data: pax }] = await Promise.all([
      supabase.from('trips').select('id, kode_trip, name, public_title, departure, status, pic').order('departure', { ascending: false, nullsFirst: false }),
      supabase.from('trips').select('id').not('final_roomlist', 'is', null),
      supabase.from('trip_passengers').select('trip_id, status, transfer_status, refund_status'),
    ]);
    const rlSet = new Set((withRl || []).map((t) => t.id));
    const cnt = {};
    for (const p of (pax || [])) { if (isActive(p)) cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1; }
    const list = (trips || []).map((t) => ({
      id: t.id, kode: t.kode_trip || '', name: t.public_title || t.name || '',
      departure: t.departure, status: t.status, pic: t.pic || '',
      pax: cnt[t.id] || 0, hasRoomlist: rlSet.has(t.id),
    }));
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">🛏 Final Roomlist</h1>
          <p className="mt-1 text-slate-600">Pilih trip untuk susun / edit Final Roomlist. Begitu disimpan, master trip, Proyeksi Income & semua PDF (roomlist/manifest) otomatis ikut ter-update.</p>
        </div>
        <RoomlistTripPicker trips={list} />
      </div>
    );
  }

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <Link href="/operasional/roomlist" className="text-sm text-brand-600 font-medium hover:underline">← Pilih trip lain</Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ Trip tidak ditemukan.</div>
      </div>
    );
  }
  const { data: passengers } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId);
  const allPassengers = passengers || [];
  const custIds = [...new Set(allPassengers.map((p) => p.customer_id).filter(Boolean))];
  let customers = [];
  for (let i = 0; i < custIds.length; i += 500) {
    const { data: cc } = await supabase.from('customers').select('id, name, gender, sex').in('id', custIds.slice(i, i + 500));
    customers = customers.concat(cc || []);
  }
  let crew = [];
  try { const cr = await getTripCrew(tripId); crew = cr?.crew || []; } catch {}

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div>
        <Link href="/operasional/roomlist" className="text-sm text-brand-600 font-medium hover:underline">← Pilih trip lain</Link>
        <h1 className="mt-1 text-2xl font-bold text-brand-700">🛏 Final Roomlist — {trip.kode_trip || trip.id}</h1>
        <p className="text-sm text-slate-500">{trip.public_title || trip.name}</p>
      </div>
      <RoomlistPanel trip={trip} passengers={allPassengers} customers={customers} crew={crew} />
    </div>
  );
}
