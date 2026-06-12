import { headers } from 'next/headers';
import Link from 'next/link';
import { resolveBrandCode } from '@/lib/brand-shared';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import { REGIONS } from '@/lib/shop/regions';
import { getLatestTrips } from '@/lib/shop/data';
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
  const latest = await getLatestTrips(6);

  return (
    <div>
      {/* HERO */}
      <section className="relative">
        <HeroSlider images={cfg.heroImages || (cfg.heroImage ? [cfg.heroImage] : [])} />
        <div className="relative max-w-6xl mx-auto px-4 py-24 sm:py-32">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 text-xs font-bold px-3 py-1.5">
            ⭐ {cfg.badge}
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold text-white leading-tight max-w-2xl">{cfg.heroTitle}</h1>
          <p className="mt-4 text-base sm:text-lg text-slate-200 max-w-xl">{cfg.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/trip" className="px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg">Cari Destinasi</Link>
            <a href={`https://wa.me/${cfg.waNumber}`} target="_blank" rel="noreferrer" className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold">Tanya CS</a>
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

      {/* PILIH JADWAL TERBARU */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Pilih Jadwal Terbaru</h2>
            <p className="text-slate-500 mt-1">Keberangkatan terdekat — booking sekarang sebelum seat habis.</p>
          </div>
          <Link href="/trip" className="hidden sm:inline text-sm font-bold text-emerald-600 hover:text-emerald-700">Lihat semua →</Link>
        </div>
        {latest.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-2">🧳</p>
            <p className="font-bold text-slate-600">Jadwal trip akan segera tayang</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {latest.map((t) => <TripCard key={t.id} t={t} />)}
          </div>
        )}
        <div className="mt-6 sm:hidden text-center">
          <Link href="/trip" className="text-sm font-bold text-emerald-600">Lihat semua trip →</Link>
        </div>
      </section>

      {/* KATEGORI PER REGION */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Jelajahi per Destinasi</h2>
          <p className="text-slate-500 mt-1">Pilih region favoritmu.</p>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {REGIONS.map((r) => (
              <Link key={r.key} href={`/trip?region=${r.key}`} className="group relative rounded-2xl overflow-hidden aspect-[3/4] shadow-sm hover:shadow-lg transition-shadow">
                <img src={r.image} alt={r.label} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" />
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

      {/* TENTANG */}
      <section className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
        <div className="rounded-2xl overflow-hidden aspect-[4/3] shadow-md order-1 md:order-none">
          <img src={cfg.about.image} alt="" className="w-full h-full object-cover" />
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
              <span className="font-bold">{cfg.googleRating}</span>
              <span>· {cfg.googleCount} ulasan di Google</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {cfg.testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
                <Stars n={t.stars} />
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">“{t.text}”</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold">{t.name.charAt(0)}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t.name}</p>
                    <p className="text-[11px] text-slate-400">Google Review</p>
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
