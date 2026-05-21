'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { filterNavByRole } from '@/lib/utils/roles';

// Full nav list — akan di-filter by role
const NAV_ALL = [
  { href: '/dashboard',         label: 'Dashboard',      icon: '◆' },
  { href: '/trips',             label: 'Master Trip',    icon: '✈' },
  { href: '/cs',                label: 'CS Daily',       icon: '☎' },
  { href: '/finance/payments',  label: 'Payment Peserta',icon: '🧾' },  // accessible by CS too
  { href: '/finance',           label: 'Finance',        icon: '$' },
  { href: '/accounting',        label: 'Accounting',     icon: '📊' },
  { href: '/visa',              label: 'Visa',           icon: '🛂' },
  { href: '/tl',                label: 'Portal TL',      icon: '👤' },
  { href: '/tl-master',         label: 'Master TL',      icon: '👥' },
];

export default function Sidebar({ role = null }) {
  const pathname = usePathname();
  const nav = filterNavByRole(NAV_ALL, role);

  // De-dupe — kalau Payment Peserta + Finance dua-duanya jalan, hide Payment
  // (Finance parent sudah include semua). Cuma show Payment kalau role=cs.
  let visible = nav;
  if (role !== 'cs') {
    visible = nav.filter((n) => n.href !== '/finance/payments');
  } else {
    // CS: pastikan /finance parent hidden, cuma /finance/payments
    visible = nav.filter((n) => n.href !== '/finance');
  }

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0 md:left-0 bg-white border-r border-slate-200 z-30">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-lg">
          ✈
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider leading-none">TEONE</p>
          <p className="text-sm font-bold text-brand-700 leading-tight mt-0.5">One System</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {visible.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-brand-700'
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        {visible.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-4">Tidak ada menu — hubungi admin</p>
        )}
      </nav>

      <div className="px-5 py-3 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="text-green-500">●</span> v2.0
        </span>
        <span className="font-mono">2026</span>
      </div>
    </aside>
  );
}
