// Checklist Operasional per Group (per trip). Pilih trip → centang progres operasional.
// State disimpan di trips.ops_checklist (jsonb). Path: app/(app)/operasional/checklist/page.jsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import OpsChecklistPicker from '@/components/operasional/OpsChecklistPicker';
import OpsChecklist from '@/components/operasional/OpsChecklist';
import { countDone } from '@/lib/utils/ops-checklist-items';

export const dynamic = 'force-dynamic';

function isActive(p) {
  return p.status !== 'cancelled' && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}

export default async function OpsChecklistPage({ searchParams }) {
  const sp = await searchParams;
  const tripId = sp?.trip || null;
  const supabase = createClient();

  if (!tripId) {
    const [{ data: trips }, { data: pax }] = await Promise.all([
      supabase
        .from('trips')
        .select('id, kode_trip, name, public_title, departure, status, pic, ops_pic, ops_checklist')
        .neq('status', 'cancelled')
        .order('departure', { ascending: false, nullsFirst: false }),
      supabase.from('trip_passengers').select('trip_id, status, transfer_status, refund_status'),
    ]);
    const cnt = {};
    for (const p of (pax || [])) { if (isActive(p)) cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1; }
    const list = (trips || []).map((t) => ({
      id: t.id,
      kode: t.kode_trip || '',
      name: t.public_title || t.name || '',
      departure: t.departure,
      status: t.status,
      pic: t.pic || '',
      opsPic: t.ops_pic || '',
      pax: cnt[t.id] || 0,
      done: countDone(t.ops_checklist),
    }));
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
        </div>

        {/* Shortcut ke modul lain utk trip yg sama (biar gak nyari satu-satu) */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { href: `/trips/${trip.id}`, label: '🧭 Master Trip' },
            { href: `/operasional/profit-estimate?trip=${encodeURIComponent(trip.id)}`, label: '💰 Estimate Profit' },
            { href: `/operasional/roomlist?trip=${encodeURIComponent(trip.id)}`, label: '🛏 Final Roomlist' },
            { href: `/operasional/itinerary?trip=${encodeURIComponent(trip.id)}`, label: '🗺 Itinerary' },
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
