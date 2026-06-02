// Round 190: Webhook endpoint — auto-sync Sheet pas data berubah di Supabase
// Path: app/api/webhook/sheet-sync/route.js
//
// Cara kerjanya:
// 1. User edit data di TEONE (peserta, payment, HPP, dll)
// 2. Supabase Database Webhook ke-trigger
// 3. Webhook POST ke endpoint ini dgn payload { table, type, record }
// 4. Endpoint resolve trip_id dari record
// 5. Trigger syncTripToSheet(tripId)
// 6. Sheet auto-update real-time

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { syncTripToSheet } from '@/lib/actions/sheet-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 sec timeout

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Resolve trip_id dari berbagai tabel
async function resolveTripId(supabase, table, record) {
  if (!record) return null;

  // Tabel yang langsung punya trip_id
  if (record.trip_id) return record.trip_id;

  // trip_passengers.id → trip_id (via passenger_id lookup)
  if (record.passenger_id) {
    const { data } = await supabase
      .from('trip_passengers')
      .select('trip_id')
      .eq('id', record.passenger_id)
      .maybeSingle();
    if (data?.trip_id) return data.trip_id;
  }

  // customers → cari semua trip_passengers yg customer_id-nya match (kalau customer di-edit)
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

// Debounce — kalau sheet baru sync < 5 detik lalu, skip
async function shouldSync(supabase, tripId) {
  try {
    const { data } = await supabase
      .from('trips')
      .select('sheet_id, last_sheet_sync_at')
      .eq('id', tripId)
      .maybeSingle();
    if (!data?.sheet_id) return false; // Trip belum punya sheet
    if (!data.last_sheet_sync_at) return true;
    const ago = Date.now() - new Date(data.last_sheet_sync_at).getTime();
    return ago > 3000; // > 3 detik OK sync lagi
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    // Validate webhook secret (optional but recommended)
    const expectedSecret = process.env.SHEET_WEBHOOK_SECRET;
    const gotSecret = request.headers.get('x-webhook-secret') || request.headers.get('authorization');
    if (expectedSecret && gotSecret !== expectedSecret && gotSecret !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ error: 'Service config missing' }, { status: 500 });

    const payload = await request.json();
    // Format Supabase webhook: { type: 'INSERT'|'UPDATE'|'DELETE', table, schema, record, old_record }
    const record = payload.record || payload.old_record || {};
    const table = payload.table || payload.type;

    const resolved = await resolveTripId(supabase, table, record);
    if (!resolved) {
      return NextResponse.json({ ok: false, reason: 'no trip_id resolved', table });
    }

    // Bisa single tripId atau array
    const tripIds = Array.isArray(resolved) ? resolved : [resolved];
    const uniqueTripIds = [...new Set(tripIds.filter(Boolean))];

    const results = [];
    for (const tripId of uniqueTripIds) {
      const canSync = await shouldSync(supabase, tripId);
      if (!canSync) {
        results.push({ trip_id: tripId, skipped: true, reason: 'no sheet or debounced' });
        continue;
      }
      // Fire & forget — don't await, let it run in background
      syncTripToSheet(tripId).catch((e) => {
        console.error('[autosync] sync failed for trip', tripId, e?.message);
      });
      results.push({ trip_id: tripId, triggered: true });
    }

    return NextResponse.json({ ok: true, table, results });
  } catch (e) {
    console.error('[autosync webhook]', e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

// GET endpoint buat health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/webhook/sheet-sync',
    method: 'POST',
    secret_configured: !!process.env.SHEET_WEBHOOK_SECRET,
  });
}
