// R181 + R215m + R215o + R215r + R215s + R215t: Visa trip detail FULL
// R215m: VisaWorkflowConfig + VisaWorkflowPanel (cost, WA, hasil)
// R215o: VisaTemplateEditor (CS edit template WA)
// R215r: VisaDocsDownloadPanel (view + ZIP per peserta)
// R215s: New uploads notification + auto-mark as viewed
// R215t: VisaDriveSyncPanel (sync ke Google Drive auto-folder per peserta)
// Path: app/(app)/visa/[tripId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import VisaGroupForm from '@/components/visa/VisaGroupForm';
import VisaMatrix from '@/components/visa/VisaMatrix';
import VisaPDFDownloads from '@/components/visa/VisaPDFDownloads';
import VisaWorkflowConfig from '@/components/visa/VisaWorkflowConfig';
import VisaWorkflowPanel from '@/components/visa/VisaWorkflowPanel';
import VisaTemplateEditor from '@/components/visa/VisaTemplateEditor';
import VisaDocsDownloadPanel from '@/components/visa/VisaDocsDownloadPanel';
// R215t — Drive sync
import VisaDriveSyncPanel from '@/components/visa/VisaDriveSyncPanel';
import ManifestDownloadButton from '@/components/common/ManifestDownloadButton';
// R215s — auto-mark uploads as viewed
import { markTripUploadsAsViewed } from '@/lib/actions/visa-mark-viewed';

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

  // R215s — Count uploaded docs untuk header badge (BEFORE markAsViewed)
  let totalUploadedDocs = 0;
  let passengersWithUploads = 0;
  let newUploadsCount = 0;
  for (const p of passengers) {
    const uploads = Array.isArray(p.visa_uploaded_docs) ? p.visa_uploaded_docs : [];
    if (uploads.length > 0) {
      totalUploadedDocs += uploads.length;
      passengersWithUploads++;
      const lastViewed = p.visa_uploads_last_viewed_at ? new Date(p.visa_uploads_last_viewed_at).getTime() : 0;
      for (const u of uploads) {
        const uploadTime = u.uploaded_at ? new Date(u.uploaded_at).getTime() : 0;
        if (uploadTime > lastViewed) newUploadsCount++;
      }
    }
  }

  // R215s — Auto-mark all uploads as viewed (fire & forget, gak nunggu)
  if (newUploadsCount > 0) {
    try {
      await markTripUploadsAsViewed(tripId);
    } catch (e) {
      // Defensive — kalau kolom belum exist, skip aja
      console.warn('[markTripUploadsAsViewed]', e?.message);
    }
  }

  // Existing — fetch payment Visa per peserta
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
          {/* R215s — New uploads badge */}
          {newUploadsCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-white animate-pulse">
              🔔 {newUploadsCount} doc BARU di-upload (akan di-mark sebagai viewed)
            </span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.name}</h1>
        <p className="mt-1 text-slate-600">
          {passengers.length} peserta aktif
          {inactiveCount > 0 && <span className="text-amber-600"> · {inactiveCount} transferred/refunded</span>}
          · Berangkat {fmtDate(trip.departure)}
          {totalUploadedDocs > 0 && (
            <span className="ml-2 text-emerald-700 font-semibold">
              · 📤 {totalUploadedDocs} dokumen dari {passengersWithUploads} peserta
            </span>
          )}
        </p>
      </div>

      {/* Existing — PDF Downloads */}
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

      {/* Existing — Group info + template editor */}
      <VisaGroupForm trip={trip} template={template} />

      {/* R215m — Workflow Config (trip-level: PDF, default cost, biometric location) */}
      <VisaWorkflowConfig trip={trip} />

      {/* R215o — Template Editor (CS edit template WA) */}
      <VisaTemplateEditor trip={trip} />

      <div className="flex justify-end">
        <ManifestDownloadButton tripId={tripId} />
      </div>

      {/* R215t — Google Drive Sync (auto upload ke Drive folder per peserta) */}
      <VisaDriveSyncPanel trip={trip} />

      {/* R215r — DOWNLOAD PANEL (view + ZIP per peserta) */}
      <VisaDocsDownloadPanel trip={trip} passengers={passengersWithCustomers} />

      {/* Existing — Matrix */}
      <VisaMatrix tripId={tripId} template={template} passengers={passengersWithCustomers} />

      {/* R215m — Workflow Panel (cost, WA, hasil per peserta) */}
      <VisaWorkflowPanel trip={trip} passengers={passengersWithCustomers} />
    </div>
  );
}
