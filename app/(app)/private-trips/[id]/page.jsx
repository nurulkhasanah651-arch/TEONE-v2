// R224: Private Trip Request — Detail page (internal)
// Path: app/(app)/private-trips/[id]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import PrivateTripActions from '@/components/private-trips/PrivateTripActions';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const dynamic = 'force-dynamic';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

function fmtRupiah(n) {
  if (!n) return '—';
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

const STATUS_BADGE = {
  new: { label: '🆕 NEW', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  contacted: { label: '📞 Contacted', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  quoted: { label: '📋 Quoted', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  accepted: { label: '✅ Accepted', color: 'bg-green-100 text-green-800 border-green-300' },
  declined: { label: '❌ Declined', color: 'bg-slate-100 text-slate-600 border-slate-300' },
  archived: { label: '📦 Archived', color: 'bg-slate-50 text-slate-500 border-slate-200' },
};

const TRIP_TYPE_LABEL = {
  honeymoon: '💑 Honeymoon',
  family: '👨‍👩‍👧 Family',
  group: '👥 Group',
  corporate: '🏢 Corporate',
  school: '🎓 School',
  other: '🌐 Lainnya',
};

const ACCOMMODATION_LABEL = {
  hotel_3: 'Hotel ⭐⭐⭐',
  hotel_4: 'Hotel ⭐⭐⭐⭐',
  hotel_5: 'Hotel ⭐⭐⭐⭐⭐',
  villa: '🏡 Villa',
  resort: '🏝 Resort',
  mixed: '🧳 Campuran',
  flexible: '🤝 Fleksibel',
};

export default async function PrivateTripDetailPage({ params }) {
  const { id } = await params;
  const supabase = getServiceClient() || createClient();

  const { data: request } = await supabase
    .from('private_trip_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!request) notFound();

  const badge = STATUS_BADGE[request.status] || STATUS_BADGE.new;
  const tripType = TRIP_TYPE_LABEL[request.trip_type] || '—';
  const accommodation = ACCOMMODATION_LABEL[request.accommodation_type] || '—';
  const totalBudget = request.estimate_budget
    ? (request.budget_type === 'per_pax' ? request.estimate_budget * request.pax_count : request.estimate_budget)
    : 0;

  const replies = Array.isArray(request.quick_replies) ? request.quick_replies : [];

  // WhatsApp pre-fill link
  const cleanPhone = String(request.phone).replace(/\D/g, '').replace(/^0/, '62');
  const waMessage = encodeURIComponent(
    `Halo ${request.name}, terima kasih sudah submit request private trip ke ${request.destination}!\n\nTim kami sudah terima request kamu (Ref #${request.id}) dan ingin diskusi lebih detail.\n\nKapan waktu yg cocok buat ngobrol? 😊`
  );
  const waLink = `https://wa.me/${cleanPhone}?text=${waMessage}`;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <Link href="/private-trips" className="text-sm text-indigo-600 font-medium hover:underline">
          ← Daftar Request
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-bold px-2.5 py-1 rounded border ${badge.color}`}>
                {badge.label}
              </span>
              <span className="text-xs text-slate-500 font-mono">Ref #{request.id}</span>
              {tripType !== '—' && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">{tripType}</span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-indigo-700">{request.name}</h1>
            <p className="text-sm text-slate-600 mt-1">
              Submitted {fmtDateTime(request.created_at)}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg inline-flex items-center gap-1.5"
            >
              💬 Chat WA
            </a>
            <a
              href={`tel:${request.phone}`}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg inline-flex items-center gap-1.5"
            >
              📞 Call
            </a>
            <Link
              href={`/quotations/new?from_request=${request.id}&name=${encodeURIComponent(request.name)}&phone=${encodeURIComponent(request.phone)}&destination=${encodeURIComponent(request.destination)}&pax=${request.pax_count}`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg inline-flex items-center gap-1.5"
            >
              📋 Buat Quotation
            </Link>
          </div>
        </div>
      </div>

      {/* Status Actions */}
      <PrivateTripActions request={request} />

      {/* Main Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contact */}
        <InfoCard title="👤 Data Kontak">
          <InfoRow label="Nama" value={request.name} />
          <InfoRow label="Phone/WA" value={request.phone} mono />
          <InfoRow label="Email" value={request.email || '—'} />
        </InfoCard>

        {/* Trip Detail */}
        <InfoCard title="✈ Detail Trip">
          <InfoRow label="Destinasi" value={request.destination} highlight />
          <InfoRow label="Tipe" value={tripType} />
          <InfoRow label="Jumlah Pax" value={`${request.pax_count} orang`} />
          <InfoRow
            label="Tanggal"
            value={request.start_date
              ? `${fmtDate(request.start_date)}${request.end_date ? ` - ${fmtDate(request.end_date)}` : ''}${request.duration_days ? ` (${request.duration_days} hari)` : ''}`
              : '—'}
          />
          <InfoRow label="Akomodasi" value={accommodation} />
        </InfoCard>

        {/* Budget */}
        <InfoCard title="💰 Budget" className="lg:col-span-2">
          {request.estimate_budget ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-amber-50 rounded border border-amber-200">
                <p className="text-xs font-bold text-amber-700 uppercase">
                  {request.budget_type === 'per_pax' ? 'Per Pax' : 'Total Group'}
                </p>
                <p className="text-xl font-bold text-amber-800">{fmtRupiah(request.estimate_budget)}</p>
              </div>
              {request.budget_type === 'per_pax' && (
                <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                  <p className="text-xs font-bold text-emerald-700 uppercase">Total Estimate</p>
                  <p className="text-xl font-bold text-emerald-800">{fmtRupiah(totalBudget)}</p>
                  <p className="text-[10px] text-emerald-600">{request.pax_count} × {fmtRupiah(request.estimate_budget)}</p>
                </div>
              )}
              <div className="p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs font-bold text-blue-700 uppercase">Per Hari (Est)</p>
                <p className="text-xl font-bold text-blue-800">
                  {request.duration_days ? fmtRupiah(Math.round(totalBudget / request.duration_days)) : '—'}
                </p>
                <p className="text-[10px] text-blue-600">
                  {request.duration_days ? `${request.duration_days} hari` : 'Durasi belum di-set'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 italic text-sm">Budget belum diisi — perlu diskusi dgn customer</p>
          )}
        </InfoCard>

        {/* Itinerary Idea */}
        {request.itinerary_idea && (
          <InfoCard title="💭 Ide Itinerary" className="lg:col-span-2">
            <p className="text-slate-700 whitespace-pre-wrap">{request.itinerary_idea}</p>
          </InfoCard>
        )}

        {/* Special Request */}
        {request.special_request && (
          <InfoCard title="📝 Request Khusus" className="lg:col-span-2">
            <p className="text-slate-700 whitespace-pre-wrap">{request.special_request}</p>
          </InfoCard>
        )}

        {/* UTM Tracking */}
        {(request.utm_source || request.utm_medium || request.utm_campaign) && (
          <InfoCard title="📊 Marketing Source" className="lg:col-span-2">
            <div className="flex gap-3 flex-wrap text-xs">
              {request.utm_source && <Tag label="Source" value={request.utm_source} />}
              {request.utm_medium && <Tag label="Medium" value={request.utm_medium} />}
              {request.utm_campaign && <Tag label="Campaign" value={request.utm_campaign} />}
            </div>
          </InfoCard>
        )}
      </div>

      {/* Quick Replies History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-indigo-700">💬 Quick Reply History ({replies.length})</h2>
        </div>
        {replies.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">Belum ada reply</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {replies.map((rep, i) => (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-indigo-700">{rep.by}</span>
                  <span className="text-[10px] text-slate-500">{fmtDateTime(rep.at)}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{rep.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata Footer */}
      <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-500 space-y-1">
        <p><b>Created:</b> {fmtDateTime(request.created_at)}</p>
        {request.contacted_at && <p><b>First contacted:</b> {fmtDateTime(request.contacted_at)}</p>}
        {request.quoted_at && <p><b>Quoted:</b> {fmtDateTime(request.quoted_at)}</p>}
        {request.closed_at && <p><b>Closed:</b> {fmtDateTime(request.closed_at)}</p>}
        {request.ip_address && <p><b>IP:</b> <span className="font-mono">{request.ip_address}</span></p>}
      </div>
    </div>
  );
}

function InfoCard({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card p-5 ${className}`}>
      <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, highlight }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm text-right ${highlight ? 'font-bold text-indigo-700' : 'font-semibold text-slate-800'} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function Tag({ label, value }) {
  return (
    <span className="px-2 py-1 bg-slate-100 rounded">
      <b>{label}:</b> {value}
    </span>
  );
}
