import { headers } from 'next/headers';
import { resolveBrandCode } from '@/lib/brand-shared';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import { getStorefrontSettingsPublic } from '@/lib/shop/data';
import PrivateTripRequestForm from '@/components/shop/PrivateTripRequestForm';
import HeroSlider from '@/components/shop/HeroSlider';

export const dynamic = 'force-dynamic';

function brandCode() {
  try { const h = headers(); return h.get('x-brand') || resolveBrandCode({ host: h.get('host') }); }
  catch { return 'teone'; }
}

export default async function RequestTripPage() {
  const code = brandCode();
  const isKh = code === 'khasanah';
  const cfg = storefrontConfig(code);
  const settings = await getStorefrontSettingsPublic();
  const photos = (settings?.private_images && settings.private_images.length) ? settings.private_images : [];

  // Khasanah: nuansa orange/merah bata (soft) + copy umroh private. Teone: tetap biru.
  const heroGrad = isKh
    ? 'bg-gradient-to-br from-orange-600 via-orange-500 to-amber-400'
    : 'bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500';
  const heroOverlay = isKh
    ? 'absolute inset-0 bg-gradient-to-br from-orange-700/80 via-orange-600/70 to-amber-500/60'
    : 'absolute inset-0 bg-gradient-to-br from-blue-800/80 via-blue-700/70 to-sky-600/60';
  const heroIcon = isKh ? '🕋' : '✈';
  const heroTitle = isKh ? 'Umroh Private Lebih Exclusive' : 'Request Private Trip';
  const heroSubtitle = isKh
    ? `Perjalanan umroh private yang lebih khusyuk & eksklusif — jadwal, hotel dekat masjid, dan layanan disesuaikan dengan keinginan Anda. Silakan request di sini, tim ${cfg.brandName || 'Khasanah Travel'} akan menyusun penawaran terbaik.`
    : `Custom trip impianmu — destinasi, tanggal, budget, dan itinerary bebas kamu tentukan. Tim ${cfg.brandName || 'kami'} susunkan penawaran sesuai keinginanmu.`;

  return (
    <div className="bg-slate-50">
      {/* HEADER — brand-aware (khasanah: orange/merah bata, teone: biru) */}
      <section className={`relative overflow-hidden ${heroGrad}`}>
        {photos.length > 0 && (
          <div className="absolute inset-0">
            <HeroSlider images={photos} overlay="bottom" />
            <div className={heroOverlay} />
          </div>
        )}
        <div className="relative max-w-2xl mx-auto px-4 py-12 sm:py-16 text-center">
          <span className="inline-block text-3xl sm:text-4xl mb-2">{heroIcon}</span>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">{heroTitle}</h1>
          <p className={`mt-3 ${isKh ? 'text-orange-50' : 'text-blue-50'} text-sm sm:text-base max-w-xl mx-auto`}>
            {heroSubtitle}
          </p>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 py-8 md:py-10 -mt-6 relative z-10">
        <PrivateTripRequestForm waNumber={cfg.waNumber} accent={isKh ? 'orange' : 'blue'} />
      </div>
    </div>
  );
}
