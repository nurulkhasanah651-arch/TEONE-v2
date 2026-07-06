import Link from 'next/link';
import { tripSeatLeft, tripPrice } from '@/lib/shop/data';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }

export default function TripCard({ t }) {
  const seat = tripSeatLeft(t);
  const soldout = seat <= 0;
  const seatShown = seat > 10 ? 10 : seat; // tampilan: maks 10 (urgency); checkout tetap pakai sisa asli
  return (
    <Link href={`/trip/${t.slug || t.id}`} prefetch={false} className={`group rounded-2xl border overflow-hidden transition-shadow bg-white ${soldout ? 'border-slate-300 opacity-95' : 'border-slate-200 hover:shadow-lg'}`}>
      <div className="aspect-[4/3] bg-gradient-to-br from-slate-700 to-slate-900 relative overflow-hidden">
        {t.cover_image_url
          ? <img src={t.cover_image_url} alt={t.name} className={`w-full h-full object-cover transition-transform ${soldout ? 'grayscale brightness-50' : 'group-hover:scale-105'}`} />
          : <div className={`w-full h-full flex items-center justify-center text-4xl ${soldout ? 'text-white/30' : 'text-white/80'}`}>✈</div>}
        {soldout ? (
          <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center">
            <span className="text-white font-extrabold tracking-widest text-2xl sm:text-3xl drop-shadow">SOLD OUT</span>
            <span className="mt-1 text-[11px] font-semibold text-white/70 uppercase tracking-wide">Seat Habis</span>
          </div>
        ) : (
          <span className="absolute top-2 left-2 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 sm:py-1 rounded-full bg-emerald-500 text-white">Sisa {seatShown} seat</span>
        )}
        {!soldout && t.promo_badge && (
          <span className="absolute top-2 right-2 text-xs sm:text-sm font-extrabold px-2.5 py-1 rounded-full bg-red-600 text-white shadow-md">{t.promo_badge}</span>
        )}
      </div>
      <div className={`p-3 sm:p-4 ${soldout ? 'bg-slate-50' : ''}`}>
        {t.destination && <p className={`text-[11px] font-bold uppercase tracking-wider ${soldout ? 'text-slate-400' : 'text-slate-400'}`}>{t.destination}</p>}
        <h3 className={`font-bold text-sm sm:text-base leading-snug mt-0.5 line-clamp-2 ${soldout ? 'text-slate-500' : 'text-slate-900'}`}>{t.public_title || t.name}</h3>
        <p className="text-xs text-slate-500 mt-1">{fmtDate(t.departure)}{t.return_date ? ` – ${fmtDate(t.return_date)}` : ''}</p>
        {soldout ? (
          <p className="mt-3 text-sm font-extrabold uppercase tracking-wide text-slate-400">SOLD OUT</p>
        ) : (
          <>
            <p className="mt-2 sm:mt-3 text-base sm:text-lg font-extrabold text-slate-900">{fmtRp(tripPrice(t))}</p>
            {t.dp_amount > 0 && <p className="text-[11px] text-emerald-700">Bisa DP {fmtRp(t.dp_amount)}</p>}
          </>
        )}
      </div>
    </Link>
  );
}
