import Link from 'next/link';
import { getPublishedTrips } from '@/lib/shop/data';
import { REGIONS, regionLabel } from '@/lib/shop/regions';
import TripCard from '@/components/shop/TripCard';

export const dynamic = 'force-dynamic';

export default async function TripListPage({ searchParams }) {
  const region = searchParams?.region || null;
  const trips = await getPublishedTrips(region);
  const activeLabel = region ? regionLabel(region) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold text-slate-900">{activeLabel ? `Open Trip — ${activeLabel}` : 'Open Trip'}</h1>
        <p className="text-slate-500 mt-1">Pilih destinasi & tanggal keberangkatanmu. Booking online, bayar aman.</p>
      </div>

      {/* Filter region */}
      <div className="flex flex-wrap gap-2 mb-7">
        <Link href="/trip" className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border ${!region ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>Semua</Link>
        {REGIONS.map((r) => (
          <Link key={r.key} href={`/trip?region=${r.key}`} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border ${region === r.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
            <span className="mr-1">{r.icon}</span>{r.label}
          </Link>
        ))}
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-5xl mb-3">🧳</p>
          <p className="font-bold text-slate-600">{activeLabel ? `Belum ada trip untuk ${activeLabel}` : 'Belum ada trip yang dipublikasikan'}</p>
          <p className="text-sm mt-1">{activeLabel ? 'Coba region lain atau lihat semua trip.' : 'Trip akan muncul di sini setelah dipublish dari sistem.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {trips.map((t) => <TripCard key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}
