import { headers } from 'next/headers';
import Link from 'next/link';
import { resolveBrandCode, BRAND_UI } from '@/lib/brand-shared';

function brandCode() {
  try { const h = headers(); return h.get('x-brand') || resolveBrandCode({ host: h.get('host') }); }
  catch { return 'teone'; }
}

export default function ShopLayout({ children }) {
  const code = brandCode();
  const ui = BRAND_UI[code] || BRAND_UI.teone;
  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 sticky top-0 bg-white/90 backdrop-blur z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2 font-extrabold text-xl text-slate-900">
            <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">{ui.icon}</span>
            <span>{ui.label}</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-semibold text-slate-600">
            <Link href="/home" className="hover:text-slate-900 hidden sm:inline">Beranda</Link>
            <Link href="/trip" className="hover:text-slate-900">Open Trip</Link>
            <Link href="/akun" className="hover:text-slate-900">Akun</Link>
            <a href="https://wa.me/628145460210" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white">Tanya CS</a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 mt-16 py-8 text-center text-xs text-slate-500">
        <p className="font-bold text-slate-700">{ui.label}</p>
        <p className="mt-1">{ui.footer}</p>
        <p className="mt-1">© {new Date().getFullYear()} · PT Khasanah Global Internasional</p>
      </footer>
    </div>
  );
}
