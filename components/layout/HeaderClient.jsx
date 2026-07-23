'use client';

// Round 183: HeaderClient — pass currentUserId ke NotificationBell untuk realtime subscribe
// Path: components/layout/HeaderClient.jsx

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { resetRole } from '@/lib/actions/user-role';
import { ROLE_LABELS, ROLE_BADGE_COLOR } from '@/lib/utils/roles';
import NotificationBell from './NotificationBell';
import AttendanceButton from './AttendanceButton';

export default function HeaderClient({ user, role = null, notifications = [], unreadCount = 0 }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const avatar = user?.user_metadata?.avatar_url;
  const initial = name.charAt(0).toUpperCase();
  const roleLabel = ROLE_LABELS[role] || role || '—';
  const roleBadge = ROLE_BADGE_COLOR[role] || 'bg-slate-100 text-slate-700';
  const isStaff = role && role !== 'pending' && role !== 'mitra';
  const isInternal = ['pic', 'owner', 'accounting', 'manager', 'cs', 'ops'].includes(role);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function handleResetRole() {
    if (!confirm('Reset role? Kamu akan diminta pilih role lagi.')) return;
    const r = await resetRole();
    if (r?.error) { alert(r.error); return; }
    router.push('/auth/role-picker');
    router.refresh();
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between pl-16 pr-3 md:px-6 sticky top-0 z-20">
      <div>
        <p className="text-xs text-slate-500 font-medium hidden xs:block sm:block truncate">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="flex items-center gap-1.5">
        {isStaff && (
          <>
            {isInternal && <AttendanceButton />}
            <Link href="/tasks" title="To-Do List" className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors text-base">✅</Link>
            <Link href="/chat" title="Chat Tim" className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors text-base">💬</Link>
            <span className="hidden sm:block w-px h-6 bg-slate-200 mx-0.5" />
          </>
        )}
        {/* R183: pass currentUserId untuk realtime subscribe */}
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          currentUserId={user?.id}
        />

        <div className="relative">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            {avatar ? (
              <img src={avatar} alt={name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-semibold">{initial}</div>
            )}
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-slate-700 leading-tight">{name}</p>
              <p className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block leading-none mt-0.5 ${roleBadge}`}>
                {roleLabel}
              </p>
            </div>
            <span className="text-slate-400 text-xs">▾</span>
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1.5">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-slate-500">Signed in as</p>
                  <p className="text-sm font-medium text-slate-800 truncate">{user?.email}</p>
                  <p className={`mt-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block ${roleBadge}`}>{roleLabel}</p>
                </div>
                {role !== 'tour_leader' && role !== 'mitra' && (
                  <Link href="/ganti-password" onClick={() => setOpen(false)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    🔑 Ganti Password
                  </Link>
                )}
                {(role === 'cs' || role === 'ops' || role === 'tour_leader') && (
                  <button onClick={handleResetRole} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    ⟲ Reset Role
                  </button>
                )}
                <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
