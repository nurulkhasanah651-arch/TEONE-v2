import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveBrandCode } from '@/lib/brand-shared';
import { defaultTermsFor } from '@/lib/shop/default-terms';
import { getPublishedTrip, tripSeatLeft, tripPrice, tripRoomPrices, getStorefrontSettingsPublic, getFlashSaleTrips } from '@/lib/shop/data';
import HeroSlider from '@/components/shop/HeroSlider';
import ShareTrip from '@/components/shop/ShareTrip';
import TripCard from '@/components/shop/TripCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  try {
    const { id } = await params;
    const t = await getPublishedTrip(id);
    if (!t) return {};
    let host = ''; let code = 'teone';
    try { const h = headers(); host = h.get('host') || ''; code = h.get('x-brand') || resolveBrandCode({ host }) || 'teone'; } catch {}
    const siteName = code === 'khasanah' ? 'Khasanah Travel' : 'Traveling Eropa';
    const baseUrl = code === 'khasanah' ? 'https://www.khasanahtravel.com' : 'https://www.travelingeropa.com';
    const title = `${t.public_title || t.name} — ${siteName}`;
    const rawDesc = (t.description && String(t.description).trim())
      ? String(t.description)
      : `Open Trip ${t.destination || t.name} bersama ${siteName}. Lihat itinerary, harga, dan jadwal keberangkatan.`;
    const description = rawDesc.replace(/\s+/g, ' ').trim().slice(0, 200);
    const img = t.cover_image_url || null;
    const url = `${baseUrl}/trip/${t.slug || id}`;
    return {
      title,
      description,
      metadataBase: new URL(baseUrl),
      alternates: { canonical: url },
      openGraph: {
        title, description, url, siteName, type: 'website',
        images: img ? [{ url: img }] : [],
      },
      twitter: {
        card: img ? 'summary_large_image' : 'summary',
        title, description,
        images: img ? [img] : [],
      },
    };
  } catch { return {}; }
}

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function lines(s) { return String(s || '').split('\n').map((l) => l.trim()).filter(Boolean); }

