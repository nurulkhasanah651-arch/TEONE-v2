import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublishedTrip, tripSeatLeft, tripPrice, tripPriceItems, ADMIN_FEE } from '@/lib/shop/data';
import CheckoutForm from '@/components/shop/CheckoutForm';

export const dynamic = 'force-dynamic';
function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }

export default async function CheckoutPage({ params }) {
  const { id } = await params;
  const t = await getPublishedTrip(id);
  if (!t) notFound();
  const seat = tripSeatLeft(t);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href={`/trip/${t.slug || t.id}`} className="text-sm text-slate-500 hover:underline">← Kembali ke detail trip</Link>
      <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Pesan Trip</h1>

      <div className="mt-4 flex gap-3 items-center bg-slate-50 border border-slate-200 rounded-2xl p-3">
        <div className="w-20 h-16 rounded-xl bg-slate-800 overflow-hidden shrink-0">
          {t.cover_image_url && <img src={t.cover_image_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-800 truncate">{t.name}</p>
          <p className="text-xs text-slate-500">{fmtDate(t.departure)}{t.return_date ? ` – ${fmtDate(t.return_date)}` : ''} · Sisa {seat > 10 ? 10 : seat} seat</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">{fmtRp(tripPrice(t))} /pax</p>
        </div>
      </div>

      {seat <= 0 ? (
        <p className="mt-6 text-center text-red-600 font-bold">Maaf, seat trip ini sudah habis.</p>
      ) : (
        <CheckoutForm trip={{ id: t.id, name: t.name, return_date: t.return_date || t.arrival || t.departure || null, dp_amount: Number(t.dp_amount || 0), seat, priceItems: tripPriceItems(t), adminFee: ADMIN_FEE }} />
      )}
    </div>
  );
}
