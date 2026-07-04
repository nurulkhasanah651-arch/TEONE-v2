'use server';
// Asisten Manager AI — diskusi data perusahaan & marketing: performa ads, omzet, closing, conversion.
// Untuk management (owner/manager/ops/accounting). Grounded pada metrik real + ringkasan ads.
import { createClient } from '@/lib/supabase/server';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import { buildCeoMetrics, metricsToContext } from '@/lib/actions/ceo-metrics';
import { fetchAll } from '@/lib/supabase/fetch-all';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-opus-4-7';
const ALLOWED = ['owner', 'manager', 'ops', 'accounting', 'cs'];

async function assertManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return false;
  const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  return ALLOWED.includes(u?.role);
}

function rp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

// Ringkasan performa ads bulan berjalan (dari ads_entries), per platform.
async function buildAdsContext() {
  const supabase = createClient();
  const month = new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const rows = await fetchAll(() => supabase.from('ads_entries')
    .select('platform, spend, impressions, clicks, leads, date').gte('date', start));
  const byPf = {};
  let tSpend = 0, tImp = 0, tClk = 0, tLead = 0;
  for (const r of (rows || [])) {
    const pf = r.platform || 'lainnya';
    if (!byPf[pf]) byPf[pf] = { spend: 0, imp: 0, clk: 0, lead: 0 };
    byPf[pf].spend += Number(r.spend || 0); byPf[pf].imp += Number(r.impressions || 0);
    byPf[pf].clk += Number(r.clicks || 0); byPf[pf].lead += Number(r.leads || 0);
    tSpend += Number(r.spend || 0); tImp += Number(r.impressions || 0);
    tClk += Number(r.clicks || 0); tLead += Number(r.leads || 0);
  }
  if (!rows || rows.length === 0) return 'PERFORMA ADS (bulan ini): belum ada data ads yang diinput bulan ini.';
  const lines = Object.entries(byPf).map(([pf, s]) => {
    const cpl = s.lead > 0 ? Math.round(s.spend / s.lead) : null;
    const ctr = s.imp > 0 ? ((s.clk / s.imp) * 100).toFixed(2) : '0';
    return `  · ${pf}: spend ${rp(s.spend)}, impresi ${s.imp.toLocaleString('id-ID')}, klik ${s.clk.toLocaleString('id-ID')} (CTR ${ctr}%), leads ${s.lead}${cpl != null ? `, CPL ${rp(cpl)}` : ''}`;
  });
  const cplAll = tLead > 0 ? Math.round(tSpend / tLead) : null;
  return `PERFORMA ADS (bulan ini, MTD):
- Total spend: ${rp(tSpend)}, total leads dari ads: ${tLead}${cplAll != null ? `, CPL rata-rata ${rp(cplAll)}` : ''}
- Total impresi ${tImp.toLocaleString('id-ID')}, klik ${tClk.toLocaleString('id-ID')}
Per platform:
${lines.join('\n')}`;
}

function systemPrompt(ctx) {
  return `Kamu adalah "Asisten Manager AI" untuk perusahaan travel (umroh, hajj, tur Eropa). Kamu partner diskusi bagi Manager & tim: bahas apa saja seputar DATA PERUSAHAAN dan MARKETING — performa ads (spend, CPL, CTR, ROAS), leads, closing, conversion, omzet, piutang, okupansi seat, dan tren.

Prinsip:
- Selalu berbasis ANGKA di data di bawah. Jangan mengarang data yang tidak diberikan; kalau kurang, katakan terus terang dan sebut data apa yang perlu dilihat.
- Bahasa Indonesia, langsung, ringkas, actionable seperti manajer berpengalaman. Hindari basa-basi.
- Fokus keputusan marketing & pertumbuhan: alokasi budget ads antar platform, efisiensi akuisisi (CPL/CAC vs nilai pax), kanal mana yang paling menghasilkan closing, trip mana yang perlu digenjot, dan bagaimana omzet/pipeline ke depan.
- KESADARAN WAKTU (WAJIB): bulan berjalan sering BELUM penuh. Jangan menyimpulkan "anjlok" hanya karena total MTD lebih kecil dari bulan lalu yang sudah penuh. Bandingkan periode-yang-sama (MTD vs hari 1-X bulan lalu) dan lihat proyeksi run-rate.
- Kalau ditanya di luar data yang ada (mis. detail kampanye spesifik yang tak tercatat), jawab sejujurnya dan sarankan data yang perlu diinput.

=== DATA PERUSAHAAN & MARKETING TERKINI ===
${ctx}
=== AKHIR DATA ===`;
}

async function callClaude({ system, messages, maxTokens, feature }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY belum di-set di Vercel env vars' };
  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens || 1500, system, messages }),
    });
    if (!res.ok) { const t = await res.text(); return { error: `Claude API error (${res.status}): ${t.slice(0, 200)}` }; }
    const json = await res.json();
    try { await logClaudeUsage({ feature: feature || 'manager-ai', model: CLAUDE_MODEL, usage: json.usage }); } catch {}
    return { ok: true, text: (json?.content?.[0]?.text || '').trim() };
  } catch (e) { return { error: e?.message || 'Gagal memanggil AI' }; }
}

async function fullContext() {
  const [m, adsCtx] = await Promise.all([buildCeoMetrics(), buildAdsContext()]);
  return `${metricsToContext(m)}\n\n${adsCtx}`;
}

// Chat diskusi. history: [{role:'user'|'assistant', content}]
export async function askManagerAI(question, history) {
  if (!(await assertManager())) return { error: 'Akses khusus tim internal (owner/manager/ops/accounting/cs).' };
  const q = String(question || '').trim();
  if (!q) return { error: 'Pertanyaan kosong.' };
  const ctx = await fullContext();
  const hist = Array.isArray(history) ? history.slice(-10) : [];
  const messages = [
    ...hist.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content).map((h) => ({ role: h.role, content: String(h.content).slice(0, 4000) })),
    { role: 'user', content: q },
  ];
  const r = await callClaude({ system: systemPrompt(ctx), feature: 'manager-chat', maxTokens: 1500, messages });
  return r.ok ? { ok: true, text: r.text } : r;
}