export default async function TripDetailPage({ params }) {
  const { id } = await params;
  const t = await getPublishedTrip(id);
  if (!t) notFound();
  const flashTrips = (await getFlashSaleTrips(8)).filter((x) => String(x.id) !== String(t.id)).slice(0, 4);
  const seat = tripSeatLeft(t);
  const seatShown = seat > 10 ? 10 : seat; // tampilan maks 10; booking tetap pakai sisa asli
  const itin = Array.isArray(t.itinerary) ? t.itinerary : [];
  const rooms = tripRoomPrices(t);
  const gallery = Array.isArray(t.gallery_images) ? t.gallery_images : [];
  const heroImgs = [t.cover_image_url, ...gallery].filter(Boolean);
  let brand = 'teone';
  try { const h = headers(); brand = h.get('x-brand') || resolveBrandCode({ host: h.get('host') }) || 'teone'; } catch {}
  const settings = await getStorefrontSettingsPublic();
  const skText = (t.syarat_ketentuan && t.syarat_ketentuan.trim())
    ? t.syarat_ketentuan
    : ((settings?.terms_default && settings.terms_default.trim()) ? settings.terms_default : defaultTermsFor(brand));
  const sk = lines(skText);
  const visa = lines(t.syarat_visa);

  const priceCard = (
          <div className="sticky top-20 border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-slate-500">Harga mulai</p>
            <p className="text-3xl font-extrabold text-slate-900">{fmtRp(tripPrice(t))}<span className="text-sm font-medium text-slate-500"> /pax</span></p>
            {t.dp_amount > 0 && <p className="text-sm text-emerald-700 font-semibold mt-1">Booking cukup DP {fmtRp(t.dp_amount)}</p>}

            {rooms.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-500 mb-1.5">Harga dasar per tipe (per orang)</p>
                <ul className="space-y-1">
                  {rooms.map((r) => (
                    <li key={r.key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{r.label}</span>
                      <span className="font-bold text-slate-800">{fmtRp(r.base)}</span>
                    </li>
                  ))}
                </ul>
                {rooms[0]?.addons?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-bold text-slate-500 mb-1.5">Biaya wajib (semua peserta)</p>
                    <ul className="space-y-1">
                      {rooms[0].addons.map((a, i) => (
                        <li key={i} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{a.label}</span>
                          <span className="font-semibold text-slate-700">{fmtRp(a.value)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-slate-400 mt-2">Harga akhir per orang = harga tipe + biaya wajib. Visa & opsional tidak termasuk.</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 text-sm text-slate-600 space-y-1 border-t border-slate-100 pt-3">
              <p>📅 {fmtDate(t.departure)}{t.return_date ? ` – ${fmtDate(t.return_date)}` : ''}</p>
              <p className={seat > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{seat > 0 ? `🎟 Sisa ${seatShown} seat` : '🚫 SOLD OUT'}</p>
            </div>
            {seat > 0 ? (
              <Link href={`/checkout/${t.slug || t.id}`} className="mt-4 block text-center w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold">Pesan Sekarang</Link>
            ) : (
              <button disabled className="mt-4 w-full py-3 rounded-xl bg-slate-200 text-slate-400 font-bold cursor-not-allowed">SOLD OUT</button>
            )}
            <a href="https://wa.me/6282210991200" target="_blank" rel="noreferrer" className="mt-2 block text-center w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50">Tanya dulu via WA</a>
          </div>
  );

  const _siteName = brand === 'khasanah' ? 'Khasanah Travel' : 'Traveling Eropa';
  const _canonical = `${brand === 'khasanah' ? 'https://www.khasanahtravel.com' : 'https://www.travelingeropa.com'}/trip/${t.slug || t.id}`;
  const _jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: t.public_title || t.name,
    description: (t.description ? String(t.description) : `Open Trip ${t.destination || t.name} bersama ${_siteName}.`).replace(/\s+/g, ' ').trim().slice(0, 320),
    image: heroImgs.length ? heroImgs.slice(0, 6) : undefined,
    brand: { '@type': 'Brand', name: _siteName },
    category: t.destination || 'Tour & Travel',
    offers: {
      '@type': 'Offer',
      price: tripPrice(t) || undefined,
      priceCurrency: 'IDR',
      availability: seat > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: _canonical,
      ...(t.departure ? { validFrom: t.departure } : {}),
    },
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(_jsonLd) }} />
      {/* Hero (slideshow kalau ada galeri) */}
      <div className="relative h-72 md:h-96 bg-gradient-to-br from-slate-700 to-slate-900">
        {heroImgs.length > 0 && <HeroSlider images={heroImgs} overlay="bottom" />}
        <div className="relative max-w-6xl mx-auto px-4 h-full flex flex-col justify-end pb-6 text-white z-10">
          {t.destination && <p className="text-sm font-bold uppercase tracking-wider opacity-90">{t.destination}</p>}
          <h1 className="text-3xl md:text-4xl font-extrabold">{t.public_title || t.name}</h1>
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
              <ol className="space-y-4">
                {itin.map((d, i) => (
                  <li key={i} className="flex flex-col sm:flex-row gap-4 rounded-2xl border border-slate-200 overflow-hidden">
                    {d.image && (
                      <div className="sm:w-56 h-44 sm:h-auto shrink-0 bg-slate-100">
                        <img src={d.image} alt={d.title || `Hari ${d.day || i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-4 flex gap-3">
                      <span className="shrink-0 w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{d.day || i + 1}</span>
                      <div>
                        <p className="font-bold text-slate-800">{d.title || `Hari ${d.day || i + 1}`}</p>
                        {d.detail && <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-line">{d.detail}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {/* Harga — di HP muncul tepat di bawah itinerary */}
          <div className="lg:hidden">{priceCard}</div>
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
          {(sk.length > 0 || visa.length > 0 || t.visa_pdf_syarat_url || (Array.isArray(t.web_payment_schedule) && t.web_payment_schedule.length > 0)) && (
            <div className="space-y-3">
              {Array.isArray(t.web_payment_schedule) && t.web_payment_schedule.length > 0 && (
                <details className="group border border-slate-200 rounded-2xl overflow-hidden">
                  <summary className="flex items-center justify-between cursor-pointer px-5 py-4 font-bold text-slate-800 select-none">
                    <span>💳 Payment Schedule</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <div className="px-5 pb-4 divide-y divide-slate-100">
                    {t.dp_amount ? (
                      <div className="flex items-center justify-between py-2 text-sm">
                        <span className="font-semibold text-slate-700">DP</span>
                        <span className="font-bold text-slate-900">{fmtRp(t.dp_amount)}</span>
                      </div>
                    ) : null}
                    {t.web_payment_schedule.filter((r) => r.type !== 'Pelunasan').map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-2 text-sm">
                        <span className="font-semibold text-slate-700">Payment {i + 1}
                          {r.due ? <span className="block text-[11px] font-normal text-slate-400">🗓 jatuh tempo {fmtDate(r.due)}</span> : null}</span>
                        <span className="font-bold text-slate-900">{r.amount ? fmtRp(r.amount) : '-'}</span>
                      </div>
                    ))}
                    {(() => { const pel = t.web_payment_schedule.find((r) => r.type === 'Pelunasan'); if (!pel) return null; return (
                      <div className="flex items-center justify-between py-2 text-sm">
                        <span className="font-semibold text-slate-700">Pelunasan
                          {pel.due ? <span className="block text-[11px] font-normal text-slate-400">🗓 jatuh tempo {fmtDate(pel.due)}</span> : null}</span>
                        <span className="font-semibold text-amber-600 italic text-xs">menyesuaikan sisa tagihan</span>
                      </div>
                    ); })()}
                  </div>
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
              {sk.length > 0 && (
                <details className="group border border-slate-200 rounded-2xl overflow-hidden">
                  <summary className="flex items-center justify-between cursor-pointer px-5 py-4 font-bold text-slate-800 select-none">
                    <span>📋 Syarat &amp; Ketentuan</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <ul className="px-5 pb-4 space-y-1.5">
                    {sk.map((l, i) => {
                      const isHead = /:$/.test(l) || (l.length > 4 && l === l.toUpperCase());
                      return isHead
                        ? <li key={i} className="text-[13px] font-bold text-slate-800 mt-3 first:mt-0 list-none">{l}</li>
                        : <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-slate-400">•</span>{l}</li>;
                    })}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="pt-1">
            <p className="text-xs font-bold text-slate-400 mb-1.5">Suka paket ini?</p>
            <ShareTrip title={t.public_title || t.name} />
          </div>
        </div>

        <div className="hidden lg:block lg:col-span-1">
          {priceCard}
        </div>
      </div>

      {/* Section bawah: Flash Sale + jelajah trip lain */}
      <div className="bg-slate-50 border-t border-slate-200 mt-4">
        <div className="max-w-6xl mx-auto px-4 py-10">
          {flashTrips.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl sm:text-2xl font-extrabold text-rose-600">⚡ Flash Sale Trip</h2>
                <Link href="/trip" className="text-sm font-bold text-slate-600 hover:text-slate-900">Lihat semua →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {flashTrips.map((ft) => <TripCard key={ft.id} t={ft} />)}
              </div>
            </div>
          )}
          <div className="text-center bg-white border border-slate-200 rounded-2xl p-6">
            <p className="font-bold text-slate-800 text-lg">Mau lihat-lihat destinasi lain?</p>
            <p className="text-sm text-slate-500 mt-1">Jelajahi semua open trip ke Eropa, Asia, dan dunia.</p>
            <Link href="/trip" className="inline-block mt-4 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold">Pilih Trip Lainnya</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
