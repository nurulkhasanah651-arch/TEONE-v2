// TL trip detail — Round 129: dual role (TL read-only + Internal management)
// Path: app/(app)/tl/[tripId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg, tripChecklist } from '@/lib/utils/trip-status';
import PettyCashEditor from '@/components/tl/PettyCashEditor';
import ReimbursementPanel from '@/components/tl/ReimbursementPanel';
import TripDocsSection from '@/components/tl/TripDocsSection';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function TLTripDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const serviceClient = getServiceClient() || supabase;

  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role || user?.app_metadata?.role || 'pending';
  const isInternal = ['manager', 'owner', 'ops', 'cs'].includes(role);
  const isTL = role === 'tour_leader';
  const userEmail = user?.email || '';
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  const { data: tp } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
  const allPassengers = tp || [];
  const passengers = allPassengers.filter((p) => {
    const isT = p.transfer_status === 'transferred';
    const isR = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isT && !isR;
  });

  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  // Round 129: Fetch petty cash + reimbursements + docs
  let pettyCash = null;
  let reimbursements = [];
  let docs = [];
  try {
    const r = await serviceClient.from('trip_petty_cash').select('*').eq('trip_id', tripId).maybeSingle();
    pettyCash = r.data;
  } catch {}
  try {
    const r = await serviceClient
      .from('reimbursement_requests').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
    reimbursements = r.data || [];
  } catch {}
  try {
    const r = await serviceClient
      .from('trip_documents').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
    docs = r.data || [];
  } catch {}

  const s = statusCfg(trip.status);
  const days = daysUntil(trip.departure);
  const checklist = tripChecklist(trip);
  const okCount = checklist.filter((c) => c.ok).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/tl" className="text-sm text-brand-600 font-medium hover:underline">← Portal TL</Link>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{trip.kode_trip || `#${trip.id}`}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>
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
          {trip.tl_name && <>👤 TL: <b>{trip.tl_name}</b> · </>}
          {passengers.length} peserta aktif
          {trip.destination && ` · 📍 ${trip.destination}`}
        </p>
      </div>

      {/* Quick info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoCard label="📅 Keberangkatan" value={fmtDate(trip.departure)} />
        <InfoCard label="📅 Kepulangan" value={fmtDate(trip.arrival)} />
        <InfoCard label="🪑 Seat" value={`${trip.sold || 0} / ${trip.quota || 0}`} />
        <InfoCard label="✅ Checklist" value={`${okCount}/${checklist.length}`} />
      </div>

      {/* Status checklist */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">📋 Status Operasional Trip</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {checklist.map((c) => (
            <div key={c.label} className={`p-2.5 rounded-lg text-center border ${c.ok ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-2xl ${c.ok ? 'text-green-600' : 'text-slate-300'}`}>{c.ok ? '✓' : '○'}</p>
              <p className={`text-xs font-semibold mt-0.5 ${c.ok ? 'text-green-700' : 'text-slate-600'}`}>{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ROUND 129: PETTY CASH (TL view-only, Internal editable) */}
      <PettyCashEditor
        tripId={tripId}
        current={pettyCash}
        canEdit={isInternal}
        userEmail={userEmail}
      />

      {/* ROUND 129: REIMBURSEMENT */}
      <ReimbursementPanel
        tripId={tripId}
        requests={reimbursements}
        canApprove={isInternal}
        canRequest={true}
        userEmail={userEmail}
        userName={userName}
        userRole={role}
      />

      {/* ROUND 129: DOCS */}
      <TripDocsSection
        tripId={tripId}
        docs={docs}
        canEdit={isInternal || isTL}
        userEmail={userEmail}
      />

      {/* Passengers list (read-only) */}
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
