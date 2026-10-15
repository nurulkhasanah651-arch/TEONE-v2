// Checklist Operasional per Group (per trip). Pilih trip → centang progres operasional.
// State disimpan di trips.ops_checklist (jsonb). Path: app/(app)/operasional/checklist/page.jsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';
import OpsChecklistPicker from '@/components/operasional/OpsChecklistPicker';
import OpsChecklist from '@/components/operasional/OpsChecklist';
import { countDone } from '@/lib/utils/ops-checklist-items';
import { deriveVisaStage } from '@/lib/utils/visa-constants';

export const dynamic = 'force-dynamic';

function isActive(p) {
  return p.status !== 'cancelled' && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}

export default async function OpsChecklistPage({ searchParams }) {
  const sp = await searchParams;
  const tripId = sp?.trip || null;
  const supabase = createClient();

  if (!tripId) {
    // Service client (bypass RLS) biar jumlah peserta & status visa sama kaya tab Visa.
    const svcUrl = brandSupabaseUrl(); const svcKey = brandServiceRoleKey();
    const db = (svcUrl && svcKey) ? createServiceClient(svcUrl, svcKey, { auth: { persistSession: false, autoRefreshToken: false } }) : supabase;

    const { data: trips } = await supabase
      .from('trips')
      .select('id, kode_trip, name, public_title, departure, status, pic, ops_pic, ops_checklist, visa_doc_template')
      .neq('status', 'cancelled')
      .order('departure', { ascending: false, nullsFirst: false });

    // Peserta: paginate (trip_passengers bisa > 1000 → hindari cap PostgREST). Plus field status visa.
    let passengers = [];
    try {
      for (let from = 0; ; from += 1000) {
        const { data } = await db.from('trip_passengers')
          .select('id, trip_id, status, transfer_status, refund_status, visa_docs, visa_status, visa_biometric_date, include_visa, visa_ready, visa_result')
          .order('id', { ascending: true })
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        passengers = passengers.concat(data);
        if (data.length < 1000) break;
      }
    } catch { passengers = []; }

    // visaPaid dari pembayaran Visa (utk status "siap biometrik / perlu dijadwalkan").
    try {
      const ids = passengers.map((p) => p.id);
      const paid = {};
      for (let i = 0; i < ids.length; i += 1000) {
        const { data: pays } = await db.from('participant_payments')
          .select('passenger_id, amount, is_transferred').eq('type', 'Visa').in('passenger_id', ids.slice(i, i + 1000));
        for (const r of (pays || [])) { if (r.is_transferred !== true && Number(r.amount) > 0) paid[r.passenger_id] = true; }
      }
      for (const p of passengers) p.visaPaid = paid[p.id] === true;
    } catch {}

    const activeByTrip = {};
    for (const p of passengers) { if (isActive(p)) { (activeByTrip[p.trip_id] = activeByTrip[p.trip_id] || []).push(p); } }

    const list = (trips || []).map((t) => {
      const pax = activeByTrip[t.id] || [];
      const tmpl = t.visa_doc_template || [];
      const sc = { belum_mulai: 0, lengkapi_dokumen: 0, siap_biometrik: 0, biometrik_terjadwal: 0, proses: 0, approved: 0, rejected: 0, punya_visa: 0, tidak_perlu: 0 };
      for (const p of pax) { const s = deriveVisaStage(p, tmpl); sc[s.key] = (sc[s.key] || 0) + 1; }
      // Chip status visa — sinkron dgn tab Visa (deriveVisaStage yg sama).
      const visaChips = [
        sc.approved > 0 && { t: `✅ ${sc.approved} approve`, c: 'bg-green-50 text-green-700 border-green-200' },
        sc.proses > 0 && { t: `⏳ ${sc.proses} proses`, c: 'bg-purple-50 text-purple-700 border-purple-200' },
        sc.biometrik_terjadwal > 0 && { t: `📅 ${sc.biometrik_terjadwal} terjadwal`, c: 'bg-blue-50 text-blue-700 border-blue-200' },
        sc.siap_biometrik > 0 && { t: `🧬 ${sc.siap_biometrik} blm dijadwalkan`, c: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
        sc.lengkapi_dokumen > 0 && { t: `📄 ${sc.lengkapi_dokumen} lengkapi dok`, c: 'bg-amber-50 text-amber-700 border-amber-200' },
        sc.belum_mulai > 0 && { t: `🔴 ${sc.belum_mulai} belum diurus`, c: 'bg-rose-50 text-rose-700 border-rose-200' },
        sc.rejected > 0 && { t: `✗ ${sc.rejected} ditolak`, c: 'bg-red-50 text-red-700 border-red-200' },
        sc.punya_visa > 0 && { t: `🛂 ${sc.punya_visa} punya visa`, c: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      ].filter(Boolean);
      return {
        id: t.id,
        kode: t.kode_trip || '',
        name: t.public_title || t.name || '',
        departure: t.departure,
        status: t.status,
        pic: t.pic || '',
        opsPic: t.ops_pic || '',
        pax: pax.length,
        done: countDone(t.ops_checklist),
        visaChips,
      };
    });
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">✅ Checklist Trip per Group</h1>
          <p className="mt-1 text-slate-600">Pilih trip untuk centang progres operasional: penawaran, booking & pelunasan, dokumen, optional tour, sampai serah terima ke TL.</p>
        </div>
        <OpsChecklistPicker trips={list} />
      </div>
    );
  }

  const { data: trip } = await supabase
    .from('trips')
    .select('id, kode_trip, name, public_title, departure, pic, ops_pic, ops_checklist')
    .eq('id', tripId)
    .maybeSingle();

  // Status tiket langsung dari PNR Inventory (flight_inventory) — group / fit / domestic.
  const { data: tix } = await supabase
    .from('flight_inventory')
    .select('pnr, ticket_type, ticket_issued, status')
    .eq('trip_id', tripId);
  const tickets = Array.isArray(tix) ? tix : [];
  const hasTicket = tickets.length > 0;
  const pnrList = tickets.map((t) => t.pnr).filter(Boolean);
  const tixTypes = Array.from(new Set(tickets.map((t) => t.ticket_type).filter(Boolean)));
  const allIssued = hasTicket && tickets.every((t) => t.ticket_issued);

  if (!trip) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <Link href="/operasional/checklist" className="text-sm text-brand-600 font-medium hover:underline">← Pilih trip lain</Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ Trip tidak ditemukan.</div>
      </div>
    );
  }

  const title = trip.public_title || trip.name || `Trip #${trip.id}`;
  let dep = '';
  try { dep = trip.departure ? new Date(trip.departure + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch { dep = trip.departure || ''; }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <Link href="/operasional/checklist" className="text-sm text-brand-600 font-medium hover:underline">← Pilih trip lain</Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-700">✅ {trip.kode_trip || `#${trip.id}`}</h1>
        <p className="mt-0.5 text-slate-600">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{dep}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            PIC Trip: {trip.pic || '—'}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
            PIC Ops: {trip.ops_pic || '—'}
          </span>
          {hasTicket ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              🎫 Tiket ada{tixTypes.length ? ` (${tixTypes.join(', ')})` : ''}{allIssued ? ' · issued' : ''}{pnrList.length ? ` · ${pnrList.join(', ')}` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              🎫 Belum ada tiket
            </span>
          )}
        </div>

        {/* Shortcut ke modul lain utk trip yg sama (biar gak nyari satu-satu) */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { href: `/trips/${trip.id}`, label: '🧭 Master Trip' },
            { href: `/operasional/profit-estimate?trip=${encodeURIComponent(trip.id)}`, label: '💰 Estimate Profit' },
            { href: `/operasional/roomlist?trip=${encodeURIComponent(trip.id)}`, label: '🛏 Final Roomlist' },
            { href: `/operasional/itinerary?trip=${encodeURIComponent(trip.id)}`, label: '🗺 Itinerary' },
            { href: `/operasional/optional-tour/${encodeURIComponent(trip.id)}`, label: '🎈 Optional Tour' },
            { href: `/finance/pnr`, label: '🎫 PNR Inventory' },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              target="_blank"
              className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white text-slate-600 border border-slate-300 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition"
            >
              {l.label} ↗
            </Link>
          ))}
        </div>
      </div>
      <OpsChecklist tripId={trip.id} initial={trip.ops_checklist || {}} />
    </div>
  );
}
