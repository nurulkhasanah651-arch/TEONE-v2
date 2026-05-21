'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markNotificationRead, markAllNotificationsRead } from '@/lib/actions/team-collab';
import { fmtDate } from '@/lib/utils/format';

export default function NotificationBell({ notifications = [], unreadCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(notif) {
    if (!notif.read) {
      startTransition(async () => {
        await markNotificationRead(notif.id);
        router.refresh();
      });
    }
    if (notif.link) {
      setOpen(false);
      router.push(notif.link);
    }
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return 'baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}j`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}h`;
    return fmtDate(ts);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        title="Notifikasi"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-brand-700">Notifikasi</p>
              {unreadCount > 0 && (
                <button onClick={handleMarkAll} disabled={pending} className="text-[11px] text-brand-600 hover:underline disabled:opacity-50">
                  Tandai semua sudah dibaca
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">Tidak ada notifikasi.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-brand-50/40' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold ${!n.read ? 'text-brand-700' : 'text-slate-700'}`}>{n.title}</p>
                          {n.message && <p className="text-[11px] text-slate-600 mt-0.5">{n.message}</p>}
                          <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
