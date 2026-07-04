// Webhook status pengiriman dari Fonnte -> update wa_log.state (sent/delivered/read/failed).
// Set URL ini di Fonnte (Device -> Webhook status). Cocokkan berdasarkan Fonnte message id.
import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapState(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('read') || s === '3') return 'read';
  if (s.includes('deliver') || s === '2') return 'delivered';
  if (s.includes('fail') || s === '-1' || s === 'error') return 'failed';
  if (s.includes('sent') || s === '1') return 'sent';
  if (s === '0' || s.includes('pending')) return 'pending';
  return null;
}

function clients() {
  const list = [];
  const t = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const k = { url: process.env.NEXT_PUBLIC_SUPABASE_URL_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY };
  for (const c of [t, k]) {
    if (c.url && c.key) list.push(createServiceClient(c.url, c.key, { auth: { persistSession: false, autoRefreshToken: false } }));
  }
  return list;
}

async function handle(request) {
  let body = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) body = await request.json();
    else { const fd = await request.formData(); body = Object.fromEntries(fd.entries()); }
  } catch { /* ignore */ }

  const url = new URL(request.url);
  const id = String(body.id ?? body.messageId ?? url.searchParams.get('id') ?? '').trim();
  const state = mapState(body.status ?? body.state ?? body.ack ?? url.searchParams.get('status'));
  if (!id || !state) return NextResponse.json({ ok: true, skipped: 'no id/state' });

  let updated = 0;
  for (const db of clients()) {
    try {
      const { data } = await db.from('wa_log')
        .update({ state, updated_at: new Date().toISOString() })
        .eq('fonnte_id', id).select('id');
      updated += (data?.length || 0);
    } catch { /* try next brand */ }
  }
  return NextResponse.json({ ok: true, id, state, updated });
}

export async function POST(request) { return handle(request); }
export async function GET(request) { return handle(request); }
