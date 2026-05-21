// Visa detail per trip

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

  const { data: tp } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
  const passengers = tp || [];
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

      {/* Download exports */}
      <div className="flex flex-wrap gap-2">
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
          🛏 Download Roomlist (CSV)
        </a>
      </div>

      {/* Group info + template editor */}
      <VisaGroupForm trip={trip} template={template} />

      {/* Matrix */}
      <VisaMatrix tripId={tripId} template={template} passengers={passengersWithCustomers} />
    </div>
  );
}
