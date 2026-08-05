'use client';

// Dashboard PIC — monitor pribadi (discope ke trip milik PIC): Tiket, Payment, Visa, Persiapan.
// Path: components/pic/PicDashboard.jsx
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { setDeparturePrepPic } from '@/lib/actions/pic-dashboard';

const rupiah = (n) => 'Rp ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID');

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

export default function PicDashboard({ data }) {
  const [, start] = useTransition();
  const [openCard, setOpenCard] = useState({});
  const toggleCard = (k) => setOpenCard((m) => ({ ...m, [k]: !m[k] }));

  const [prep, setPrep] = useState({}); // `${tripId}:${key}` -> bool override
  function togglePrep(tripId, itemKey, current) {
    const k = `${tripId}:${itemKey}`;
    const next = !current;
    setPrep((m) => ({ ...m, [k]: next }));
    start(async () => { const r = await setDeparturePrepPic(tripId, itemKey, next); if (r?.error) { setPrep((m) => ({ ...m, [k]: current })); alert('Gagal: ' + r.error); } });
  }
  const prepDone = (tripId, it) => { const k = `${tripId}:${it.key}`; return prep[k] !== undefined ? prep[k] : it.done; };

  const d = data || {};
  const M = d.monitor || {};
  const T = M.ticketing || {}, V = M.visa || {}, P = M.preparation || {};
  const PAY = d.payment || {};

  const cntTicket = (T.fullNoTicket || []).length + (T.notIssued || []).length;
  const cntVisa = (V.groupH60 || []).length + (V.notProcessed || []).length + (V.paidUnscheduled || []).length + (V.fullH5 || []).length;
  const cntPay = (PAY.soonToday || []).length + (PAY.soonWeek || []).length + (PAY.overdueByTrip || []).length;
  const prepTrips = P.trips || [];
  const prepReady = (t) => t.items.every((it) => prepDone(t.id, it));
  const cntPrep = prepTrips.filter((t) => !prepReady(t)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">🧭 Dashboard PIC · {d.name || ''}{d.seeAll ? ' · SPV' : ''}</h1>
          <p className="text-sm text-slate-500">{d.seeAll ? 'Monitor SEMUA trip (SPV PIC).' : 'Monitor khusus trip yang di-assign ke Anda.'} Klik judul untuk buka detail. {d.monitor?.generatedAt && `· Update ${new Date(d.monitor.generatedAt).toLocaleString('id-ID')}`}</p>
        </div>
        <button type="button" onClick={() => { const anyOpen = ['ticketing','payment','visa','preparation'].some((k) => openCard[k]); setOpenCard(anyOpen ? {} : { ticketing: true, payment: true, visa: true, preparation: true }); }}
          className="text-xs font-semibold text-brand-600 border border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50 whitespace-nowrap">
          {['ticketing','payment','visa','preparation'].some((k) => openCard[k]) ? 'Tutup semua' : 'Buka semua'}
        </button>
      </div>

      <div className="space-y-3">
        {/* TICKETING */}
        <Card title="MONITOR TIKET" icon="🎫" accent="bg-sky-50" count={cntTicket} open={!!openCard.ticketing} onToggle={() => toggleCard('ticketing')}>
          <Block label="Full tapi belum ada tiket" hint="Group full tapi belum ada PNR ke-connect — segera issue tiket." items={(T.fullNoTicket || []).length} color="text-red-700">
            {(T.fullNoTicket || []).map((t) => <TripLine key={t.id} t={t} href="/finance/pnr" right={<span className="text-[10px] font-bold text-red-600 whitespace-nowrap">FULL · no tiket</span>} />)}
          </Block>
          <Block label="Peserta belum di-issue" hint="Tiket FIT/Domestik sudah ke-connect tapi peserta belum dicentang issued (di Edit PNR)." items={(T.notIssued || []).length} color="text-amber-700">
            {(T.notIssued || []).map((t) => (
              <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href="/finance/pnr" className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span></Link>
                  <span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">{t.belum}/{t.total} belum</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{t.peserta.map((p) => p.nama).join(', ')}</p>
              </div>
            ))}
          </Block>
        </Card>

        {/* PAYMENT */}
        <Card title="MONITOR PAYMENT" icon="💳" accent="bg-rose-50" count={cntPay} open={!!openCard.payment} onToggle={() => toggleCard('payment')}>
          <Block label="🔴 Deadline HARI INI" hint="Group dengan termin payment/pelunasan jatuh tempo hari ini — tagih peserta sekarang." items={(PAY.soonToday || []).length} color="text-red-700">
            {(PAY.soonToday || []).map((s) => (
              <Link key={`${s.tripId}-${s.milestone}`} href={`/finance/payments/${s.tripId}`} className="block rounded-lg border border-red-200 bg-red-50/50 px-2.5 py-1.5 hover:bg-red-50">
                <span className="text-xs font-bold text-brand-700">{s.kode}</span>
                <span className="text-xs text-slate-600"> · {s.name}</span>
                <span className="block text-[10px] text-red-700 font-semibold">{s.milestone} — jatuh tempo HARI INI ({s.due}){s.amount ? ` · ${rupiah(s.amount)}` : ''}</span>
              </Link>
            ))}
          </Block>
          <Block label="Deadline ≤ 7 hari lagi" hint="Group dengan termin payment/pelunasan jatuh tempo dalam sepekan — siapkan invoice & ingatkan peserta." items={(PAY.soonWeek || []).length} color="text-amber-700">
            {(PAY.soonWeek || []).map((s) => (
              <Link key={`${s.tripId}-${s.milestone}`} href={`/finance/payments/${s.tripId}`} className="block rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-1.5 hover:bg-amber-50">
                <span className="text-xs font-bold text-brand-700">{s.kode}</span>
                <span className="text-xs text-slate-600"> · {s.name}</span>
                <span className="block text-[10px] text-amber-700 font-semibold">{s.milestone} — H-{s.days} ({s.due}){s.amount ? ` · ${rupiah(s.amount)}` : ''}</span>
              </Link>
            ))}
          </Block>
          <Block label="⚠ Lewat deadline — peserta belum bayar" hint="Per group, peserta yang sudah lewat jatuh tempo tapi belum bayar terminnya." items={(PAY.overdueByTrip || []).length} color="text-red-700">
            {(PAY.overdueByTrip || []).map((grp) => (
              <div key={grp.tripId} className="rounded-lg border border-red-200 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/finance/payments/${grp.tripId}`} className="text-xs font-bold text-brand-700 hover:underline">{grp.trip}</Link>
                  <span className="text-[10px] font-bold text-red-600 whitespace-nowrap">{grp.people.length} peserta</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {grp.people.map((p, i) => (
                    <li key={i} className="text-[11px] text-slate-600 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">• {p.name} <span className="text-slate-400">({p.milestone})</span></span>
                      <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">lewat {p.days} hr{p.amount ? ` · ${rupiah(p.amount)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Block>
        </Card>

        {/* VISA */}
        <Card title="MONITOR VISA" icon="🛂" accent="bg-indigo-50" count={cntVisa} open={!!openCard.visa} onToggle={() => toggleCard('visa')}>
          <Block label="🚨 URUS VISA GROUP! udah H-60!" hint="Trip visa GROUP sudah ≤ 2 bulan ke keberangkatan — visa group harus segera diurus." items={(V.groupH60 || []).length} color="text-red-700">
            {(V.groupH60 || []).map((t) => <TripLine key={t.id} t={t} href={`/visa/${t.id}`} right={<span className="text-[10px] font-extrabold text-red-700 whitespace-nowrap">URUS! H-{t.daysToDep}</span>} />)}
          </Block>
          <Block label="Belum proses & belum bayar visa" hint="Peserta butuh visa tapi belum bayar & belum diproses — segera proses." items={(V.notProcessed || []).length} color="text-red-700">
            {(V.notProcessed || []).map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/visa/${t.id}`} className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span> <span className="text-[10px] text-slate-400">H-{t.daysToDep}</span></Link>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{t.belum} peserta: {t.peserta.map((p) => p.nama).join(', ')}</p>
              </div>
            ))}
          </Block>
          <Block label="Sudah bayar visa, belum dijadwalkan biometrik" hint="Follow up ke tim visa untuk penjadwalan." items={(V.paidUnscheduled || []).length} color="text-amber-700">
            {(V.paidUnscheduled || []).map((t) => (
              <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/visa/${t.id}`} className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span></Link>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{t.belum} peserta: {t.peserta.map((p) => p.nama).join(', ')}</p>
              </div>
            ))}
          </Block>
          <Block label="Group full — mulai proses visa (H-5 bulan)" hint="Group sudah full & mendekati keberangkatan, visa harus segera jalan." items={(V.fullH5 || []).length} color="text-purple-700">
            {(V.fullH5 || []).map((t) => <TripLine key={t.id} t={t} href={`/visa/${t.id}`} right={<span className="text-[10px] font-bold text-purple-600 whitespace-nowrap">{t.belum} blm proses</span>} />)}
          </Block>
        </Card>

        {/* PREPARATION */}
        <Card title="MONITOR PERSIAPAN TOUR" icon="🧳" accent="bg-amber-50" count={cntPrep} open={!!openCard.preparation} onToggle={() => toggleCard('preparation')}>
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
