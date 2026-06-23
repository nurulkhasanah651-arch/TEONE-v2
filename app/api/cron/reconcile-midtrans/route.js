// Rekonsiliasi pembayaran Midtrans: jaring pengaman bila webhook telat/terlewat.
// Cek booking PENDING (punya midtrans_order_id, dibuat <24 jam) -> tanya status ke Midtrans ->
// kalau sudah settle, proses fulfillment (mark paid + masuk Master Trip + checklist + WA).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnvFor } from '@/lib/brand-shared';
import { reconcilePendingBooking } from '@/lib/shop/fulfillment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function serviceKeyFor(code) {
  if (code === 'khasanah') return process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
function clientFor(code) {
  const { url } = supabaseEnvFor(code);
  const key = serviceKeyFor(code);
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const results = [];

  for (const code of ['teone', 'khasanah']) {
    const db = clientFor(code);
    if (!db) { results.push({ brand: code, skipped: 'no_credentials' }); continue; }
    try {
      const { data: rows, error } = await db.from('bookings')
        .select('id, order_code, status, midtrans_order_id, created_at')
        .eq('status', 'pending')
        .not('midtrans_order_id', 'is', null)
        .gte('created_at', since);
      if (error) { results.push({ brand: code, error: error.message }); continue; }
      let healed = 0;
      for (const b of rows || []) {
        try { if (await reconcilePendingBooking(code, b)) healed++; } catch { /* skip */ }
      }
      results.push({ brand: code, checked: (rows || []).length, healed });
    } catch (e) {
      results.push({ brand: code, error: e?.message || String(e) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
