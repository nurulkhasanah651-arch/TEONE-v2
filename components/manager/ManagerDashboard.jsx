'use client';

// Dashboard Manager — pantauan harian. Path: components/manager/ManagerDashboard.jsx
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { setOfferingVendor } from '@/lib/actions/profit-estimate';
import { markFollowup, setDeparturePrep } from '@/lib/actions/manager-dashboard';

function Card({ title, icon, accent, count, open, onToggle, children }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden`}>
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

export default function ManagerDashboard({ data }) {
  const [, start] = useTransition();
  const [offered, setOffered] = useState({}); // tripId -> bool override
  const [hidden, setHidden] = useState({}); // `${section}:${tripId}` -> bool
  const [openCard, setOpenCard] = useState({}); // cardKey -> bool (default collapsed)
  const toggleCard = (k) => setOpenCard((m) => ({ ...m, [k]: !m[k] }));

  function markOffered(tripId) {
    setOffered((m) => ({ ...m, [tripId]: true }));
    start(async () => { const r = await setOfferingVendor(tripId, true); if (r?.error) { setOffered((m) => ({ ...m, [tripId]: false })); alert('Gagal: ' + r.error); } });
  }

  function follow(section, tripId) {
    const key = `${section}:${tripId}`;
    setHidden((m) => ({ ...m, [key]: true }));
    start(async () => { const r = await markFollowup(section, tripId); if (r?.error) { setHidden((m) => ({ ...m, [key]: false })); alert('Gagal: ' + r.error); } });
  }

  const [prep, setPrep] = useState({}); // `${tripId}:${key}` -> bool override
  function togglePrep(tripId, itemKey, current) {
    const k = `${tripId}:${itemKey}`;
    const next = !current;
    setPrep((m) => ({ ...m, [k]: next }));
    start(async () => { const r = await setDeparturePrep(tripId, itemKey, next); if (r?.error) { setPrep((m) => ({ ...m, [k]: current })); alert('Gagal: ' + r.error); } });
  }
  const prepDone = (tripId, it) => { const k = `${tripId}:${it.key}`; return prep[k] !== undefined ? prep[k] : it.done; };

  const d = data || {};
  const T = d.ticketing || {}, V = d.visa || {}, O = d.operation || {}, S = d.selling || {};
  const vis = (section, arr) => (arr || []).filter((t) => !hidden[`${section}:${t.id}`]);

  // Tombol "sudah follow up" — sembunyikan item HARI INI saja, muncul lagi besok kalau tim belum update.
  const FollowBtn = ({ section, tripId, label = '✓ Follow up' }) => (
    <button type="button" onClick={() => follow(section, tripId)}
      title="Tandai sudah ditindaklanjuti hari ini — muncul lagi besok kalau belum diupdate tim"
      className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-300 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-sky-100">
      {label}
    </button>
  );

  const cntTicketing = vis('ticketing.fullNoTicket', T.fullNoTicket).length + vis('ticketing.readyToBuy', T.readyToBuyTicket).length + vis('ticketing.notIssued', T.notIssued).length;
  const cntVisa = vis('visa.groupH60', V.groupH60).length + vis('visa.notProcessed', V.notProcessed).length + vis('visa.paidUnscheduled', V.paidUnscheduled).length + vis('visa.fullH5', V.fullH5).length;
  const cntOps = vis('operation.newRelease', O.newRelease).length + vis('operation.fullNoOffering', O.fullNoOffering).length + vis('operation.estimateNotUpdated', O.estimateNotUpdated).length;
  const cntSell = vis('selling.slowSelling', S.slowSelling).length + vis('selling.almostFull', S.almostFull).length;
  const P = d.preparation || {};
  const prepTrips = P.trips || [];
  const prepReady = (t) => t.items.every((it) => prepDone(t.id, it));
  const cntPrep = prepTrips.filter((t) => !prepReady(t)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">📊 Dashboard Manager</h1>
          <p className="text-sm text-slate-500">Klik judul monitor untuk buka detailnya. Tombol <span className="font-semibold text-sky-700">✓ Follow up</span> menandai sudah ditindaklanjuti hari ini — item <span className="font-semibold">muncul lagi besok</span> kalau tim belum update di divisinya. {data?.generatedAt && `· Update ${new Date(data.generatedAt).toLocaleString('id-ID')}`}</p>
        </div>
        <button type="button" onClick={() => { const anyOpen = ['ticketing','visa','operation','selling','preparation'].some((k) => openCard[k]); setOpenCard(anyOpen ? {} : { ticketing: true, visa: true, operation: true, selling: true, preparation: true }); }}
          className="text-xs font-semibold text-brand-600 border border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50 whitespace-nowrap">
          {['ticketing','visa','operation','selling','preparation'].some((k) => openCard[k]) ? 'Tutup semua' : 'Buka semua'}
        </button>
      </div>

      <div className="space-y-3">
        {/* TICKETING */}
        <Card title="MONITOR TICKETING" icon="🎫" accent="bg-sky-50" count={cntTicketing} open={!!openCard.ticketing} onToggle={() => toggleCard('ticketing')}>
          <Block label="Full tapi belum ada tiket" hint="Group full tapi belum ada PNR ke-connect — segera issue tiket." items={vis('ticketing.fullNoTicket', T.fullNoTicket).length} color="text-red-700">
            {vis('ticketing.fullNoTicket', T.fullNoTicket).map((t) => <TripLine key={t.id} t={t} href="/finance/pnr" right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-red-600 whitespace-nowrap">FULL · no tiket</span><FollowBtn section="ticketing.fullNoTicket" tripId={t.id} /></div>} />)}
          </Block>
          <Block label="Siap beli tiket (≥70% terisi)" hint="Group sudah terisi ≥70% tapi belum ada PNR ke-connect — siapkan/kunci tiket sebelum penuh." items={vis('ticketing.readyToBuy', T.readyToBuyTicket).length} color="text-orange-700">
            {vis('ticketing.readyToBuy', T.readyToBuyTicket).map((t) => <TripLine key={t.id} t={t} href="/finance/pnr" right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-orange-600 whitespace-nowrap">{t.fillPct}% · siap beli tiket</span><FollowBtn section="ticketing.readyToBuy" tripId={t.id} /></div>} />)}
          </Block>
          <Block label="Peserta belum di-issue" hint="Tiket FIT/Domestik yg sudah ke-connect tapi peserta belum dicentang issued. Checklist ada di Edit PNR." items={vis('ticketing.notIssued', T.notIssued).length} color="text-amber-700">
            {vis('ticketing.notIssued', T.notIssued).map((t) => (
              <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href="/finance/pnr" className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span></Link>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">{t.belum}/{t.total} belum</span>
                    <FollowBtn section="ticketing.notIssued" tripId={t.id} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{t.peserta.map((p) => p.nama).join(', ')}</p>
                <Link href="/finance/pnr" className="text-[10px] font-semibold text-brand-600 hover:underline">→ buka PNR, centang di Edit PNR</Link>
              </div>
            ))}
          </Block>
        </Card>

        {/* VISA */}
        <Card title="MONITOR VISA" icon="🛂" accent="bg-indigo-50" count={cntVisa} open={!!openCard.visa} onToggle={() => toggleCard('visa')}>
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

        {/* OPERATION */}
        <Card title="MONITOR OPERATION" icon="⚙️" accent="bg-emerald-50" count={cntOps} open={!!openCard.operation} onToggle={() => toggleCard('operation')}>
          <Block label="New release — siap minta offer vendor" hint="Trip baru rilis, siapkan permintaan penawaran vendor." items={vis('operation.newRelease', O.newRelease).length} color="text-blue-700">
            {vis('operation.newRelease', O.newRelease).map((t) => {
              const off = offered[t.id] || t.offeringRequested;
              return <TripLine key={t.id} t={t} href={`/operasional/profit-estimate?trip=${t.id}`} right={<div className="flex items-center gap-1.5">{off ? <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">✅ offering</span> : <button type="button" onClick={() => markOffered(t.id)} className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-300 rounded px-1.5 py-0.5 whitespace-nowrap">minta offer</button>}<FollowBtn section="operation.newRelease" tripId={t.id} /></div>} />;
            })}
          </Block>
          <Block label="Full tapi belum minta offer vendor" hint="Group full di estimate profit belum dichecklist offer vendor." items={vis('operation.fullNoOffering', O.fullNoOffering).length} color="text-red-700">
            {vis('operation.fullNoOffering', O.fullNoOffering).map((t) => {
              const off = offered[t.id];
              return <TripLine key={t.id} t={t} href={`/operasional/profit-estimate?trip=${t.id}`} right={<div className="flex items-center gap-1.5">{off ? <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">✅</span> : <button type="button" onClick={() => markOffered(t.id)} className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-300 rounded px-1.5 py-0.5 whitespace-nowrap">minta offer</button>}<FollowBtn section="operation.fullNoOffering" tripId={t.id} /></div>} />;
            })}
          </Block>
          <Block label="Estimate belum diupdate proyeksi" hint="Sudah minta offer vendor tapi proyeksi income/HPP belum diperbarui." items={vis('operation.estimateNotUpdated', O.estimateNotUpdated).length} color="text-amber-700">
            {vis('operation.estimateNotUpdated', O.estimateNotUpdated).map((t) => <TripLine key={t.id} t={t} href={`/operasional/profit-estimate?trip=${t.id}`} right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">update proyeksi</span><FollowBtn section="operation.estimateNotUpdated" tripId={t.id} /></div>} />)}
          </Block>
        </Card>

        {/* SELLING */}
        <Card title="MONITOR GROUP PENJUALAN" icon="📣" accent="bg-rose-50" count={cntSell} open={!!openCard.selling} onToggle={() => toggleCard('selling')}>
          <Block label="Hampir full — sisa ≤ 4 seat!" hint="Segera siapkan batch baru." items={vis('selling.almostFull', S.almostFull).length} color="text-emerald-700">
            {vis('selling.almostFull', S.almostFull).map((t) => <TripLine key={t.id} t={t} href={`/trips/${t.id}`} right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-extrabold text-emerald-700 whitespace-nowrap">sisa {t.seatLeft}! BIKIN BATCH</span><FollowBtn section="selling.almostFull" tripId={t.id} /></div>} />)}
          </Block>
          <Block label="Penjualan lambat — jalan tapi belum full" hint="Sudah open selling & mendekati keberangkatan tapi masih < 60% terisi." items={vis('selling.slowSelling', S.slowSelling).length} color="text-red-700">
            {vis('selling.slowSelling', S.slowSelling).map((t) => <TripLine key={t.id} t={t} href={`/trips/${t.id}`} right={<div className="flex items-center gap-1.5"><span className="text-[10px] font-bold text-red-600 whitespace-nowrap">{t.fillPct}% · sisa {t.seatLeft}</span><FollowBtn section="selling.slowSelling" tripId={t.id} /></div>} />)}
          </Block>
        </Card>

        {/* PREPARATION KEBERANGKATAN GROUP (H-20) */}
        <Card title="MONITOR PREPARATION KEBERANGKATAN" icon="🧳" accent="bg-amber-50" count={cntPrep} open={!!openCard.preparation} onToggle={() => toggleCard('preparation')}>
          <p className="text-[10px] text-slate-400 -mt-1">Group yang berangkat ≤ {P.windowDays || 20} hari lagi. Centang tiap kesiapan; kalau semua ✅ berarti siap berangkat.</p>
          {prepTrips.length === 0 ? (
            <p className="text-[11px] text-emerald-600">Belum ada group dalam H-{P.windowDays || 20} ✅</p>
          ) : prepTrips.map((t) => {
            const ready = prepReady(t);
            const doneN = t.items.filter((it) => prepDone(t.id, it)).length;
            return (
              <div key={t.id} className={`rounded-lg border px-2.5 py-2 ${ready ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/trips/${t.id}`} className="min-w-0 hover:underline">
                    <span className="text-xs font-bold text-brand-700">{t.kode}</span>
                    <span className="text-xs text-slate-600"> · {t.name}</span>
                    <span className="block text-[10px] text-slate-400">{t.departureFmt} · H-{t.daysToDep} · {t.sold} pax</span>
                  </Link>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{ready ? 'SIAP ✅' : `${doneN}/${t.items.length} siap`}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.items.map((it) => {
                    const done = prepDone(t.id, it);
                    return (
                      <button key={it.key} type="button" onClick={() => togglePrep(t.id, it.key, done)}
                        className={`text-[11px] px-2 py-1 rounded border transition ${done ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50'}`}
                        title={done ? 'Sudah — klik untuk batal' : 'Klik kalau sudah siap'}>
                        {done ? '✅ ' : '⬜ '}{it.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
