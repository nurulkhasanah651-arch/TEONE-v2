'use client';

// Round 183b: Generic Realtime Refresh — subscribe ke tables yg di-spec, trigger router.refresh()
// Path: components/common/RealtimeRefresh.jsx
//
// USAGE di server component:
//   import RealtimeRefresh from '@/components/common/RealtimeRefresh';
//   <RealtimeRefresh tables={['trip_finance_items', 'tl_payments']} />
//
// Atau pakai filter spesifik:
//   <RealtimeRefresh subscriptions={[
//     { table: 'trip_finance_items', filter: 'payment_request_status=eq.requested' },
//     { table: 'tl_payments', filter: 'status=eq.requested' },
//   ]} />

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RealtimeRefresh({
  tables = [],            // array of table names → subscribe semua event
  subscriptions = [],     // array of {table, event?, filter?} → fine-grained
  debounceMs = 800,       // debounce router.refresh() biar gak spam
  silent = true,          // false = console.log setiap event (untuk debug)
  enabled = true,
}) {
  const router = useRouter();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    // Normalize: kalau pakai `tables`, expand jadi subscriptions
    const allSubs = [
      ...subscriptions,
      ...tables.map((t) => ({ table: t, event: '*' })),
    ];
    if (allSubs.length === 0) return;

    const supabase = createClient();
    const channelName = `realtime_${Math.random().toString(36).slice(2)}`;
    let channel = supabase.channel(channelName);

    function scheduleRefresh(eventInfo) {
      if (!silent) console.log('[RealtimeRefresh]', eventInfo);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.refresh();
      }, debounceMs);
    }

    for (const sub of allSubs) {
      const config = {
        event: sub.event || '*',
        schema: 'public',
        table: sub.table,
      };
      if (sub.filter) config.filter = sub.filter;

      channel = channel.on('postgres_changes', config, (payload) => {
        scheduleRefresh({ table: sub.table, eventType: payload.eventType, new: payload.new?.id, old: payload.old?.id });
      });
    }

    channel.subscribe((status) => {
      if (!silent) console.log('[RealtimeRefresh] subscribe status:', status);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [enabled, JSON.stringify(tables), JSON.stringify(subscriptions), debounceMs, silent, router]);

  return null; // headless
}
