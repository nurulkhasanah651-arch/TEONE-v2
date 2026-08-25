'use client';

// Monitor Ticketing — tampilan sama dgn kartu "MONITOR TICKETING" di Dashboard
// Manager, dipakai di halaman Operasional > Ticketing. Follow-up harian pakai
// tabel manager_followups yg sama (sinkron dgn Dashboard Manager).
// ADITIF: tidak mengubah ManagerDashboard.jsx.
// Path: components/operasional/TicketingMonitor.jsx

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { markTicketingFollowup } from '@/lib/actions/ticketing-monitor';

function Card({ title, icon, accent, count, open, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <button type="button" onClick={onToggle} className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left ${accent} hover:brightness-95 transition`}>
        <h2 className="font-extrabold text-slate-800 flex items-center gap-2 text-sm tracking-wide">{icon} {title}</h2>
        <span className="flex items-center gap-2 shrink-0">
          {count > 0
            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{count} perlu tindak</span>
            : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">aman ✅</span>}
          <span className="text-slate-500 text-sm">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && <div className="p-3 space-y-3 border-t border-slate-200">{children}</div>}
    </div>
  );
}

function Block({ label, hint, items, empty = 'Tidak ada — aman ✅', color = 'text-slate-700', children }) {
  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-wide ${color}`}>{label} {items != null && <span className="text-slate-400 font-semibold">({items})</span>}</p>
      {hint && <p className="text-[10px] text-slate-400 mb-1">{hint}</p>}
      <div className="mt-1 space-y-1.5">{items === 0 ? <p className="text-[11px] text-emerald-600">{empty}</p> : children}</div>
    </div>
  );
}

function TripLine({ t, href, right }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
      <Link href={href} className="min-w-0 flex-1 hover:underline">
        <span className="text-xs font-bold text-brand-700">{t.kode}</span>
        <span className="text-xs text-slate-600"> · {t.name}</span>
        <span className="block text-[10px] text-slate-400">{t.departureFmt}{t.daysToDep != null ? ` · H-${t.daysToDep}` : ''}{t.quota ? ` · ${t.sold}/${t.quota} seat` : ''}</span>
      </Link>
      {right}
    </div>
  );
}

export default function TicketingMonitor({ data }) {
  const [, start] = useTransition();
  const [hidden, setHidden] = useState({}); // `${section}:${tripId}` -> bool
  const [open, setOpen] = useState(true);   // halaman khusus → default terbuka

  function follow(section, tripId) {
    const key = `${section}:${tripId}`;
    setHidden((m) => ({ ...m, [key]: true }));
    start(async () => { const r = await markTicketingFollowup(section, tripId); if (r?.error) { setHidden((m) => ({ ...m, [key]: false })); alert('Gagal: ' + r.error); } });
  }

  const d = data || {};
  const T = d.ticketing || {};
  const vis = (section, arr) => (arr || []).filter((t) => !hidden[`${section}:${t.id}`]);

  const FollowBtn = ({ section, tripId, label = '✓ Follow up' }) => (
    <button type="button" onClick={() => follow(section, tripId)}
      title="Tandai sudah ditindaklanjuti hari ini — muncul lagi besok kalau belum diupdate tim"
      className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-300 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-sky-100">
      {label}
    </button>
  );

  const HREF = '/operasional/ticketing';
  const cntTicketing = vis('ticketing.fullNoTicket', T.fullNoTicket).length + vis('ticketing.readyToBuy', T.readyToBuyTicket).length + vis('ticketing.notIssued', T.notIssued).length;

  return (
    <Card title="MONITOR TICKETING" icon="🎫" accent="bg-sky-50" count={cntTicketing} open={open} onToggle={() => setOpen((v) => !v)}>
      <Block label="Full tapi belum ada tiket" hint="Group full tapi belum ada PNR ke-connect — segera issue tiket." items={vis('ticketing.fullNoTicket', T.fullNoTicket).length} color="text-red-700">
        {vis('ticketing.fullNoTicket', T.fullNoTicket).map((t) => <TripLine key={t.id} t={t} href={HREF} right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-red-600 whitespace-nowrap">FULL · no tiket</span><FollowBtn section="ticketing.fullNoTicket" tripId={t.id} /></div>} />)}
      </Block>
      <Block label="Siap beli tiket (≥70% terisi)" hint="Group sudah terisi ≥70% tapi belum ada PNR ke-connect — siapkan/kunci tiket sebelum penuh." items={vis('ticketing.readyToBuy', T.readyToBuyTicket).length} color="text-orange-700">
        {vis('ticketing.readyToBuy', T.readyToBuyTicket).map((t) => <TripLine key={t.id} t={t} href={HREF} right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-orange-600 whitespace-nowrap">{t.fillPct}% · siap beli tiket</span><FollowBtn section="ticketing.readyToBuy" tripId={t.id} /></div>} />)}
      </Block>
      <Block label="Peserta belum di-issue" hint="Tiket FIT/Domestik yg sudah ke-connect tapi peserta belum dicentang issued. Checklist ada di Edit PNR." items={vis('ticketing.notIssued', T.notIssued).length} color="text-amber-700">
        {vis('ticketing.notIssued', T.notIssued).map((t) => (
          <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <Link href={HREF} className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span></Link>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">{t.belum}/{t.total} belum</span>
                <FollowBtn section="ticketing.notIssued" tripId={t.id} />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">{(t.peserta || []).map((p) => p.nama).join(', ')}</p>
            <Link href={HREF} className="text-[10px] font-semibold text-brand-600 hover:underline">→ buka PNR, centang di Edit PNR</Link>
          </div>
        ))}
      </Block>
    </Card>
  );
}
