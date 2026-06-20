// Menu Etalase — kelola foto header (slider) & region storefront publik.
import { headers } from 'next/headers';
import { resolveBrandCode } from '@/lib/brand-shared';
import { defaultTermsFor } from '@/lib/shop/default-terms';
import { getStorefrontSettings } from '@/lib/actions/storefront-settings';
import EtalaseManager from '@/components/etalase/EtalaseManager';

export const dynamic = 'force-dynamic';

export default async function EtalasePage() {
  const r = await getStorefrontSettings();
  const heroImages = r?.ok ? r.hero_images : [];
  const regions = r?.ok ? r.regions : [];
  const privateImages = r?.ok ? r.private_images : [];
  let brand = 'teone';
  try { const h = headers(); brand = h.get('x-brand') || resolveBrandCode({ host: h.get('host') }) || 'teone'; } catch {}
  const termsSaved = r?.ok ? (r.terms_default || '') : '';
  const termsSeed = defaultTermsFor(brand);
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-slate-900">🖼 Etalase Website</h1>
        <p className="text-sm text-slate-500 mt-1">
          Atur foto header (slider) dan judul + foto region yang tampil di website jualan ({'{'}travelingeropa.com / khasanahtravel.com{'}'}).
        </p>
      </div>
      <EtalaseManager initialHero={heroImages} initialRegions={regions} initialPrivate={privateImages} initialTerms={termsSaved} termsSeed={termsSeed} initialLogo={r?.logo_url || ''} />
    </div>
  );
}
