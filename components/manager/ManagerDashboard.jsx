'use client';

// Manager Dashboard "Morning Monitoring". Path: components/manager/ManagerDashboard.jsx
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { setOfferingVendor } from '@/lib/actions/profit-estimate';

function Card({ title, icon, accent, count, children }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden`}>
      <div className={`px-4 py-2.5 border-b border-slate-200 flex items-center justify-between ${accent}`}>
        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">{icon} {title}</h2>
        {count != null && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/70 text-slate-700">{count}</span>}
      </div>
      <div className="p-3 space-y-3">{children}</div>
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

  function markOffered(tripId) {
    setOffered((m) => ({ ...m, [tripId]: true }));
    start(async () => { const r = await setOfferingVendor(tripId, true); if (r?.error) { setOffered((m) => ({ ...m, [tripId]: false })); alert('Gagal: ' + r.error); } });
  }

  const d = data || {};
  const T = d.ticketing || {}, V = d.visa || {}, O = d.operation || {}, S = d.selling || {};

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-700">🌅 Morning Monitoring</h1>
        <p className="text-sm text-slate-500">Pantauan harian manager · ticketing, visa, operasional, penjualan. {data?.generatedAt && `Update ${new Date(data.generatedAt).toLocaleString('id-ID')}`}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* TICKETING */}
        <Card title="Ticketing" icon="🎫" accent="bg-sky-50" count={(T.fullNoTicket?.length || 0) + (T.notIssued?.length || 0)}>
          <Block label="Full tapi belum ada tiket" hint="Group full tapi belum ada PNR ke-connect — segera issue tiket." items={T.fullNoTicket?.length || 0} color="text-red-700">
            {(T.fullNoTicket || []).map((t) => <TripLine key={t.id} t={t} href="/finance/pnr" right={<span className="text-[10px] font-bold text-red-600 whitespace-nowrap">FULL · no tiket</span>} />)}
          </Block>
          <Block label="Peserta belum di-issue" hint="Group yg tiketnya sudah ada tapi peserta belum dicentang issued. Checklist di PNR Inventory." items={T.notIssued?.length || 0} color="text-amber-700">
            {(T.notIssued || []).map((t) => (
              <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href="/finance/pnr" className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span></Link>
                  <span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">{t.belum}/{t.total} belum</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{t.peserta.map((p) => p.nama).join(', ')}</p>
                <Link href="/finance/pnr" className="text-[10px] font-semibold text-brand-600 hover:underline">→ centang di PNR Inventory</Link>
              </div>
            ))}
          </Block>
        </Card>

        {/* VISA */}
        <Card title="Visa" icon="🛂" accent="bg-indigo-50" count={(V.notProcessed?.length || 0) + (V.paidUnscheduled?.length || 0)}>
          <Block label="Belum proses & belum bayar visa" hint="Peserta butuh visa tapi belum bayar & belum diproses — segera proses." items={V.notProcessed?.length || 0} color="text-red-700">
            {(V.notProcessed || []).map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                <Link href={`/visa/${t.id}`} className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span> <span className="text-[10px] text-slate-400">H-{t.daysToDep}</span></Link>
                <p className="text-[10px] text-slate-500 mt-0.5">{t.belum} peserta: {t.peserta.map((p) => p.nama).join(', ')}</p>
              </div>
            ))}
          </Block>
          <Block label="Sudah bayar visa, belum dijadwalkan biometrik" hint="Follow up ke tim visa untuk penjadwalan." items={V.paidUnscheduled?.length || 0} color="text-amber-700">
            {(V.paidUnscheduled || []).map((t) => (
              <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 py-2">
                <Link href={`/visa/${t.id}`} className="text-xs font-bold text-brand-700 hover:underline">{t.kode} · <span className="font-normal text-slate-600">{t.name}</span></Link>
                <p className="text-[10px] text-slate-500 mt-0.5">{t.belum} peserta: {t.peserta.map((p) => p.nama).join(', ')}</p>
              </div>
            ))}
          </Block>
          <Block label="Group full — mulai proses visa (H-5 bulan)" hint="Group sudah full & mendekati keberangkatan, visa harus segera jalan." items={V.fullH5?.length || 0} color="text-purple-700">
            {(V.fullH5 || []).map((t) => <TripLine key={t.id} t={t} href={`/visa/${t.id}`} right={<span className="text-[10px] font-bold text-purple-600 whitespace-nowrap">{t.belum} blm proses</span>} />)}
          </Block>
        </Card>

        {/* OPERATION */}
        <Card title="Operation" icon="⚙️" accent="bg-emerald-50" count={(O.fullNoOffering?.length || 0) + (O.estimateNotUpdated?.length || 0)}>
          <Block label="New release — siap minta offer vendor" hint="Trip baru rilis, siapkan permintaan penawaran vendor." items={O.newRelease?.length || 0} color="text-blue-700">
            {(O.newRelease || []).map((t) => {
              const off = offered[t.id] || t.offeringRequested;
              return <TripLine key={t.id} t={t} href={`/operasional/profit-estimate?trip=${t.id}`} right={off ? <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">✅ offering</span> : <button type="button" onClick={() => markOffered(t.id)} className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-300 rounded px-1.5 py-0.5 whitespace-nowrap">minta offer</button>} />;
            })}
          </Block>
          <Block label="Full tapi belum minta offer vendor" hint="Group full di estimate profit belum dichecklist offer vendor." items={O.fullNoOffering?.length || 0} color="text-red-700">
            {(O.fullNoOffering || []).map((t) => {
              const off = offered[t.id];
              return <TripLine key={t.id} t={t} href={`/operasional/profit-estimate?trip=${t.id}`} right={off ? <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">✅</span> : <button type="button" onClick={() => markOffered(t.id)} className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-300 rounded px-1.5 py-0.5 whitespace-nowrap">minta offer</button>} />;
            })}
          </Block>
          <Block label="Estimate belum diupdate proyeksi" hint="Sudah minta offer vendor tapi proyeksi income/HPP belum diperbarui." items={O.estimateNotUpdated?.length || 0} color="text-amber-700">
            {(O.estimateNotUpdated || []).map((t) => <TripLine key={t.id} t={t} href={`/operasional/profit-estimate?trip=${t.id}`} right={<span className="text-[10px] font-bold text-amber-700 whitespace-nowrap">update proyeksi</span>} />)}
          </Block>
        </Card>

        {/* SELLING */}
        <Card title="Selling" icon="📣" accent="bg-rose-50" count={(S.slowSelling?.length || 0) + (S.almostFull?.length || 0)}>
          <Block label="Hampir full — sisa ≤ 4 seat!" hint="Segera siapkan batch baru." items={S.almostFull?.length || 0} color="text-emerald-700">
            {(S.almostFull || []).map((t) => <TripLine key={t.id} t={t} href={`/trips/${t.id}`} right={<span className="text-[10px] font-extrabold text-emerald-700 whitespace-nowrap">sisa {t.seatLeft}! BIKIN BATCH</span>} />)}
          </Block>
          <Block label="Penjualan lambat — jalan tapi belum full" hint="Sudah open selling & mendekati keberangkatan tapi masih < 60% terisi." items={S.slowSelling?.length || 0} color="text-red-700">
            {(S.slowSelling || []).map((t) => <TripLine key={t.id} t={t} href={`/trips/${t.id}`} right={<span className="text-[10px] font-bold text-red-600 whitespace-nowrap">{t.fillPct}% · sisa {t.seatLeft}</span>} />)}
          </Block>
        </Card>
      </div>
    </div>
  );
}
