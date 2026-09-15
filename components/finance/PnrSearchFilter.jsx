'use client';
// Search di PNR Inventory: 1 kotak cari yang memfilter semua section (Group/FIT/Domestik)
// by nama/kode trip yang ke-link + PNR/vendor/airline/route. Client-side, instan.
import { useMemo, useState } from 'react';
import PnrRow from '@/components/finance/PnrRow';

function haystack(p, trip) {
  return [
    p.pnr, p.vendor, p.airline, p.route, p.ticket_type,
    trip?.kode_trip, trip?.name,
  ].map((x) => String(x || '')).join(' ').toLowerCase();
}

function Section({ title, subtitle, accent, list, tripMap, emptyText }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className={`font-bold ${accent}`}>{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-sm font-bold text-slate-500">{list.length} PNR</span>
      </div>
      {list.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">{emptyText}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {list.map((p) => <PnrRow key={p.id} pnr={p} trip={tripMap[p.trip_id] || null} />)}
        </div>
      )}
    </div>
  );
}

export default function PnrSearchFilter({ groupPnrs = [], fitPnrs = [], domesticPnrs = [], tripMap = {} }) {
  const [q, setQ] = useState('');
  const kw = q.trim().toLowerCase();

  const filt = (list) => (kw ? list.filter((p) => haystack(p, tripMap[p.trip_id]).includes(kw)) : list);
  const g = useMemo(() => filt(groupPnrs), [kw, groupPnrs, tripMap]);
  const f = useMemo(() => filt(fitPnrs), [kw, fitPnrs, tripMap]);
  const d = useMemo(() => filt(domesticPnrs), [kw, domesticPnrs, tripMap]);
  const totalShown = g.length + f.length + d.length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Cari trip (nama / kode trip), PNR, vendor, airline, atau route..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
        {kw && (
          <p className="text-xs text-slate-500 mt-1.5 px-1">
            {totalShown} PNR cocok dengan "<span className="font-semibold">{q}</span>"
          </p>
        )}
      </div>

      {kw && totalShown === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-10 text-center text-sm text-slate-500">
          Tidak ada PNR yang cocok dengan pencarian.
        </div>
      ) : (
        <>
          <Section title="✈ PNR Group" subtitle="Tiket rombongan / blok kursi" accent="text-sky-700"
            list={g} tripMap={tripMap} emptyText="Belum ada PNR group." />
          <Section title="🎫 FIT" subtitle="Tiket individu (Free Individual Traveller)" accent="text-purple-700"
            list={f} tripMap={tripMap} emptyText="Belum ada tiket FIT." />
          <Section title="🛫 Tiket Domestik" subtitle="Penerbangan domestik penjemputan / lanjutan — bisa disambungkan ke trip" accent="text-teal-700"
            list={d} tripMap={tripMap} emptyText="Belum ada tiket domestik." />
        </>
      )}
    </div>
  );
}
