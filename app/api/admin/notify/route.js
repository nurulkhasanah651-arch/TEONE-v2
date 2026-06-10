// Kirim notifikasi WA ke admin (dipakai AI agent harian). Protected by secret.
import { NextResponse } from 'next/server';
import { sendFonnte } from '@/lib/utils/fonnte';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_WA = process.env.ADMIN_WA || '087778264209';

function authed(request, url) {
  const auth = request.headers.get('authorization') || '';
  const provided = url.searchParams.get('secret') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const cronSecret = process.env.CRON_SECRET;
  const windsorKey = process.env.WINDSOR_API_KEY;
  return !cronSecret || provided === cronSecret || (windsorKey && provided === windsorKey);
}

async function handle(request) {
  const url = new URL(request.url);
  if (!authed(request, url)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  let message = url.searchParams.get('message') || '';
  const to = url.searchParams.get('to') || ADMIN_WA;
  if (request.method === 'POST') {
    try { const body = await request.json(); message = body.message || message; } catch {}
  }
  if (!message) return NextResponse.json({ error: 'message kosong' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

  const res = await sendFonnte(to, message, { context: 'finance' });
  return NextResponse.json(
    res.error ? { ok: false, error: res.error } : { ok: true, sentTo: to },
    { status: res.error ? 502 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
