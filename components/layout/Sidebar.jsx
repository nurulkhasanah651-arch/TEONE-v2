'use client';

// Sidebar — menu dikelompokkan jadi kategori yang bisa buka-tutup (collapsible)
// Path: components/layout/Sidebar.jsx

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resolveBrandCodeBrowser, BRAND_UI } from '@/lib/brand-shared';

const ALL_ROLES = ['pic', 'owner', 'accounting', 'manager', 'cs', 'ops'];

// Item flat di paling atas (di luar grup)
const TOP = [
  { href: '/mitra', label: 'Trip Dijual', icon: '🤝', roles: ['mitra'] },
];

// Grup menu yang bisa buka-tutup
const GROUPS = [
  {
    key: 'utama',
    label: 'Utama',
    items: [
      { href: '/ceo',       label: 'CEO · AI',    icon: '🧠', roles: ['owner'] },
      { href: '/dashboard', label: 'Dashboard',   icon: '◆', roles: ALL_ROLES },
      { href: '/trips',      label: 'Master Trip', icon: '✈', roles: ALL_ROLES },
      { href: '/cs',         label: 'CS Daily',    icon: '☎', roles: ALL_ROLES },
      { href: '/visa',       label: 'Visa',        icon: '🛂', roles: ALL_ROLES },
    ],
  },
  {
    key: 'keuangan',
    label: 'Keuangan',
    items: [
      { href: '/finance',    label: 'Finance',    icon: '$',  roles: ['pic', 'owner', 'accounting', 'manager', 'ops'] },
      { href: '/invoices',   label: 'Invoices',   icon: '🧾', roles: ['pic', 'owner', 'accounting', 'manager', 'ops'] },
      { href: '/accounting', label: 'Accounting', icon: '📊', roles: ['owner', 'accounting'] },
      { href: '/refunds',    label: 'Refunds',    icon: '💸', roles: ALL_ROLES },
    ],
  },
  {
    key: 'operasional',
    label: 'Operasional',
    items: [
      { href: '/operasional',   label: 'Operasional',  icon: '🛠', roles: ['pic', 'owner', 'accounting', 'manager', 'ops'] },
      { href: '/plan',          label: 'Plan Trip',    icon: '🗺', roles: ['pic', 'owner', 'accounting', 'manager', 'ops'] },
      { href: '/private-trips', label: 'Request Trip', icon: '📨', roles: ALL_ROLES },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing & Sales',
    items: [
      { href: '/crm',           label: 'CRM Customer',     icon: '👥', roles: ALL_ROLES },
      { href: '/quotations',    label: 'Penawaran AI',     icon: '💰', roles: ALL_ROLES },
      { href: '/ads',           label: 'Ads Manager',      icon: '📢', roles: ALL_ROLES },
      { href: '/content',       label: 'Konten',           icon: '📱', roles: ALL_ROLES },
      { href: '/blast',         label: 'Blast WA',         icon: '📣', roles: ['pic', 'owner', 'accounting', 'manager', 'ops', 'cs'] },
      { href: '/etalase',       label: 'Etalase Web',      icon: '🖼', roles: ['pic', 'owner', 'accounting', 'manager', 'ops', 'cs'] },
    ],
  },
  {
    key: 'tim',
    label: 'Tim & Tour Leader',
    items: [
      { href: '/tl',           label: 'Portal TL',    icon: '👤', roles: [...ALL_ROLES, 'tour_leader'] },
      { href: '/tl-master',    label: 'Master TL',    icon: '👥', roles: ALL_ROLES },
      { href: '/mitra-master', label: 'Master Mitra', icon: '🤝', roles: ['pic', 'owner', 'accounting', 'manager', 'ops', 'cs'] },
    ],
  },
  {
    key: 'data',
    label: 'Data & HR',
    items: [
      { href: '/hr',              label: 'HR',          icon: '🧑', roles: ['owner', 'accounting'] },
      { href: '/passport-manage', label: 'Passport AI', icon: '🤖', roles: ALL_ROLES },
    ],
  },
];

export default function Sidebar({ role: roleProp = null }) {
  const [brandUi, setBrandUi] = useState(BRAND_UI.teone);
  useEffect(() => { setBrandUi(BRAND_UI[resolveBrandCodeBrowser()] || BRAND_UI.teone); }, []);
  const pathname = usePathname();
  const [role, setRole] = useState(roleProp);
  const [loading, setLoading] = useState(!roleProp);
  const [open, setOpen] = useState({}); // { groupKey: bool }
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Utamakan role OTORITATIF dari layout (dihitung dari employees) — anti metadata basi.
    if (roleProp) { setRole(roleProp); setLoading(false); return; }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      let r = user?.app_metadata?.role || user?.user_metadata?.role || null;
      if (!r && user) {
        const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
        const map = { tl: 'tour_leader', finance: 'ops', team: 'ops' };
        r = map[u?.role] || u?.role || 'pending';
      }
      setRole(r || 'pending');
      setLoading(false);
    });
  }, [roleProp]);

  // Inisialisasi state buka-tutup: ambil dari localStorage, lalu pastikan grup aktif kebuka
  useEffect(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('sidebarGroups') || '{}'); } catch {}
    const init = {};
    GROUPS.forEach((g, i) => {
      const hasActive = g.items.some((it) => pathname.startsWith(it.href));
      // default: grup pertama kebuka; grup yang berisi halaman aktif selalu kebuka
      init[g.key] = hasActive || (g.key in saved ? saved[g.key] : i === 0);
    });
    setOpen(init);
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(key) {
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('sidebarGroups', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const canSee = (item) => item.roles ? (role && item.roles.includes(role)) : true;

  const linkClass = (item) => {
    const active = pathname.startsWith(item.href);
    return `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
      active ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-brand-700'
    }`;
  };

  const NavLink = (item) => (
    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={linkClass(item)}>
      <span className="text-base w-5 text-center">{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );

  const tlItems = GROUPS.flatMap((g) => g.items).filter((it) => ['/tl', '/chat', '/tasks'].includes(it.href));
  const visibleTop = TOP.filter(canSee);
  const visibleGroups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  const panel = (
    <>
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-lg font-bold">
          {brandUi.icon}
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{brandUi.label}</p>
          <p className="text-sm font-bold text-brand-700 leading-tight mt--0.5">{brandUi.sub}</p>
        </div>
      </div>

      {role && role !== 'pending' && (
        <div className="px-5 py-2 border-b border-slate-100 shrink-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Role</p>
          <p className="text-xs font-bold text-brand-700 capitalize">
            {role === 'tour_leader' ? 'Tour Leader' : role}
          </p>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-2 text-xs text-slate-400">Loading menu...</div>
        ) : role === 'tour_leader' ? (
          tlItems.map(NavLink)
        ) : role === 'pending' || (visibleTop.length === 0 && visibleGroups.length === 0) ? (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-slate-500 mb-2">Role kamu belum di-set.</p>
            <p className="text-[10px] text-slate-400">Hubungi Owner untuk assign role.</p>
          </div>
        ) : (
          <>
            {visibleTop.map(NavLink)}
            {visibleGroups.map((g) => {
              const isOpen = !!open[g.key];
              return (
                <div key={g.key} className="pt-1">
                  <button type="button" onClick={() => toggle(g.key)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-brand-700 transition-colors">
                    <span className={`text-[9px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    <span>{g.label}</span>
                    <span className="ml-auto text-[9px] font-normal text-slate-300">{g.items.length}</span>
                  </button>
                  {isOpen && <div className="space-y-1 mt-0.5">{g.items.map(NavLink)}</div>}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <div className="px-5 py-3 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5"><span className="text-green-500">●</span> v2.0</span>
        <span className="font-mono">2026</span>
      </div>
    </>
  );

  return (
    <>
      {/* Hamburger — hanya tampil di HP */}
      <button type="button" onClick={() => setMobileOpen(true)} aria-label="Buka menu"
        className="md:hidden fixed top-2.5 left-3 z-40 w-10 h-10 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-700 active:scale-95">
        <span className="text-lg leading-none">☰</span>
      </button>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0 md:bg-white md:border-r md:border-slate-200">
        {panel}
      </aside>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[82%] bg-white border-r border-slate-200 flex flex-col shadow-xl">
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">✕</button>
            {panel}
          </aside>
        </div>
      )}
    </>
  );
}
