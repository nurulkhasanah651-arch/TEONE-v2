// Pemakaian Claude (Anthropic Admin API). Butuh env ANTHROPIC_ADMIN_KEY.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authed(request, url) {
  const auth = request.headers.get('authorization') || '';
  const provided = url.searchParams.get('secret') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const cronSecret = process.env.CRON_SECRET;
  const windsorKey = process.env.WINDSOR_API_KEY;
  return !cronSecret || provided === cronSecret || (windsorKey && provided === windsorKey);
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

export async function GET(request) {
  const url = new URL(request.url);
  if (!authed(request, url)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { ok: false, configured: false, note: 'ANTHROPIC_ADMIN_KEY belum di-set di Vercel env.' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const now = new Date();
  const start = new Date(now); start.setUTCDate(1); // awal bulan
  const headers = { 'x-api-key': adminKey, 'anthropic-version': '2023-06-01' };

  const result = { ok: true, configured: true, period: { from: isoDate(start), to: isoDate(now) } };

  // Cost report (USD) — bulan berjalan
  try {
    const q = new URLSearchParams({ starting_at: start.toISOString(), ending_at: now.toISOString(), bucket_width: '1d' });
    const r = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, { headers });
    const j = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(j.data)) {
      let total = 0;
      for (const bucket of j.data) {
        for (const item of (bucket.results || bucket.items || [])) {
          total += Number(item.amount?.value ?? item.amount ?? item.cost ?? 0);
        }
      }
      result.cost_month_usd = Math.round(total * 100) / 100;
    } else {
      result.cost_error = j.error?.message || `HTTP ${r.status}`;
    }
  } catch (e) { result.cost_error = e?.message || 'err'; }

  // Usage report (token) — hari ini
  try {
    const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
    const q = new URLSearchParams({ starting_at: today.toISOString(), ending_at: now.toISOString(), bucket_width: '1d' });
    const r = await fetch(`https://api.anthropic.com/v1/organizations/usage_report/messages?${q}`, { headers });
    const j = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(j.data)) {
      let inTok = 0, outTok = 0;
      for (const bucket of j.data) {
        for (const item of (bucket.results || bucket.items || [])) {
          inTok += Number(item.uncached_input_tokens ?? item.input_tokens ?? 0);
          outTok += Number(item.output_tokens ?? 0);
        }
      }
      result.tokens_today = { input: inTok, output: outTok };
    } else {
      result.usage_error = j.error?.message || `HTTP ${r.status}`;
    }
  } catch (e) { result.usage_error = e?.message || 'err'; }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
