// Visa detail per trip — Round 49: link ke /roomlist editor

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import VisaGroupForm from '@/components/visa/VisaGroupForm';
import VisaMatrix from '@/components/visa/VisaMatrix';

export const dynamic = 'force-dynamic';

export default async function VisaTripPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  let passengers = [];
  const r1 = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });
  passengers = r1.data || [];

  if (passengers.length === 0 && !isNaN(parseInt(tripId))) {
    const r2 = await supabase
      .from('trip_passengers')
      .select('*')
      .eq('trip_id', parseInt(tripId))
      .order('joined_at', { ascending: true });
    if (r2.data && r2.data.length > 0) passengers = r2.data;
  }

  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }
  const passengersWithCustomers = passengers.map((p) => ({ ...p, customers: customerMap[p.customer_id] || null }));

  const template = trip.visa_doc_template || [];
  const s = statusCfg(trip.status);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Link href="/visa" className="text-sm text-brand-600 font-medium hover:underline">← Visa</Link>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{trip.kode_trip || `#${trip.id}`}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.name}</h1>
        <p className="mt-1 text-slate-600">{passengers.length} peserta · Berangkat {fmtDate(trip.departure)}</p>
      </div>

      {passengers.length === 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
          <h3 className="text-xl font-bold text-amber-800">⚠ Trip ini belum ada peserta</h3>
          <p className="mt-1 text-sm text-amber-700">Tambah peserta dulu dari /trips/[id]/edit atau via CS Daily.</p>
        </div>
      )}

      {/* Action bar — manifest, roomlist editor, downloads */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/visa/${tripId}/roomlist`}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
        >
          🛏 Buka Roomlist Editor
        </Link>
        <a
          href={`/visa/${tripId}/manifest.csv`}
          download={`manifest_${trip.kode_trip || trip.id}.csv`}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
        >
          📋 Download Manifest (CSV)
        </a>
        <a
          href={`/visa/${tripId}/roomlist.csv`}
          download={`roomlist_${trip.kode_trip || trip.id}.csv`}
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
        >
          📥 Roomlist (CSV)
        </a>
        <a
          href={`/visa/${tripId}/roomlist.xls`}
          download={`roomlist_${trip.kode_trip || trip.id}.xls`}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
        >
          📊 Roomlist (Excel)
        </a>
      </div>

      <VisaGroupForm trip={trip} template={template} />

      {passengers.length > 0 && (
        <VisaMatrix tripId={tripId} template={template} passengers={passengersWithCustomers} />
      )}
    </div>
  );
}
