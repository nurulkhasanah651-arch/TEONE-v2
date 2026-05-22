// TL trip detail — Round 52: tambah TripDocuments (read-only untuk TL)
// Also include TlOperations dari Round 31 kalau migration sudah jalan

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg, tripChecklist } from '@/lib/utils/trip-status';
import TripDocuments from '@/components/trips/TripDocuments';

// Optional TlOperations — kalau Round 31 belum upload, skip
let TlOperations;
try { TlOperations = require('@/components/tl/TlOperations').default; } catch { TlOperations = null; }

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const r = await promise; return r.data || fallback; } catch { return fallback; }
}

export default async function TLTripDetailPage({ params }) {
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

  // Trip docs (Round 52)
  const documents = await safeQuery(
    supabase.from('trip_documents').select('*').eq('trip_id', tripId).order('created_at', { ascending: false })
  );

  // TL operations data (optional, Round 31)
  const [expenses, gmapsReviews, vendorReviews] = await Promise.all([
    safeQuery(supabase.from('tl_expenses').select('*').eq('trip_id', tripId).order('date', { ascending: false })),
    safeQuery(supabase.from('tl_gmaps_reviews').select('*').eq('trip_id', tripId).order('created_at', { ascending: false })),
    safeQuery(supabase.from('tl_vendor_reviews').select('*').eq('trip_id', tripId).order('created_at', { ascending: false })),
  ]);
  const hasMigration = 'tl_petty_cash' in trip;

  const s = statusCfg(trip.status);
  const days = daysUntil(trip.departure);
  const checklist = tripChecklist(trip);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/tl" className="text-sm text-brand-600 font-medium hover:underline">← Portal TL</Link>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{trip.kode_trip || `#${trip.id}`}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>
          {days != null && days >= 0 && (
            <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${days <= 14 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-amber-100 text-amber-700'}`}>⏰ {days}h lagi</span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.name}</h1>
        <p className="mt-1 text-slate-600">{trip.tl_name && `👤 TL: ${trip.tl_name}`} · {passengers.length} peserta</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoCard label="📅 Keberangkatan" value={fmtDate(trip.departure)} />
        <InfoCard label="📅 Kepulangan" value={fmtDate(trip.arrival)} />
        <InfoCard label="🪑 Seat" value={`${trip.sold || 0} / ${trip.quota || 0}`} />
        <InfoCard label="💰 Harga / Pax" value={fmtRupiah(trip.price || 0)} small />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">📊 Status Operasional Trip</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {checklist.map((c) => (
            <div key={c.label} className={`p-2.5 rounded-lg text-center border ${c.ok ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-2xl ${c.ok ? 'text-green-600' : 'text-slate-300'}`}>{c.ok ? '✓' : '○'}</p>
              <p className={`text-xs font-semibold mt-0.5 ${c.ok ? 'text-green-700' : 'text-slate-600'}`}>{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* DOKUMEN TRIP — read-only untuk TL */}
      <TripDocuments tripId={tripId} documents={documents} readOnly={true} />

      {/* TL Operations (kalau Round 31 sudah jalan) */}
      {hasMigration && TlOperations && (
        <div className="bg-gradient-to-br from-brand-50 to-white rounded-xl border border-brand-200 shadow-card p-5">
          <h2 className="text-lg font-bold text-brand-700 mb-3">🎯 Operasional TL</h2>
          <TlOperations
            trip={trip}
            expenses={expenses}
            gmapsReviews={gmapsReviews}
            vendorReviews={vendorReviews}
          />
        </div>
      )}

      {/* Flight info */}
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
          <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">📝 Catatan Trip</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{trip.notes}</p>
        </div>
      )}

      {/* Participants + Manifest/Roomlist links */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-brand-700">👥 Daftar Peserta ({passengers.length})</h3>
          <div className="flex gap-2 flex-wrap">
            <a href={`/visa/${tripId}/manifest.csv`} className="text-xs font-semibold px-3 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100">📋 Manifest CSV</a>
            <a href={`/visa/${tripId}/roomlist.csv`} className="text-xs font-semibold px-3 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100">🛏 Roomlist CSV</a>
            <a href={`/visa/${tripId}/roomlist.xls`} className="text-xs font-semibold px-3 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100">📊 Roomlist Excel</a>
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

      {/* Action shortcuts */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">🔗 Shortcut</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Link href={`/trips/${tripId}`} className="p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 text-center text-xs">
            <p className="text-xl mb-1">📋</p>
            <p className="font-semibold text-slate-700">Trip Detail</p>
          </Link>
          <Link href={`/visa/${tripId}`} className="p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 text-center text-xs">
            <p className="text-xl mb-1">🛂</p>
            <p className="font-semibold text-slate-700">Visa Checklist</p>
          </Link>
          <Link href={`/visa/${tripId}/roomlist`} className="p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 text-center text-xs">
            <p className="text-xl mb-1">🛏</p>
            <p className="font-semibold text-slate-700">Roomlist Editor</p>
          </Link>
          <Link href={`/finance/payments/${tripId}`} className="p-3 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 text-center text-xs">
            <p className="text-xl mb-1">🧾</p>
            <p className="font-semibold text-slate-700">Payment Status</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, small = false }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold text-brand-700 ${small ? 'text-base' : 'text-lg'}`}>{value}</p>
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
