import Link from 'next/link';
import { getPublishedTrips, getStorefrontSettingsPublic } from '@/lib/shop/data';
import { effectiveRegions, subcatsForRegion, subcatLabel, tripSubcat } from '@/lib/shop/regions';
import TripCard from '@/components/shop/TripCard';

export const dynamic = 'force-dynamic';

export default async function TripListPage({ searchParams }) {
  const region = searchParams?.region || null;
  const sub = searchParams?.sub || null;
  const month = searchParams?.month || null;
  let trips = await getPublishedTrips(region);
  const settings = await getStorefrontSettingsPublic();
  const regions = effectiveRegions(settings?.regions);
  const activeLabel = region ? (regions.find((r) => r.key === region)?.label || region) : null;

  // Sub-kategori (mis. Eropa → West/East Europe, Spain, Santorini, Scandinavia)
  const subcats = region ? subcatsForRegion(region) : [];
  if (region && sub) {
    trips = trips.filter((t) => tripSubcat(t, region) === sub);
  }
  // Bulan keberangkatan yang tersedia (dari trip yg lolos filter region/sub)
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${MON[Number(m) - 1]} ${y}`; };
  const months = [...new Set(trips.map((t) => (t.departure || '').slice(0, 7)).filter(Boolean))].sort();
  const qbase = (extra) => { const p = new URLSearchParams(); if (region) p.set('region', region); if (sub) p.set('sub', sub); for (const k in extra) { if (extra[k]) p.set(k, extra[k]); } const s2 = p.toString(); return '/trip' + (s2 ? '?' + s2 : ''); };
  if (month) trips = trips.filter((t) => (t.departure || '').slice(0, 7) === month);
  const activeSubLabel = (region && sub) ? subcatLabel(region, sub) : null;
  const heading = activeSubLabel ? `Open Trip — ${activeSubLabel}` : (activeLabel ? `Open Trip — ${activeLabel}` : 'Open Trip');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{heading}</h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Pilih destinasi & tanggal keberangkatanmu. Booking online, bayar aman.</p>
        </div>
        <Link href="/request-trip" className="shrink-0 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold whitespace-nowrap">✈ Custom Trip</Link>
      </div>

      {/* Filter region (top-level) */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Link href="/trip" className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border ${!region ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>Semua</Link>
        {regions.map((r) => (
          <Link key={r.key} href={`/trip?region=${r.key}`} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border ${region === r.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
            <span className="mr-1">{r.icon}</span>{r.label}
          </Link>
        ))}
      </div>

      {/* Sub-kategori (muncul kalau region punya kategori turunan, mis. Eropa / Asia) */}
      {subcats.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-7 pl-1 border-l-2 border-emerald-200">
          <Link href={`/trip?region=${region}`} className={`ml-2 px-3 py-1 rounded-full text-xs font-semibold border ${!sub ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}>Semua {activeLabel}</Link>
          {subcats.map((s) => (
            <Link key={s.key} href={`/trip?region=${region}&sub=${s.key}`} className={`px-3 py-1 rounded-full text-xs font-semibold border ${sub === s.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'}`}>
              <span className="mr-1">{s.icon}</span>{s.label}
            </Link>
          ))}
        </div>
      )}

      {/* Filter per bulan keberangkatan */}
      {months.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-7">
          <span className="text-xs font-bold text-slate-400 self-center mr-1">📅 Bulan:</span>
          <Link href={qbase({})} className={`px-3 py-1 rounded-full text-xs font-semibold border ${!month ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'}`}>Semua Bulan</Link>
          {months.map((ym) => (
            <Link key={ym} href={qbase({ month: ym })} className={`px-3 py-1 rounded-full text-xs font-semibold border ${month === ym ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'}`}>{monthLabel(ym)}</Link>
          ))}
        </div>
      )}

      {trips.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-5xl mb-3">🧳</p>
          <p className="font-bold text-slate-600">{activeSubLabel ? `Belum ada trip untuk ${activeSubLabel}` : activeLabel ? `Belum ada trip untuk ${activeLabel}` : 'Belum ada trip yang dipublikasikan'}</p>
          <p className="text-sm mt-1">Coba kategori lain atau lihat semua trip.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {trips.map((t) => <TripCard key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}
