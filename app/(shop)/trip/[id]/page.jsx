import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublishedTrip, tripSeatLeft, tripPrice, tripRoomPrices } from '@/lib/shop/data';
import HeroSlider from '@/components/shop/HeroSlider';

export const dynamic = 'force-dynamic';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function lines(s) { return String(s || '').split('\n').map((l) => l.trim()).filter(Boolean); }

export default async function TripDetailPage({ params }) {
  const { id } = await params;
  const t = await getPublishedTrip(id);
  if (!t) notFound();
  const seat = tripSeatLeft(t);
  const itin = Array.isArray(t.itinerary) ? t.itinerary : [];
  const rooms = tripRoomPrices(t);
  const gallery = Array.isArray(t.gallery_images) ? t.gallery_images : [];
  const heroImgs = [t.cover_image_url, ...gallery].filter(Boolean);
  const sk = lines(t.syarat_ketentuan);
  const visa = lines(t.syarat_visa);

  return (
    <div>
      {/* Hero (slideshow kalau ada galeri) */}
      <div className="relative h-72 md:h-96 bg-gradient-to-br from-slate-700 to-slate-900">
        {heroImgs.length > 0 && <HeroSlider images={heroImgs} overlay="bottom" />}
        <div className="relative max-w-6xl mx-auto px-4 h-full flex flex-col justify-end pb-6 text-white z-10">
          {t.destination && <p className="text-sm font-bold uppercase tracking-wider opacity-90">{t.destination}</p>}
          <h1 className="text-3xl md:text-4xl font-extrabold">{t.name}</h1>
          <p className="mt-1 opacity-90">{fmtDate(t.departure)}{t.return_date ? ` – ${fmtDate(t.return_date)}` : ''}</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Kiri */}
        <div className="lg:col-span-2 space-y-8">
          {t.highlights && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="font-bold text-amber-900 mb-1">✨ Highlight</p>
              <p className="text-sm text-amber-800 whitespace-pre-line">{t.highlights}</p>
            </div>
          )}
          {t.description && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Tentang Trip</h2>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{t.description}</p>
            </div>
          )}
          {itin.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">Itinerary</h2>
              <ol className="space-y-3">
                {itin.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{d.day || i + 1}</span>
                    <div>
                      <p className="font-bold text-slate-800">{d.title || `Hari ${d.day || i + 1}`}</p>
                      {d.detail && <p className="text-sm text-slate-600">{d.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {(t.included || t.excluded) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {t.included && (
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="font-bold text-emerald-700 mb-1">✅ Termasuk</p>
                  <p className="text-sm text-slate-600 whitespace-pre-line">{t.included}</p>
                </div>
              )}
              {t.excluded && (
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="font-bold text-red-600 mb-1">❌ Tidak Termasuk</p>
                  <p className="text-sm text-slate-600 whitespace-pre-line">{t.excluded}</p>
                </div>
              )}
            </div>
          )}

          {/* Accordion: Syarat & Ketentuan + Syarat Visa (klik buka-tutup) */}
          {(sk.length > 0 || visa.length > 0 || t.visa_pdf_syarat_url) && (
            <div className="space-y-3">
              {sk.length > 0 && (
                <details className="group border border-slate-200 rounded-2xl overflow-hidden">
                  <summary className="flex items-center justify-between cursor-pointer px-5 py-4 font-bold text-slate-800 select-none">
                    <span>📋 Syarat &amp; Ketentuan</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <ul className="px-5 pb-4 space-y-1.5">
                    {sk.map((l, i) => <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-slate-400">•</span>{l}</li>)}
                  </ul>
                </details>
              )}
              {(visa.length > 0 || t.visa_pdf_syarat_url) && (
                <details className="group border border-slate-200 rounded-2xl overflow-hidden">
                  <summary className="flex items-center justify-between cursor-pointer px-5 py-4 font-bold text-slate-800 select-none">
                    <span>🛂 Syarat Visa</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <div className="px-5 pb-4">
                    <ul className="space-y-1.5">
                      {visa.map((l, i) => <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-slate-400">•</span>{l}</li>)}
                    </ul>
                    {t.visa_pdf_syarat_url && (
                      <a href={t.visa_pdf_syarat_url} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm font-bold text-emerald-600 hover:underline">📄 Unduh syarat visa lengkap (PDF)</a>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Kanan: kartu harga */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-slate-500">Harga mulai</p>
            <p className="text-3xl font-extrabold text-slate-900">{fmtRp(tripPrice(t))}<span className="text-sm font-medium text-slate-500"> /pax</span></p>
            {t.dp_amount > 0 && <p className="text-sm text-emerald-700 font-semibold mt-1">Booking cukup DP {fmtRp(t.dp_amount)}</p>}

            {rooms.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-500 mb-1.5">Harga per tipe kamar</p>
                <ul className="space-y-1">
                  {rooms.map((r) => (
                    <li key={r.key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{r.label}</span>
                      <span className="font-bold text-slate-800">{fmtRp(r.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 text-sm text-slate-600 space-y-1 border-t border-slate-100 pt-3">
              <p>📅 {fmtDate(t.departure)}{t.return_date ? ` – ${fmtDate(t.return_date)}` : ''}</p>
              <p className={seat > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{seat > 0 ? `🎟 Sisa ${seat} seat` : '🚫 Seat habis'}</p>
            </div>
            {seat > 0 ? (
              <Link href={`/checkout/${t.slug || t.id}`} className="mt-4 block text-center w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold">Pesan Sekarang</Link>
            ) : (
              <button disabled className="mt-4 w-full py-3 rounded-xl bg-slate-200 text-slate-400 font-bold cursor-not-allowed">Seat Habis</button>
            )}
            <a href="https://wa.me/628145460210" target="_blank" rel="noreferrer" className="mt-2 block text-center w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50">Tanya dulu via WA</a>
          </div>
        </div>
      </div>
    </div>
  );
}
