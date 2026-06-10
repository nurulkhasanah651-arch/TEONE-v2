// Pencatatan pemakaian Claude (token + estimasi biaya) ke tabel claude_usage_log.
// Fire-and-forget: tidak memblokir respons utama; error ditelan.
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

// Harga per 1 juta token (USD) — perkiraan; sesuaikan bila perlu.
const PRICING = {
  'claude-opus-4-7':   { in: 15, out: 75 },
  'claude-opus':       { in: 15, out: 75 },
  'claude-sonnet-4-5': { in: 3,  out: 15 },
  'claude-sonnet':     { in: 3,  out: 15 },
  'claude-haiku':      { in: 0.8, out: 4 },
};
function priceFor(model) {
  const m = String(model || '').toLowerCase();
  for (const key of Object.keys(PRICING)) if (m.includes(key)) return PRICING[key];
  if (m.includes('opus')) return PRICING['claude-opus'];
  if (m.includes('haiku')) return PRICING['claude-haiku'];
  return PRICING['claude-sonnet'];
}

export async function logClaudeUsage({ feature, model, usage }) {
  try {
    const inTok = Number(usage?.input_tokens || 0);
    const outTok = Number(usage?.output_tokens || 0);
    if (!inTok && !outTok) return;
    const p = priceFor(model);
    const cost = (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
    const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
    if (!url || !key) return;
    const db = createClient(url, key, { auth: { persistSession: false } });
    await db.from('claude_usage_log').insert({
      feature: feature || 'unknown', model: model || null,
      input_tokens: inTok, output_tokens: outTok,
      est_cost_usd: Math.round(cost * 1e6) / 1e6,
    });
  } catch { /* swallow */ }
}
