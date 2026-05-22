// TL trip detail — Round 67: download links pakai /tl/ path

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg, tripChecklist } from '@/lib/utils/trip-status';
import { getRoleFromUser } from '@/lib/utils/roles';

let TripDocuments = null;
try { TripDocuments = require('@/components/trips/TripDocuments').default; } catch {}
let TlOperations = null;
try { TlOperations = require('@/components/tl/TlOperations').default; } catch {}

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const r = await promise; return r.data || fallback; } catch { return fallback; }
}

export default async function TLTripDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = getRoleFromUser(user);
  const isTL = role === 'tour_leader';

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  if (isTL) {
    const tlId = user?.user_metadata?.tl_id;
    const tlName = user?.user_metadata?.tl_name || '';
    const matchById = tlId && String(trip.tl_id) === String(tlId);
    const matchByName = tlName && (trip.tl_name || '').toLowerCase().includes(tlName.toLowerCase());
    if (!matchById && !matchByName) {
      redirect('/tl');
    }
  }

  let passengers = [];
  let customerMap = {};
  try {
    const { data: tp } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
    passengers = Array.isArray(tp) ? tp : [];
    const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
    if (customerIds.length > 0) {
      const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
      customerMap = Object.fromEntries((Array.isArray(cust) ? cust : []).map((c) => [c.id, c]));
    }
  } catch {}

  const documents = await safeQuery(
    supabase.from('trip_documents').select('*').eq('trip_id', tripId).order('created_at', { ascending: false })
  );

  const expenses = await safeQuery(supabase.from('tl_expenses').select('*').eq('trip_id', tripId).order('date', { ascending: false }));
  const gmapsReviews = await safeQuery(supabase.from('tl_gmaps_reviews').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }));
  const vendorReviews = await safeQuery(supabase.from('tl_vendor_reviews').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }));
  const hasTlMigration = 'tl_petty_cash' in trip;

  const s = statusCfg(trip.status) || {};
  const days = daysUntil(trip.departure);
  let checklist = [];
  try { const c = tripChecklist(trip); checklist = Array.isArray(c) ? c : []; } catch {}

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/tl" className="text-sm text-brand-600 font-medium hover:underline">← Portal TL</Link>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg || 'bg-slate-100'} ${s.text || 'text-slate-700'}`}>
            {trip.kode_trip || `#${trip.id}`}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg || 'bg-slate-100'} ${s.text || 'text-slate-700'} border ${s.border || 'border-slate-200'}`}>
            {s.label || trip.status || '—'}
          </span>
          {days != null && days >= 0 && (
            <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${days <= 14 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
              ⏰ {days}h lagi
            </span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.name}</h1>
        <p className="mt-1 text-slate-600">{trip.tl_name && `👤 TL: ${trip.tl_name} · `}{passengers.length} peserta</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <InfoCard label="📅 Keberangkatan" value={fmtDate(trip.departure)} />
        <InfoCard label="📅 Kepulangan" value={fmtDate(trip.arrival)} />
        <InfoCard label="🪑 Total Peserta" value={`${passengers.length} pax`} />
      </div>

      {checklist.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
          <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">📊 Status Operasional Trip</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {checklist.map((c, i) => (
              <div key={c?.label || i} className={`p-2.5 rounded-lg text-center border ${c?.ok ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className={`text-2xl ${c?.ok ? 'text-green-600' : 'text-slate-300'}`}>{c?.ok ? '✓' : '○'}</p>
                <p className={`text-xs font-semibold mt-0.5 ${c?.ok ? 'text-green-700' : 'text-slate-600'}`}>{c?.label || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {TripDocuments && (
        <TripDocuments tripId={tripId} documents={documents} readOnly={true} />
      )}

      {hasTlMigration && TlOperations && (
        <div className="bg-gradient-to-br from-brand-50 to-white rounded-xl border border-brand-200 shadow-card p-5">
          <h2 className="text-lg font-bold text-brand-700 mb-3">🎯 Operasional TL</h2>
          <TlOperations trip={trip} expenses={expenses} gmapsReviews={gmapsReviews} vendorReviews={vendorReviews} />
        </div>
      )}

      {(trip.pnr || trip.flight_details) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
          <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">✈ Info Penerbangan</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {trip.pnr && <InfoRow label="PNR" value={trip.pnr} />}
            {trip.flight_details && <InfoRow label="Rute" value={trip.flight_details} />}
            {trip.ticket && <InfoRow label="Tipe Tiket" value={trip.ticket} />}
          </div>
        </div>
      )}

      {trip.notes && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
          <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">📝 Catatan Trip dari Ops</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{trip.notes}</p>
        </div>
      )}

      {/* Peserta + Download — Round 67: links pakai /tl/ path */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-brand-700">👥 Daftar Peserta ({passengers.length})</h3>
          <div className="flex gap-2 flex-wrap">
            <a href={`/tl/${tripId}/manifest.csv`} download className="text-xs font-semibold px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100">📋 Manifest CSV</a>
            <a href={`/tl/${tripId}/roomlist.csv`} download className="text-xs font-semibold px-3 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100">🛏 Roomlist CSV</a>
            <a href={`/tl/${tripId}/roomlist.xls`} download className="text-xs font-semibold px-3 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100">📊 Roomlist Excel</a>
          </div>
        </div>
        {passengers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Belum ada peserta.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {passengers.map((p, idx) => {
              const c = customerMap[p.customer_id] || {};
              return (
                <div key={p.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                        <p className="font-bold text-brand-700">{c.name || '—'}</p>
                        {p.room_assignment && <span className="text-[11px] px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold">🛏 {p.room_assignment}</span>}
                        {p.room_type && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{p.room_type}</span>}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3">
                        {c.phone && <span>📞 {c.phone}</span>}
                        {c.passport_no && <span>📕 {c.passport_no}</span>}
                        {c.passport_expiry && <span>Exp: {fmtDate(c.passport_expiry)}</span>}
                      </div>
                    </div>
                  </div>
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 font-bold text-brand-700 text-lg">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
