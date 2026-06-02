// R190d: Webhook endpoint — AWAIT sync (bukan fire-and-forget)
// Vercel serverless terminate function setelah response → fire-and-forget gak selesai
// Fix: await sync sebelum return response. Bonus: skip debounce, return real result.
// Path: app/api/webhook/sheet-sync/route.js

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { syncTripToSheetFromWebhook } from '@/lib/actions/sheet-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveTripId(supabase, table, record) {
  if (!record) return null;
  if (record.trip_id) return record.trip_id;
  if (record.passenger_id) {
    const { data } = await supabase
      .from('trip_passengers')
      .select('trip_id')
      .eq('id', record.passenger_id)
      .maybeSingle();
    if (data?.trip_id) return data.trip_id;
  }
  if (table === 'customers' && record.id) {
    const { data } = await supabase
      .from('trip_passengers')
      .select('trip_id')
      .eq('customer_id', record.id)
      .limit(10);
    return (data || []).map((p) => p.trip_id).filter(Boolean);
  }
  return null;
}

// R190d: cek trip punya sheet_id (debounce di-remove)
async function hasLinkedSheet(supabase, tripId) {
  try {
    const { data } = await supabase
      .from('trips')
      .select('sheet_id')
      .eq('id', tripId)
      .maybeSingle();
    return !!data?.sheet_id;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const expectedSecret = process.env.SHEET_WEBHOOK_SECRET;
    const gotSecret = request.headers.get('x-webhook-secret') || request.headers.get('authorization');
    if (expectedSecret && gotSecret !== expectedSecret && gotSecret !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ error: 'Service config missing' }, { status: 500 });

    const payload = await request.json();
    const record = payload.record || payload.old_record || {};
    const table = payload.table || payload.type;

    console.log('[autosync] payload received', { table, type: payload.type, recordKeys: Object.keys(record || {}) });

    const resolved = await resolveTripId(supabase, table, record);
    if (!resolved) {
      console.log('[autosync] no trip_id resolved', { table });
      return NextResponse.json({ ok: false, reason: 'no trip_id resolved', table });
    }

    const tripIds = Array.isArray(resolved) ? resolved : [resolved];
    const uniqueTripIds = [...new Set(tripIds.filter(Boolean))];

    const results = [];
    // R190d: AWAIT each sync — gak fire-and-forget
    for (const tripId of uniqueTripIds) {
      const hasSheet = await hasLinkedSheet(supabase, tripId);
      if (!hasSheet) {
        console.log('[autosync] skip', tripId, 'no sheet linked');
        results.push({ trip_id: tripId, skipped: true, reason: 'no sheet linked' });
        continue;
      }

      console.log('[autosync] syncing', tripId);
      try {
        const r = await syncTripToSheetFromWebhook(tripId);
        if (r?.error) {
          console.error('[autosync] sync failed', tripId, r.error);
          results.push({ trip_id: tripId, ok: false, error: r.error });
        } else {
          console.log('[autosync] sync OK', tripId, r?.counts);
          results.push({ trip_id: tripId, ok: true, counts: r?.counts });
        }
      } catch (e) {
        console.error('[autosync] exception', tripId, e?.message);
        results.push({ trip_id: tripId, ok: false, error: e?.message || 'exception' });
      }
    }

    return NextResponse.json({ ok: true, table, results });
  } catch (e) {
    console.error('[autosync webhook] outer error', e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/webhook/sheet-sync',
    method: 'POST',
    secret_configured: !!process.env.SHEET_WEBHOOK_SECRET,
    version: 'R190d',
  });
}
