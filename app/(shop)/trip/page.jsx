import Link from 'next/link';
import { getPublishedTrips, tripSeatLeft, tripPrice } from '@/lib/shop/data';

export const dynamic = 'force-dynamic';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }

export default async function TripListPage() {
  const trips = await getPublishedTrips();
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900">Open Trip</h1>
        <p className="text-slate-500 mt-1">Pilih destinasi & tanggal keberangkatanmu. Booking online, bayar aman.</p>
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-5xl mb-3">🧳</p>
          <p className="font-bold text-slate-600">Belum ada trip yang dipublikasikan</p>
          <p className="text-sm mt-1">Trip akan muncul di sini setelah dipublish dari sistem.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {trips.map((t) => {
            const seat = tripSeatLeft(t);
            return (
              <Link key={t.id} href={`/trip/${t.slug || t.id}`}
                className="group rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow bg-white">
                <div className="aspect-[4/3] bg-gradient-to-br from-slate-700 to-slate-900 relative overflow-hidden">
                  {t.cover_image_url
                    ? <img src={t.cover_image_url} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    : <div className="w-full h-full flex items-center justify-center text-white/80 text-4xl">✈</div>}
                  <span className={`absolute top-3 left-3 text-[11px] font-bold px-2 py-1 rounded-full ${seat > 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                    {seat > 0 ? `Sisa ${seat} seat` : 'Seat habis'}
                  </span>
                </div>
                <div className="p-4">
                  {t.destination && <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t.destination}</p>}
                  <h3 className="font-bold text-slate-900 mt-0.5 line-clamp-2">{t.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{fmtDate(t.departure)}{t.return_date ? ` – ${fmtDate(t.return_date)}` : ''}</p>
                  <p className="mt-3 text-lg font-extrabold text-slate-900">{fmtRp(tripPrice(t))}</p>
                  {t.dp_amount > 0 && <p className="text-[11px] text-emerald-700">Bisa DP {fmtRp(t.dp_amount)}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
