import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PnrForm from '@/components/finance/PnrForm';
import TicketIssueChecklist from '@/components/finance/TicketIssueChecklist';
import { updatePnr } from '@/lib/actions/pnr';

export default async function EditPnrPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: pnr, error } = await supabase.from('flight_inventory').select('*').eq('id', id).maybeSingle();

  if (error || !pnr) notFound();

  const { data: trips } = await supabase
    .from('trips').select('id, kode_trip, name, departure, status')
    .order('departure', { ascending: false, nullsFirst: false });
  const activeTrips = (trips || []).filter((t) => t.status !== 'completed' && t.status !== 'cancelled');

  // ── Checklist issued peserta — HANYA tiket FIT & Domestik yg sudah ke-connect ke trip ──
  const isFitOrDom = ['fit', 'domestic'].includes(pnr.ticket_type);
  let ticketGroups = [];
  if (isFitOrDom && pnr.trip_id) {
    try {
      const { data: linkedTrip } = await supabase
        .from('trips').select('id, kode_trip, name, departure, status').eq('id', pnr.trip_id).maybeSingle();
      const tripDone = ['completed', 'cancelled'].includes(String(linkedTrip?.status || '').toLowerCase());
      if (linkedTrip && !tripDone) {
        const { data: paxRows } = await supabase.from('trip_passengers')
          .select('id, customer_id, transfer_status, refund_status, ticket_issued')
          .eq('trip_id', pnr.trip_id);
        const active = (paxRows || []).filter((p) => p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund');
        const custIds = [...new Set(active.map((p) => p.customer_id).filter(Boolean))];
        const nameOf = {};
        for (let i = 0; i < custIds.length; i += 500) {
          const { data } = await supabase.from('customers').select('id, name').in('id', custIds.slice(i, i + 500));
          for (const c of (data || [])) nameOf[c.id] = c.name || '';
        }
        const peserta = active
          .map((p) => ({ id: p.id, nama: nameOf[p.customer_id] || `Peserta #${p.id}`, ticket_issued: p.ticket_issued === true }))
          .sort((a, b) => a.nama.localeCompare(b.nama));
        if (peserta.length) {
          ticketGroups = [{ id: linkedTrip.id, kode: linkedTrip.kode_trip || `#${linkedTrip.id}`, name: linkedTrip.name || '', departure: linkedTrip.departure || null, peserta }];
        }
      }
    } catch {}
  }

  const updateThisPnr = updatePnr.bind(null, id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/finance/pnr" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke list</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Edit PNR</h1>
        <p className="mt-1 text-slate-600">
          <span className="font-mono font-bold">{pnr.pnr}</span>
          {pnr.route && ` — ${pnr.route}`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <PnrForm initial={pnr} onSubmit={updateThisPnr} submitLabel="Update PNR" trips={activeTrips} />
      </div>

      {isFitOrDom && pnr.trip_id ? (
        ticketGroups.length ? (
          <TicketIssueChecklist groups={ticketGroups} />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 text-sm text-slate-500">
            Belum ada peserta aktif di trip yang ke-connect untuk di-checklist tiket.
          </div>
        )
      ) : null}
    </div>
  );
}
