'use client';

// Round 141: Tambah menu "Passport AI" di sidebar
// Path: components/layout/Sidebar.jsx

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',    icon: '◆' },
  { href: '/trips',           label: 'Master Trip',  icon: '✈' },
  { href: '/cs',              label: 'CS Daily',     icon: '☎' },
  { href: '/finance',         label: 'Finance',      icon: '$' },
  { href: '/accounting',      label: 'Accounting',   icon: '📊' },
  { href: '/invoices',        label: 'Invoices',     icon: '🧾' },
  { href: '/refunds',         label: 'Refunds',      icon: '💸' },
  { href: '/visa',            label: 'Visa',         icon: '🛂' },
  { href: '/passport-manage', label: 'Passport AI',  icon: '🤖' },
  { href: '/tl',              label: 'Portal TL',    icon: '👤' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0 md:bg-white md:border-r md:border-slate-200">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-lg font-bold">
          ✈
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">TEONE</p>
          <p className="text-sm font-bold text-brand-700 leading-tight mt--0.5">One System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.disabled ? '#' : item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                active
                  ? 'bg-brand-100 text-brand-700'
                  : item.disabled
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-brand-700'
              }`}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
              {item.disabled && (
                <span className="ml-auto text-[9px] uppercase tracking-wider bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">soon</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="text-green-500">●</span> v2.0
        </span>
        <span className="font-mono">2026</span>
      </div>
    </aside>
  );
}
