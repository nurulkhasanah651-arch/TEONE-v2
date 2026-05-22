// app/api/cron/tl-h14-reminder/route.js
// Vercel Cron: jalan tiap hari jam 01:00 UTC (08:00 WIB)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendH14Reminder } from '@/lib/actions/tl-assign';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function todayPlus14ISO() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString().slice(0, 10);
}

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = adminClient();
    const targetDate = todayPlus14ISO();

    const { data: trips, error } = await supabase
      .from('trips')
      .select('id, kode_trip, name, departure, tl_id, tl_assignment_status, tl_h14_sent_at')
      .eq('departure', targetDate)
      .not('tl_id', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = [];
    for (const trip of (trips || [])) {
      if (trip.tl_assignment_status !== 'approved') {
        results.push({ trip_id: trip.id, skipped: 'tl_not_approved' });
        continue;
      }
      if (trip.tl_h14_sent_at) {
        const sentDate = String(trip.tl_h14_sent_at).slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);
        if (sentDate === todayStr) {
          results.push({ trip_id: trip.id, skipped: 'already_sent_today' });
          continue;
        }
      }

      const r = await sendH14Reminder(trip.id);
      if (r?.ok) {
        await supabase
          .from('trips')
          .update({ tl_h14_sent_at: new Date().toISOString() })
          .eq('id', trip.id);
        results.push({ trip_id: trip.id, ok: true });
      } else {
        results.push({ trip_id: trip.id, error: r?.error || 'skipped' });
      }
    }

    return NextResponse.json({
      ok: true,
      target_date: targetDate,
      count_found: (trips || []).length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}
