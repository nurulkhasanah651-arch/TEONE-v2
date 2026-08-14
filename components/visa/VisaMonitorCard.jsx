'use client';

// MONITOR VISA — tampilan sama persis dgn kartu "MONITOR VISA" di Dashboard Manager,
// dipakai di Dashboard Tim Visa (/visa/dashboard). 4 blok alert:
// groupH60 · notProcessed · paidUnscheduled · fullH5.
// Path: components/visa/VisaMonitorCard.jsx
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { markVisaFollowup } from '@/lib/actions/visa-dashboard';

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

export default function VisaMonitorCard({ visa }) {
  const [, start] = useTransition();
  const [hidden, setHidden] = useState({}); // `${section}:${tripId}` -> bool
  const [open, setOpen] = useState(true);

  const V = visa || {};
  const vis = (section, arr) => (arr || []).filter((t) => !hidden[`${section}:${t.id}`]);

  function follow(section, tripId) {
    const key = `${section}:${tripId}`;
    setHidden((m) => ({ ...m, [key]: true }));
    start(async () => { const r = await markVisaFollowup(section, tripId); if (r?.error) { setHidden((m) => ({ ...m, [key]: false })); alert('Gagal: ' + r.error); } });
  }

  const FollowBtn = ({ section, tripId, label = '✓ Follow up' }) => (
    <button type="button" onClick={() => follow(section, tripId)}
      title="Tandai sudah ditindaklanjuti hari ini — muncul lagi besok kalau belum diupdate tim"
      className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-300 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-sky-100">
      {label}
    </button>
  );

  const cntVisa = vis('visa.groupH60', V.groupH60).length + vis('visa.notProcessed', V.notProcessed).length + vis('visa.paidUnscheduled', V.paidUnscheduled).length + vis('visa.fullH5', V.fullH5).length;

  return (
    <Card title="MONITOR VISA" icon="🛂" accent="bg-indigo-50" count={cntVisa} open={open} onToggle={() => setOpen((v) => !v)}>
      <Block label="🚨 URUS VISA GROUP! udah H-60!" hint="Trip visa GROUP sudah ≤ 2 bulan ke keberangkatan — visa group harus segera diurus." items={vis('visa.groupH60', V.groupH60).length} color="text-red-700">
        {vis('visa.groupH60', V.groupH60).map((t) => <TripLine key={t.id} t={t} href={`/visa/${t.id}`} right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-extrabold text-red-700 whitespace-nowrap">URUS VISA GROUP! H-{t.daysToDep}</span><FollowBtn section="visa.groupH60" tripId={t.id} /></div>} />)}
      </Block>
      <Block label="Belum proses & belum bayar visa" hint="Trip visa individual: peserta butuh visa tapi belum bayar & belum diproses — segera proses." items={vis('visa.notProcessed', V.notProcessed).length} color="text-red-700">
        {vis('visa.notProcessed', V.notProcessed).map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/visa/${t.id}`} className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span> <span className="text-[10px] text-slate-400">H-{t.daysToDep}</span></Link>
              <FollowBtn section="visa.notProcessed" tripId={t.id} />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">{t.belum} peserta: {t.peserta.map((p) => p.nama).join(', ')}</p>
          </div>
        ))}
      </Block>
      <Block label="Sudah bayar visa, belum dijadwalkan biometrik" hint="Follow up ke tim visa untuk penjadwalan." items={vis('visa.paidUnscheduled', V.paidUnscheduled).length} color="text-amber-700">
        {vis('visa.paidUnscheduled', V.paidUnscheduled).map((t) => (
          <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/visa/${t.id}`} className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span></Link>
              <FollowBtn section="visa.paidUnscheduled" tripId={t.id} />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">{t.belum} peserta: {t.peserta.map((p) => p.nama).join(', ')}</p>
          </div>
        ))}
      </Block>
      <Block label="Group full — mulai proses visa (H-5 bulan)" hint="Group sudah full & mendekati keberangkatan, visa harus segera jalan." items={vis('visa.fullH5', V.fullH5).length} color="text-purple-700">
        {vis('visa.fullH5', V.fullH5).map((t) => <TripLine key={t.id} t={t} href={`/visa/${t.id}`} right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-purple-600 whitespace-nowrap">{t.belum} blm proses</span><FollowBtn section="visa.fullH5" tripId={t.id} /></div>} />)}
      </Block>
    </Card>
  );
}
