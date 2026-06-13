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
  const cfg = storefrontConfig(code);
  const settings = await getStorefrontSettingsPublic();
  const photos = (settings?.private_images && settings.private_images.length) ? settings.private_images : [];

  return (
    <div className="bg-slate-50">
      {/* HEADER — nuansa biru + foto (kalau ada) */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500">
        {photos.length > 0 && (
          <div className="absolute inset-0">
            <HeroSlider images={photos} overlay="bottom" />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-800/80 via-blue-700/70 to-sky-600/60" />
          </div>
        )}
        <div className="relative max-w-2xl mx-auto px-4 py-12 sm:py-16 text-center">
          <span className="inline-block text-3xl sm:text-4xl mb-2">✈</span>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">Request Private Trip</h1>
          <p className="mt-3 text-blue-50 text-sm sm:text-base max-w-xl mx-auto">
            Custom trip impianmu — destinasi, tanggal, budget, dan itinerary bebas kamu tentukan.
            Tim {cfg.brandName || 'kami'} susunkan penawaran sesuai keinginanmu.
          </p>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 py-8 md:py-10 -mt-6 relative z-10">
        <PrivateTripRequestForm waNumber={cfg.waNumber} accent="blue" />
      </div>
    </div>
  );
}
