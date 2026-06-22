// app/api/cron/cancel-unpaid/route.js
// Auto-cancel booking yang sudah >24 jam tapi belum dibayar (status masih 'pending').
// Booking Transfer Manual yang sedang menunggu verifikasi finance (manual_status='pending')
// TIDAK dibatalkan. Booking pending tidak menahan seat (seat baru terpotong saat lunas/approve),
// jadi pembatalan ini murni membersihkan order yang ditinggal.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnvFor } from '@/lib/brand-shared';

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
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const results = [];

  for (const code of ['teone', 'khasanah']) {
    const db = clientFor(code);
    if (!db) { results.push({ brand: code, skipped: 'no_credentials' }); continue; }
    try {
      // pending & dibuat >24 jam lalu
      const { data: rows, error } = await db.from('bookings')
        .select('id, order_code, payment_method, manual_status, created_at')
        .eq('status', 'pending')
        .lt('created_at', cutoff);
      if (error) { results.push({ brand: code, error: error.message }); continue; }

      // jangan batalkan transfer manual yang sedang nunggu verifikasi finance
      const toCancel = (rows || []).filter(
        (b) => !(b.payment_method === 'manual_transfer' && b.manual_status === 'pending')
      );
      if (toCancel.length === 0) { results.push({ brand: code, cancelled: 0 }); continue; }

      const ids = toCancel.map((b) => b.id);
      const { error: upErr } = await db.from('bookings')
        .update({ status: 'cancelled' })
        .in('id', ids);
      if (upErr) { results.push({ brand: code, error: upErr.message }); continue; }
      results.push({ brand: code, cancelled: ids.length, orders: toCancel.map((b) => b.order_code) });
    } catch (e) {
      results.push({ brand: code, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({ ok: true, cutoff, results });
}
