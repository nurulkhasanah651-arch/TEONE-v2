import { headers } from 'next/headers';
import Link from 'next/link';
import { resolveBrandCode } from '@/lib/brand-shared';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import { effectiveRegions } from '@/lib/shop/regions';
import { getFlashSaleTrips, getBestSellerTrips, getYearEndSpecialTrips, getAvailableDepartureMonths, getStorefrontSettingsPublic } from '@/lib/shop/data';
import { getGoogleReviews } from '@/lib/shop/google-reviews';
import TripCard from '@/components/shop/TripCard';
import HeroSlider from '@/components/shop/HeroSlider';

export const dynamic = 'force-dynamic';

function brandCode() {
  try { const h = headers(); return h.get('x-brand') || resolveBrandCode({ host: h.get('host') }); }
  catch { return 'teone'; }
}

function Stars({ n = 5 }) {
  return <span className="text-amber-400 text-sm">{'★'.repeat(n)}<span className="text-slate-200">{'★'.repeat(5 - n)}</span></span>;
}

export default async function StorefrontHome() {
  const code = brandCode();
  const cfg = storefrontConfig(code);
  const settings = await getStorefrontSettingsPublic();
  const heroImages = (settings?.hero_images && settings.hero_images.length) ? settings.hero_images : (cfg.heroImages || (cfg.heroImage ? [cfg.heroImage] : []));
  const regions = effectiveRegions(settings?.regions);
  const flashSale = await getFlashSaleTrips(20);
  const yearEnd = await getYearEndSpecialTrips(30);
  const availMonths = await getAvailableDepartureMonths();
  const bestSeller = await getBestSellerTrips(20);
  const live = await getGoogleReviews(cfg.googlePlaceId);
  const rating = live?.rating || cfg.googleRating;
  const count = live?.count || cfg.googleCount;
  const reviews = (live?.reviews && live.reviews.length) ? live.reviews : cfg.testimonials;

  const _isKh = code === 'khasanah';
  const _orgName = _isKh ? 'Khasanah Travel' : 'Traveling Eropa';
  const _orgUrl = _isKh ? 'https://www.khasanahtravel.com' : 'https://www.travelingeropa.com';
  const _orgLogo = (settings?.logo_url) || `${_orgUrl}/icon.png`;
  const _orgLd = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: _orgName,
    url: _orgUrl,
    logo: _orgLogo,
    image: _orgLogo,
    ...(_isKh ? {} : {
      description: 'Open trip & private trip Eropa terkurasi bersama Traveling Eropa.',
      sameAs: ['https://www.instagram.com/travelingeropa/', 'https://www.tiktok.com/@travelingeropa'],
      address: { '@type': 'PostalAddress', streetAddress: 'Ruko Graha Boulevard, Jl. Gading Serpong Boulevard, Curug Sangereng, Kelapa Dua', addressRegion: 'Banten', postalCode: '15810', addressCountry: 'ID' },
    }),
  };
  const _siteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: _orgName, url: _orgUrl };
  const _MON = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const _monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${_MON[Number(m) - 1]} ${y}`; };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(_orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(_siteLd) }} />
      {/* HERO */}
      <section className="relative">
        <HeroSlider images={heroImages} />
        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-32">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 text-xs font-bold px-3 py-1.5">
            ⭐ {cfg.badge}
          </span>
          <h1 className="mt-5 text-3xl sm:text-5xl font-extrabold text-white leading-tight max-w-2xl">{cfg.heroTitle}</h1>
          <p className="mt-4 text-base sm:text-lg text-slate-200 max-w-xl">{cfg.heroSubtitle}</p>
          <div className="mt-7 sm:mt-8 flex flex-wrap gap-2.5 sm:gap-3">
            <Link href="/trip" className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg text-sm sm:text-base">Cari Destinasi</Link>
            <Link href="/request-trip" className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-full bg-white text-slate-900 hover:bg-slate-100 font-bold shadow-lg text-sm sm:text-base">✈ Custom Trip</Link>
            <a href={`https://wa.me/${cfg.waNumber}`} target="_blank" rel="noreferrer" className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm sm:text-base">Tanya CS</a>
          </div>
        </div>
      </section>

      {/* STATS / MARKET LEADER */}
      <section className="bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {cfg.stats.map((s, i) => (
            <div key={i}>
              <p className="text-2xl sm:text-3xl font-extrabold text-white">{s.value}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* KATEGORI PER BENUA — paling atas */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Jelajahi per Benua</h2>
          <p className="text-slate-500 mt-1">Pilih region favoritmu — Eropa, UK + Ireland, Asia, dan lainnya.</p>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {regions.map((r) => (
              <Link key={r.key} prefetch={false} href={`/trip?region=${r.key}`} className="group relative rounded-2xl overflow-hidden aspect-[3/4] shadow-sm hover:shadow-lg transition-shadow bg-gradient-to-br from-slate-700 to-slate-900">
                {r.image
                  ? <img src={r.image} alt={r.label} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  : <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-30">{r.icon}</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-2xl">{r.icon}</p>
                  <p className="text-white font-bold text-sm leading-tight mt-1">{r.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PILIH BULAN KEBERANGKATAN — pill kecil, arah ke daftar trip terfilter */}
      {availMonths.length > 0 && (
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-700 mr-1">📅 Berangkat bulan:</span>
          {availMonths.map((ym) => (
            <Link key={ym} prefetch={false} href={`/trip?month=${ym}`} className="px-3 py-1 rounded-full text-xs font-semibold border bg-white text-slate-600 border-slate-200 hover:border-blue-500 hover:text-blue-700 transition-colors">
              {_monthLabel(ym)}
            </Link>
          ))}
          <Link prefetch={false} href="/trip" className="px-3 py-1 rounded-full text-xs font-bold border border-blue-600 bg-blue-600 text-white hover:bg-blue-700">Semua →</Link>
        </div>
      </section>
      )}

      {/* FLASH SALE — promo/diskon */}
      {flashSale.length > 0 && (
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-rose-600">⚡ Flash Sale Trip</h2>
            <p className="text-slate-500 mt-1">Promo & diskon spesial — buruan sebelum kehabisan!</p>
          </div>
          <Link href="/trip" className="hidden sm:inline text-sm font-bold text-rose-600 hover:text-rose-700">Lihat semua →</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {flashSale.map((t) => <TripCard key={t.id} t={t} />)}
        </div>
      </section>
      )}

      {/* TRIP SPESIAL LIBURAN AKHIR TAHUN — berangkat 15 Des 2026 - 5 Jan 2027 */}
      {yearEnd.length > 0 && (
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-indigo-600">❄️ Trip Spesial Liburan Akhir Tahun</h2>
            <p className="text-slate-500 mt-1">Amanin liburan akhir tahunmu dari sekarang! Belasan trip liburan akhir tahun sudah sold out — sisa ini aja!</p>
          </div>
          <Link href="/trip" className="hidden sm:inline text-sm font-bold text-indigo-600 hover:text-indigo-700">Lihat semua →</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {yearEnd.map((t) => <TripCard key={t.id} t={t} />)}
        </div>
      </section>
      )}

      {/* BEST SELLER TRIP (dipilih dari master trip) */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">⭐ Best Seller Trip</h2>
            <p className="text-slate-500 mt-1">Trip paling diminati — favorit para peserta.</p>
          </div>
          <Link href="/trip" className="hidden sm:inline text-sm font-bold text-emerald-600 hover:text-emerald-700">Lihat semua →</Link>
        </div>
        {bestSeller.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-2">🧳</p>
            <p className="font-bold text-slate-600">Best seller akan segera tayang</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {bestSeller.map((t) => <TripCard key={t.id} t={t} />)}
          </div>
        )}
        <div className="mt-6 sm:hidden text-center">
          <Link href="/trip" className="text-sm font-bold text-emerald-600">Lihat semua trip →</Link>
        </div>
      </section>

      {/* PRIVATE / CUSTOM TRIP */}
      <section className="max-w-6xl mx-auto px-4 py-12 sm:py-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 px-6 py-10 sm:px-12 sm:py-14 text-center sm:text-left">
          <div className="relative z-10 sm:flex sm:items-center sm:justify-between sm:gap-8">
            <div className="max-w-2xl">
              <span className="inline-block text-3xl sm:text-4xl mb-2">✨</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">Mau trip yang bener-bener kamu banget?</h2>
              <p className="mt-3 text-blue-50 text-sm sm:text-base leading-relaxed">
                Request <b>Private Trip</b> — kamu tentukan destinasi, tanggal, jumlah peserta, budget, dan itinerary.
                Tim kami susunkan penawaran custom sesuai keinginanmu. Cocok untuk honeymoon, keluarga, rombongan kantor, atau komunitas.
              </p>
            </div>
            <div className="mt-6 sm:mt-0 shrink-0">
              <Link href="/request-trip" className="inline-block px-7 py-3.5 rounded-full bg-white text-blue-700 font-bold shadow-xl hover:bg-blue-50 text-sm sm:text-base">
                Buat Request Trip →
              </Link>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 w-56 h-56 rounded-full bg-white/10" />
        </div>
      </section>

      {/* TENTANG */}
      <section className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
        <div className="rounded-2xl overflow-hidden aspect-[4/3] shadow-md order-1 md:order-none">
          <img src={settings?.about_image || cfg.about.image} alt="" className="w-full h-full object-cover" />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{cfg.about.title}</h2>
          <p className="mt-4 text-slate-600 leading-relaxed">{cfg.about.body}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {cfg.about.points.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="text-emerald-500">✓</span> {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONI GOOGLE */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="flex flex-col items-center text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Kata Mereka</h2>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <Stars n={5} />
              <span className="font-bold">{rating}</span>
              <span>· {count} ulasan di Google</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {reviews.map((t, i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
                <Stars n={t.stars} />
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">“{t.text}”</p>
                <div className="mt-4 flex items-center gap-3">
                  {t.photo
                    ? <img src={t.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                    : <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold">{t.name.charAt(0)}</span>}
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t.name}</p>
                    <p className="text-[11px] text-slate-400">{t.when ? `Google Review · ${t.when}` : 'Google Review'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <a href={cfg.googleReviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:shadow-sm">
              Lihat semua ulasan di Google →
            </a>
          </div>
        </div>
      </section>

      {/* YOUTUBE */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Cerita Perjalanan</h2>
            <p className="text-slate-500 mt-1">Tonton momen para peserta langsung dari channel kami.</p>
          </div>
          <a href={cfg.youtubeChannel} target="_blank" rel="noreferrer" className="hidden sm:inline text-sm font-bold text-red-600 hover:text-red-700">YouTube →</a>
        </div>
        {cfg.youtube && cfg.youtube.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {cfg.youtube.map((id) => (
              <div key={id} className="rounded-2xl overflow-hidden aspect-video shadow-sm border border-slate-200">
                <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${id}`} title="YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            ))}
          </div>
        ) : (
          <a href={cfg.youtubeChannel} target="_blank" rel="noreferrer" className="block rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-center py-16 text-white hover:opacity-95">
            <p className="text-5xl">▶</p>
            <p className="mt-3 font-bold text-lg">Tonton di YouTube</p>
            <p className="text-sm text-slate-300 mt-1">Lihat dokumentasi perjalanan peserta kami</p>
          </a>
        )}
      </section>

      {/* CTA AKHIR */}
      <section className="bg-emerald-600">
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Siap berangkat bersama kami?</h2>
          <p className="text-emerald-50 mt-2">Pilih jadwal, booking online, bayar aman dengan DP atau lunas.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/trip" className="px-6 py-3 rounded-full bg-white text-emerald-700 font-bold shadow">Lihat Semua Trip</Link>
            <a href={`https://wa.me/${cfg.waNumber}`} target="_blank" rel="noreferrer" className="px-6 py-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold border border-emerald-400">Chat CS via WhatsApp</a>
          </div>
        </div>
      </section>
    </div>
  );
}
