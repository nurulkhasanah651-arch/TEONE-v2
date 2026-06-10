// Pemakaian Claude (Anthropic Admin API). Butuh env ANTHROPIC_ADMIN_KEY.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

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

  // FALLBACK: kalau Admin key belum ada, pakai pencatatan internal app (claude_usage_log)
  if (!adminKey) {
    try {
      const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
      const db = createClient(url, key, { auth: { persistSession: false } });
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const [{ data: monthRows }, { data: dayRows }] = await Promise.all([
        db.from('claude_usage_log').select('input_tokens, output_tokens, est_cost_usd, feature').gte('created_at', monthStart),
        db.from('claude_usage_log').select('input_tokens, output_tokens, est_cost_usd').gte('created_at', dayStart),
      ]);
      const sum = (rows, f) => (rows || []).reduce((s, r) => s + Number(r[f] || 0), 0);
      const byFeature = {};
      for (const r of (monthRows || [])) byFeature[r.feature || 'unknown'] = (byFeature[r.feature || 'unknown'] || 0) + Number(r.est_cost_usd || 0);
      return NextResponse.json({
        ok: true, configured: false, source: 'internal-log',
        note: 'Dari pencatatan internal app (estimasi). Untuk angka resmi Anthropic, set ANTHROPIC_ADMIN_KEY.',
        cost_month_usd: Math.round(sum(monthRows, 'est_cost_usd') * 100) / 100,
        tokens_today: { input: sum(dayRows, 'input_tokens'), output: sum(dayRows, 'output_tokens') },
        tokens_month: { input: sum(monthRows, 'input_tokens'), output: sum(monthRows, 'output_tokens') },
        cost_by_feature: byFeature,
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      return NextResponse.json({ ok: false, configured: false, source: 'internal-log', error: e?.message || 'err' }, { headers: { 'Cache-Control': 'no-store' } });
    }
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
