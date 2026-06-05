// Round 181 + R215m: Visa trip detail
// R215m: TAMBAH VisaWorkflowConfig + VisaWorkflowPanel di bawah matrix existing
// EXISTING: VisaGroupForm + VisaMatrix + VisaPDFDownloads → TETAP UTUH
// Path: app/(app)/visa/[tripId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import VisaGroupForm from '@/components/visa/VisaGroupForm';
import VisaMatrix from '@/components/visa/VisaMatrix';
import VisaPDFDownloads from '@/components/visa/VisaPDFDownloads';
// R215m — Workflow Config + Panel
import VisaWorkflowConfig from '@/components/visa/VisaWorkflowConfig';
import VisaWorkflowPanel from '@/components/visa/VisaWorkflowPanel';

export const dynamic = 'force-dynamic';

export default async function VisaTripPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  const { data: tp } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
  const allPassengers = tp || [];

  const passengers = allPassengers.filter((p) => {
    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isTransferred && !isRefunded;
  });
  const inactiveCount = allPassengers.length - passengers.length;

  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  // Fetch payment Visa per peserta (existing)
  const passengerIds = passengers.map((p) => p.id);
  const visaPaymentByPassenger = {};
  if (passengerIds.length > 0) {
    try {
      let payQuery = supabase
        .from('participant_payments')
        .select('passenger_id, type, amount, is_transferred, paid_at')
        .in('passenger_id', passengerIds)
        .eq('type', 'Visa');
      let payments = null;
      try {
        const r = await payQuery.eq('is_transferred', false);
        payments = r.data;
      } catch {
        const r = await payQuery;
        payments = r.data;
      }
      for (const p of (payments || [])) {
        if (p.is_transferred === true) continue;
        if (!visaPaymentByPassenger[p.passenger_id]) {
          visaPaymentByPassenger[p.passenger_id] = { amount: 0, paid_at: null };
        }
        visaPaymentByPassenger[p.passenger_id].amount += Number(p.amount || 0);
        if (p.paid_at) {
          if (!visaPaymentByPassenger[p.passenger_id].paid_at ||
              new Date(p.paid_at) > new Date(visaPaymentByPassenger[p.passenger_id].paid_at)) {
            visaPaymentByPassenger[p.passenger_id].paid_at = p.paid_at;
          }
        }
      }
    } catch (e) {}
  }

  const passengersWithCustomers = passengers.map((p) => ({
    ...p,
    customers: customerMap[p.customer_id] || null,
    visaPayment: visaPaymentByPassenger[p.id] || null,
  }));

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
        <p className="mt-1 text-slate-600">
          {passengers.length} peserta aktif
          {inactiveCount > 0 && <span className="text-amber-600"> · {inactiveCount} transferred/refunded</span>}
          · Berangkat {fmtDate(trip.departure)}
        </p>
      </div>

      {/* PDF Downloads (existing) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 space-y-3">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">📥 Download Dokumen</p>
        <VisaPDFDownloads trip={trip} passengers={passengersWithCustomers} />
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
          <a href={`/visa/${tripId}/manifest.csv`} download={`manifest_${trip.kode_trip || trip.id}.csv`} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2">
            📋 Manifest (CSV)
          </a>
          <a href={`/visa/${tripId}/roomlist.csv`} download={`roomlist_${trip.kode_trip || trip.id}.csv`} className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2">
            🛏 Roomlist (CSV)
          </a>
        </div>
      </div>

      {/* Group info + template editor (existing) */}
      <VisaGroupForm trip={trip} template={template} />

      {/* R215m — Workflow Config (NEW) */}
      <VisaWorkflowConfig trip={trip} />

      {/* Matrix (existing) */}
      <VisaMatrix tripId={tripId} template={template} passengers={passengersWithCustomers} />

      {/* R215m — Workflow Panel (NEW) — per peserta cost, WA, hasil */}
      <VisaWorkflowPanel trip={trip} passengers={passengersWithCustomers} />
    </div>
  );
}
