// Round 177 v2: TL trip detail — Request Gaji TL HIDDEN dari TL, hanya Ops/Owner/Manager/CS yg bisa lihat
// Path: app/(app)/tl/[tripId]/page.jsx

import Link from 'next/link';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode, serviceClientFor } from '@/lib/supabase/service-env';
import { BRAND_CODES } from '@/lib/brand-shared';
import { resolveTlIdentity, tlOwnsTrip } from '@/lib/tl-cross-brand';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg, tripChecklist } from '@/lib/utils/trip-status';
import PettyCashEditor from '@/components/tl/PettyCashEditor';
import ReimbursementPanel from '@/components/tl/ReimbursementPanel';
import TripDocsSection from '@/components/tl/TripDocsSection';
import PreDepartureChecklist from '@/components/tl/PreDepartureChecklist';
import TLExpenseForm from '@/components/tl/TLExpenseForm';
import SignedFileLink from '@/components/common/SignedFileLink';
import FinalReportForm from '@/components/tl/FinalReportForm';
import VendorReviewSection from '@/components/tl/VendorReviewSection';
import TLManifestRoomlist from '@/components/tl/TLManifestRoomlist';
// R177v2: TL payment request — OPS ONLY
import RequestTLPaymentButtons from '@/components/tl/RequestTLPaymentButtons';
import { requestTLPayment, getTLPaymentsForTrip } from '@/lib/actions/tl-payments';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function TLTripDetailPage({ params, searchParams }) {
  const { tripId } = await params;
  const sp = (await searchParams) || {};
  const brandParam = String(sp.tb || '').toLowerCase();
  const crossBrand = BRAND_CODES.includes(brandParam) && brandParam !== currentBrandCode();
  const brandCode = crossBrand ? brandParam : currentBrandCode();
  const supabase = createClient();
  // Lintas-brand: baca/tulis ke DB brand trip (service client), bukan sesi user (beda project).
  const svcCross = crossBrand ? serviceClientFor(brandParam) : null;
  const db = svcCross || supabase;                       // trip/peserta/customer
  const serviceClient = svcCross || getServiceClient() || supabase;

  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role || user?.user_metadata?.role || user?.app_metadata?.role || 'pending';
  const isInternal = ['manager', 'owner', 'ops', 'cs', 'finance', 'admin'].includes(role);
  // R177v2: Cuma Ops/Manager/Finance (+ Owner) yg boleh ajukan gaji TL. CS gak boleh.
  const canRequestTLPayment = ['ops', 'manager', 'finance', 'owner'].includes(role);
  const isTL = role === 'tour_leader';
  const userEmail = user?.email || '';
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const { data: trip } = await db.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();
  // Lintas-brand: pastikan trip ini memang di-assign ke TL yang login.
  // #2: TL (tour_leader) hanya boleh membuka trip MILIKNYA (se-brand & lintas-brand).
  //     Cross-brand oleh siapa pun juga wajib pemilik (kunci lintas-brand).
  if (crossBrand || isTL) {
    const _ownCode = crossBrand ? brandParam : currentBrandCode();
    const identity = await resolveTlIdentity(user).catch(() => null);
    if (!identity || !tlOwnsTrip(identity, trip, _ownCode)) notFound();
    // TL yang sudah menolak trip ini tidak boleh buka lagi (bukan tanggung jawabnya).
    if (isTL && trip.tl_assignment_status === 'rejected') notFound();
  }

  const { data: tp } = await db.from('trip_passengers').select('*').eq('trip_id', tripId);
  const allPassengers = tp || [];
  const passengers = allPassengers.filter((p) => {
    const isT = p.transfer_status === 'transferred';
    const isR = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isT && !isR;
  });

  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await db.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  // R129 data
  let pettyCash = null, reimbursements = [], docs = [];
  try { const r = await serviceClient.from('trip_petty_cash').select('*').eq('trip_id', tripId).maybeSingle(); pettyCash = r.data; } catch {}
  try { const r = await serviceClient.from('reimbursement_requests').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }); reimbursements = r.data || []; } catch {}
  try { const r = await serviceClient.from('trip_documents').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }); docs = r.data || []; } catch {}
  let tlExpenses = [];
  try { const r = await serviceClient.from('trip_tl_expenses').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }); tlExpenses = r.data || []; } catch {}

  // R130 data
  let checklist = null, finalReport = null, vendorReviews = [];
  try { const r = await serviceClient.from('tl_checklist').select('*').eq('trip_id', tripId).maybeSingle(); checklist = r.data; } catch {}
  try { const r = await serviceClient.from('tl_final_report').select('*').eq('trip_id', tripId).maybeSingle(); finalReport = r.data; } catch {}
  try { const r = await serviceClient.from('tl_vendor_reviews').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }); vendorReviews = r.data || []; } catch {}

  // R177v2: Fetch TL payment requests cuma untuk yg boleh ajukan
  let tlPaymentRequests = [];
  if (canRequestTLPayment) {
    try { tlPaymentRequests = await getTLPaymentsForTrip(tripId); } catch {}
  }
  const finalReportSubmitted = !!finalReport && finalReport.status !== 'draft';

  const s = statusCfg(trip.status);
  const days = daysUntil(trip.departure);
  const tripChecklistData = tripChecklist(trip);
  const okCount = tripChecklistData.filter((c) => c.ok).length;
  const tripCompleted = trip.status === 'completed' || (days != null && days < -1);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/tl" className="text-sm text-brand-600 font-medium hover:underline">← Portal TL</Link>
        {crossBrand && (<span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 align-middle">{brandParam === 'khasanah' ? 'Khasanah' : brandParam.toUpperCase()}</span>)}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{trip.kode_trip || `#${trip.id}`}</span>
          {!isTL && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>}
          {days != null && days >= 0 && (
            <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${days <= 14 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>⏰ {days}h lagi</span>
          )}
          {isInternal && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 uppercase tracking-wider">
              🧑‍💼 {role}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.name}</h1>
        <p className="mt-1 text-slate-600">
          {trip.tl_name && <>👤 TL: <b>{trip.tl_name}</b>{(isInternal || trip.destination) && ' · '}</>}
          {isInternal && <>{passengers.length} peserta aktif{trip.destination && ' · '}</>}
          {trip.destination && `📍 ${trip.destination}`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoCard label="📅 Keberangkatan" value={fmtDate(trip.departure)} />
        <InfoCard label="📅 Kepulangan" value={fmtDate(trip.arrival)} />
        {isInternal && <InfoCard label="🪑 Seat" value={`${trip.sold || 0} / ${trip.quota || 0}`} />}
        <InfoCard label="✅ Status" value={`${okCount}/${tripChecklistData.length}`} />
      </div>

      {/* R177v2: REQUEST GAJI TL — Ops/Manager/Finance/Owner ONLY. TL & CS gak nampak. */}
      {canRequestTLPayment && (
        <RequestTLPaymentButtons
          tripId={tripId}
          tlName={trip.tl_name}
          existingRequests={tlPaymentRequests}
          finalReportSubmitted={finalReportSubmitted}
          requestAction={requestTLPayment}
        />
      )}

      {/* PRE-DEPARTURE CHECKLIST */}
      <PreDepartureChecklist
        brand={brandCode}
        tripId={tripId}
        checklist={checklist || {}}
        canEdit={isTL || isInternal}
        userEmail={userEmail}
      />

      {/* PETTY CASH (internal only edit) */}
      <PettyCashEditor
        tripId={tripId}
        current={pettyCash}
        canEdit={isInternal}
        userEmail={userEmail}
      />

      {/* TL EXPENSE FORM */}
      {(isTL || isInternal) && (
        <TLExpenseForm
          brand={brandCode}
          tripId={tripId}
          pettyCash={pettyCash}
          userEmail={userEmail}
          userName={userName}
          userRole={role}
        />
      )}

      {/* DAFTAR EXPENSE TERCATAT (petty + reimburse) + bukti */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="font-bold text-slate-700">🧾 Daftar Expense Tercatat <span className="text-xs font-semibold text-slate-500">({tlExpenses.length})</span></h2>
        </div>
        {tlExpenses.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">Belum ada expense tercatat.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tlExpenses.map((ex) => (
              <div key={ex.id} className="px-5 py-3 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ex.category && <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{ex.category}</span>}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ex.status === 'petty' ? 'bg-emerald-100 text-emerald-700' : ex.status === 'reimburse' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {ex.status === 'petty' ? 'Petty Cash' : ex.status === 'reimburse' ? 'Reimburse' : 'Petty + Reimburse'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{ex.description}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {ex.tanggal ? fmtDate(ex.tanggal) : fmtDate(ex.created_at)}{ex.submitted_by ? ` · ${ex.submitted_by}` : ''}
                  </p>
                  {ex.receipt_url
                    ? <SignedFileLink url={ex.receipt_url} className="text-[11px] text-blue-600 hover:underline cursor-pointer inline-block mt-0.5">📎 Lihat bukti</SignedFileLink>
                    : <span className="text-[11px] text-slate-400 inline-block mt-0.5">tanpa bukti</span>}
                </div>
                <p className="text-sm font-bold text-slate-800 whitespace-nowrap">{fmtRupiah(ex.amount_idr || 0)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REIMBURSEMENT */}
      <ReimbursementPanel
        tripId={tripId}
        requests={reimbursements}
        canApprove={isInternal}
        canRequest={true}
        userEmail={userEmail}
        userName={userName}
        userRole={role}
      />

      {/* TRIP DOCS */}
      <TripDocsSection
        tripId={tripId}
        docs={docs}
        canUpload={isInternal}
        isTL={isTL}
        userEmail={userEmail}
      />

      {/* FINAL REPORT */}
      {(tripCompleted || finalReport || isTL || isInternal) && (
        <FinalReportForm
          brand={brandCode}
          tripId={tripId}
          report={finalReport}
          canEdit={isTL || isInternal}
          canReview={isInternal}
          userEmail={userEmail}
        />
      )}

      {/* VENDOR REVIEWS */}
      <VendorReviewSection
        brand={brandCode}
        tripId={tripId}
        reviews={vendorReviews}
        canEdit={isTL || isInternal}
        userEmail={userEmail}
      />

      {/* Manifest, Roomlist & Daftar Peserta — TL hanya boleh akses mulai H-14 */}
      {(() => {
        const paxGateOpen = isInternal || (days != null && days <= 14);
        if (!paxGateOpen) {
          return (
            <div className="bg-white rounded-xl border border-amber-200 shadow-card p-8 text-center">
              <p className="text-3xl mb-2">🔒</p>
              <p className="font-bold text-amber-800">Data peserta, manifest & roomlist tersedia mulai H-14</p>
              <p className="text-sm text-slate-600 mt-1">
                Akan terbuka {days != null ? `dalam ${days - 14} hari lagi` : 'menjelang keberangkatan'} (14 hari sebelum berangkat).
                {trip.departure ? ` Keberangkatan: ${fmtDate(trip.departure)}.` : ''}
              </p>
            </div>
          );
        }
        return (
          <>
            <TLManifestRoomlist trip={trip} passengers={passengers} customerMap={customerMap} />
            <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
                <h2 className="font-bold text-brand-700">👥 Daftar Peserta ({passengers.length})</h2>
              </div>
              {passengers.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">Belum ada peserta aktif.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {passengers.map((p, idx) => {
                    const c = customerMap[p.customer_id] || {};
                    return (
                      <div key={p.id} className="px-5 py-2.5 flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                        <p className="flex-1 font-semibold text-slate-800">{c.name || '—'}</p>
                        {p.room_type && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{p.room_type}</span>}
                        {c.phone && <span className="text-xs text-slate-500">📞 {c.phone}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-brand-700">{value}</p>
    </div>
  );
}
