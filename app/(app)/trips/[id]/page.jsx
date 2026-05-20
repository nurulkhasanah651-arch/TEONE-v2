// Trip Detail page — shows all info + edit/delete buttons + participants
// Server Component fetches the trip + participants

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';
import { statusCfg, tripChecklist } from '@/lib/utils/trip-status';
import ParticipantsList from '@/components/trips/ParticipantsList';

export const dynamic = 'force-dynamic';

export default async function TripDetailPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: trip, error } = await supabase.from('trips').select('*').eq('id', id).maybeSingle();

  if (error || !trip) {
    notFound();
  }

  const s = statusCfg(trip.status);
  const days = daysUntil(trip.departure);
  const checklist = tripChecklist(trip);
  const revenue = (trip.price || 0) * (trip.sold || 0);

  // Fetch participants (trip_passengers joined with customers)
  const { data: participants } = await supabase
    .from('trip_passengers')
    .select('*, customers(*)')
    .eq('trip_id', id)
    .order('joined_at', { ascending: true });

  // Recent CS updates for this trip
  const { data: recentCS } = await supabase
    .from('cs_daily_updates')
    .select('*')
    .eq('trip_id', id)
    .order('tanggal', { ascending: false })
    .limit(5);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/trips" className="text-sm text-brand-600 font-medium hover:underline">← Kembali</Link>
        <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
                {trip.kode_trip || `#${trip.id}`}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${s.bg} ${s.text} ${s.border}`}>
                {s.label}
              </span>
              {trip.ticket && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{trip.ticket}</span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-brand-700">{trip.name}</h1>
            {trip.destination && <p className="mt-1 text-slate-600">{trip.destination}</p>}
          </div>
          <Link
            href={`/trips/${trip.id}/edit`}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors"
          >
            ✎ Edit Trip
          </Link>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Seat Terjual" value={`${trip.sold || 0} / ${trip.quota || 0}`} color="text-brand-700" />
        <StatCard label="Sisa Seat" value={trip.seat_left ?? 0} color="text-amber-700" />
        <StatCard label="Harga / Pax" value={fmtRupiah(trip.price)} color="text-blue-700" small />
        <StatCard label="Revenue" value={fmtRupiah(revenue)} color="text-green-700" small />
      </div>

      {/* Operations Status */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">Status Operasional</h3>
          <Link href={`/trips/${trip.id}/edit`} className="text-xs font-semibold text-brand-600 hover:underline">
            ✎ Update Status
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatusPill label="Tiket" value={trip.ticket_status} okValues={['confirmed', 'issued']} />
          <StatusPill label="Visa" value={trip.visa} okValues={['done', 'approved', 'process']} />
          <StatusPill label="Manifest" value={trip.manifest} okValues={['ready']} />
          <StatusPill label="Room List" value={trip.roomlist} okValues={['ready']} />
          <StatusPill label="Payment" value={trip.payment} okValues={['lunas']} />
          <StatusPill label="Briefing TL" value={trip.briefing_tl} okValues={['sudah']} />
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard title="Tanggal">
          <InfoRow label="Keberangkatan" value={fmtDate(trip.departure)} note={days > 0 ? `${days} hari lagi` : null} />
          <InfoRow label="Kepulangan" value={fmtDate(trip.arrival)} />
          <InfoRow label="Deadline Booking" value={fmtDate(trip.deadline_close)} />
        </InfoCard>

        <InfoCard title="Tim">
          <InfoRow label="PIC (CS)" value={trip.pic || '—'} />
          <InfoRow label="Tour Leader" value={trip.tl_name || '—'} />
          {trip.tl_assignment_status && (
            <InfoRow label="Status TL" value={trip.tl_assignment_status} />
          )}
        </InfoCard>

        {trip.notes && (
          <InfoCard title="Catatan" className="lg:col-span-2">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{trip.notes}</p>
          </InfoCard>
        )}
      </div>

      {/* Participants */}
      <ParticipantsList tripId={trip.id} participants={participants || []} />

      {/* Recent CS updates */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-brand-700">Update CS Terbaru</h2>
          <Link href="/cs/new" className="text-xs font-semibold text-brand-600 hover:underline">+ Tambah Update</Link>
        </div>
        {!recentCS || recentCS.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">Belum ada update CS untuk trip ini</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentCS.map((u) => (
              <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm text-slate-600 font-medium">{fmtDate(u.tanggal)}</span>
                <div className="flex gap-3 text-xs">
                  <span className="px-2 py-1 rounded bg-green-50 text-green-700 font-semibold">Terjual: {u.total_terjual_hari_ini || 0}</span>
                  <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold">Leads: {u.jumlah_leads || 0}</span>
                  <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 font-semibold">Sisa: {u.sisa_seat || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, small = false }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}

function InfoCard({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card p-5 ${className}`}>
      <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, note }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">
        {value}
        {note && <span className="ml-1 text-xs text-brand-600 font-medium">({note})</span>}
      </span>
    </div>
  );
}

function StatusPill({ label, value, okValues = [] }) {
  const isOk = value && okValues.includes(value);
  const display = value || 'pending';
  return (
    <div className={`rounded-lg p-2.5 border ${isOk ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${isOk ? 'text-green-700' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-0.5 text-sm font-bold capitalize ${isOk ? 'text-green-800' : 'text-slate-700'}`}>
        {isOk && '✓ '}{display}
      </p>
    </div>
  );
}
