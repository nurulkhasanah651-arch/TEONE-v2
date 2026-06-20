import { headers } from 'next/headers';
import Link from 'next/link';
import { resolveBrandCode, BRAND_UI } from '@/lib/brand-shared';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import { getStorefrontSettingsPublic } from '@/lib/shop/data';

function brandCode() {
  try { const h = headers(); return h.get('x-brand') || resolveBrandCode({ host: h.get('host') }); }
  catch { return 'teone'; }
}

export default async function ShopLayout({ children }) {
  const code = brandCode();
  const ui = BRAND_UI[code] || BRAND_UI.teone;
  const cfg = storefrontConfig(code);
  const wa = cfg.waNumber || '6282210991200';
  const settings = await getStorefrontSettingsPublic();
  const logo = (settings?.logo_url || '').trim();
  const c = cfg.contact || {};
  const waDisp = c.phone ? ('0' + String(c.phone).replace(/^62/, '')) : '';
  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link href="/home" className="flex items-center gap-2 font-extrabold text-lg sm:text-xl text-slate-900 shrink-0">
            {logo ? (
              <img src={logo} alt={cfg.brandName || ui.label} className="h-9 sm:h-11 w-auto object-contain" />
            ) : (
              <>
                <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center text-sm">{ui.icon}</span>
                <span className="hidden xs:inline sm:inline">{cfg.brandName || ui.label}</span>
              </>
            )}
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-4 text-[13px] sm:text-sm font-semibold text-slate-600">
            <Link href="/trip" className="hover:text-slate-900 px-2 py-1.5">Open Trip</Link>
            <Link href="/request-trip" className="hover:text-emerald-700 text-emerald-600 px-2 py-1.5 whitespace-nowrap">✈ Custom Trip</Link>
            <Link href="/akun" className="hover:text-slate-900 px-2 py-1.5">Akun</Link>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white whitespace-nowrap">
              <span className="sm:hidden">💬</span><span className="hidden sm:inline">Tanya CS</span>
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 mt-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div>
              {logo ? <img src={logo} alt={cfg.brandName || ui.label} className="h-10 w-auto object-contain mb-2" /> : <p className="font-extrabold text-slate-800 text-lg">{cfg.brandName || ui.label}</p>}
              <p className="mt-2 text-sm text-slate-500 max-w-sm">{ui.footer}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-2">Contact Us</p>
              <ul className="space-y-1.5 text-sm text-slate-600">
                {c.phone && <li>📱 <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className="hover:text-emerald-700 font-semibold">{waDisp}</a> (WhatsApp)</li>}
                {c.email && <li>✉️ <a href={`mailto:${c.email}`} className="hover:text-slate-900">{c.email}</a></li>}
                {c.address && <li className="flex gap-1.5"><span>📍</span><span>{c.address}</span></li>}
                {(c.instagram || c.tiktok) && (
                  <li className="flex gap-3 pt-1">
                    {c.instagram && <a href={c.instagram} target="_blank" rel="noreferrer" className="font-semibold text-pink-600 hover:underline">Instagram</a>}
                    {c.tiktok && <a href={c.tiktok} target="_blank" rel="noreferrer" className="font-semibold text-slate-800 hover:underline">TikTok</a>}
                  </li>
                )}
              </ul>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-slate-400">© {new Date().getFullYear()} · PT Khasanah Global Internasional</p>
        </div>
      </footer>
    </div>
  );
}
