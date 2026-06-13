import { headers } from 'next/headers';
import { resolveBrandCode } from '@/lib/brand-shared';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import PrivateTripRequestForm from '@/components/shop/PrivateTripRequestForm';

export const dynamic = 'force-dynamic';

function brandCode() {
  try { const h = headers(); return h.get('x-brand') || resolveBrandCode({ host: h.get('host') }); }
  catch { return 'teone'; }
}

export default function RequestTripPage() {
  const cfg = storefrontConfig(brandCode());
  return (
    <div className="bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-7">
          <span className="inline-block text-3xl mb-2">✈</span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">Request Private Trip</h1>
          <p className="text-slate-500 mt-2 text-sm md:text-base">
            Custom trip impianmu — destinasi, tanggal, budget, dan itinerary bebas kamu tentukan.
            Tim kami susunkan penawaran sesuai keinginanmu.
          </p>
        </div>
        <PrivateTripRequestForm waNumber={cfg.waNumber} />
      </div>
    </div>
  );
}
