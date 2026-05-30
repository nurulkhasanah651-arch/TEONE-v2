'use client';

// Round 170: Sidebar — tambah menu HR (owner, manager only)
// Path: components/layout/Sidebar.jsx

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',    icon: '◆',  roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/trips',           label: 'Master Trip',  icon: '✈',  roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/cs',              label: 'CS Daily',     icon: '☎',  roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/quotations',      label: 'Penawaran AI', icon: '💰', roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/ads',             label: 'Ads Manager',  icon: '📢', roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/finance',         label: 'Finance',      icon: '$',  roles: ['owner', 'manager', 'ops'] },
  { href: '/accounting',      label: 'Accounting',   icon: '📊', roles: ['owner', 'manager'] },
  { href: '/hr',              label: 'HR / HDR',     icon: '👥', roles: ['owner', 'manager'] },
  { href: '/invoices',        label: 'Invoices',     icon: '🧾', roles: ['owner', 'manager', 'ops'] },
  { href: '/refunds',         label: 'Refunds',      icon: '💸', roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/visa',            label: 'Visa',         icon: '🛂', roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/passport-manage', label: 'Passport AI',  icon: '🤖', roles: ['owner', 'manager', 'cs', 'ops'] },
  { href: '/tl',              label: 'Portal TL',    icon: '👤', roles: ['owner', 'manager', 'cs', 'ops', 'tour_leader'] },
  { href: '/tl-master',       label: 'Master TL',    icon: '👨‍💼', roles: ['owner', 'manager'] },
  { href: '/tasks',           label: 'To-Do List',   icon: '✅', roles: ['owner', 'manager', 'cs', 'ops', 'tour_leader'] },
  { href: '/chat',            label: 'Chat Tim',     icon: '💬', roles: ['owner', 'manager', 'cs', 'ops', 'tour_leader'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const r =
        user?.user_metadata?.role ||
        user?.app_metadata?.role ||
        'pending';
      setRole(r);
      setLoading(false);
    });
  }, []);

  const visibleNav = NAV.filter((item) => {
    if (!item.roles) return true;
    if (!role) return false;
    return item.roles.includes(role);
  });

  const finalNav = role === 'tour_leader'
    ? NAV.filter((item) => ['/tl', '/chat', '/tasks'].includes(item.href))
    : visibleNav;

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0 md:bg-white md:border-r md:border-slate-200">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-lg font-bold">
          ✈
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">TEONE</p>
          <p className="text-sm font-bold text-brand-700 leading-tight mt--0.5">One System</p>
        </div>
      </div>

      {role && role !== 'pending' && (
        <div className="px-5 py-2 border-b border-slate-100">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Role</p>
          <p className="text-xs font-bold text-brand-700 capitalize">
            {role === 'tour_leader' ? 'Tour Leader' : role}
          </p>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-2 text-xs text-slate-400">Loading menu...</div>
        ) : finalNav.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-slate-500 mb-2">Role kamu belum di-set.</p>
            <p className="text-[10px] text-slate-400">Hubungi Owner untuk assign role.</p>
          </div>
        ) : (
          finalNav.map((item) => {
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
          })
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
