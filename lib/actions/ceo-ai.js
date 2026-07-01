'use server';
// CEO AI — Business Analyst + Advisor. Analisa kondisi perusahaan + chat diskusi.
// Owner-only. Grounded pada metrik real (buildCeoMetrics), brand-aware.
import { createClient } from '@/lib/supabase/server';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import { buildCeoMetrics, metricsToContext } from '@/lib/actions/ceo-metrics';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-opus-4-7';

async function assertOwner() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return false;
  const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  return u?.role === 'owner';
}

function systemPrompt(ctx) {
  return `Kamu adalah "CEO AI" — gabungan Business Analyst + Business Advisor senior untuk perusahaan travel (umroh, hajj, dan tur Eropa). Kamu berbicara langsung ke Owner/CEO.

Tugasmu: membaca data & performa perusahaan, lalu memberi:
1) Analisa kondisi perusahaan yang jujur (apa yang sehat, apa yang mengkhawatirkan).
2) Arahan strategis yang konkret dan bisa langsung dieksekusi.
3) Cara memaksimalkan potensi ke depan (peluang pertumbuhan, efisiensi, risiko yang harus dijaga).

Prinsip:
- Selalu berbasis ANGKA yang ada di data di bawah. Jangan mengarang data yang tidak diberikan. Kalau data kurang untuk sebuah kesimpulan, katakan terus terang dan sebut data apa yang perlu dilihat.
- Bahasa Indonesia, langsung, ringkas, tegas seperti advisor berpengalaman. Hindari basa-basi.
- Prioritaskan yang paling berdampak (uang & risiko dulu). Beri rekomendasi yang spesifik (angka target, tindakan, siapa yang eksekusi).
- Ingat karakter bisnis travel: cashflow tergantung termin pembayaran peserta, ada piutang, ada musim (high/low season umroh), okupansi seat menentukan margin, biaya ads vs conversion menentukan efisiensi akuisisi.
- KESADARAN WAKTU (WAJIB): perhatikan konteks waktu di data. Bulan berjalan sering BELUM penuh. JANGAN pernah menyimpulkan "anjlok/turun drastis" hanya karena total bulan berjalan (MTD parsial) lebih kecil dari bulan lalu yang sudah penuh — itu kesalahan analisa. Untuk menilai tren, bandingkan periode-yang-sama (MTD vs hari 1-X bulan lalu) dan lihat proyeksi run-rate yang disediakan. Kalau bulan baru berjalan sedikit hari, katakan datanya belum cukup untuk kesimpulan tren dan fokus ke pipeline/booking ke depan.

=== DATA & PERFORMA TERKINI ===
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
    if (!res.ok) {
      const t = await res.text();
      return { error: `Claude API error (${res.status}): ${t.slice(0, 200)}` };
    }
    const json = await res.json();
    try { await logClaudeUsage({ feature: feature || 'ceo-ai', model: CLAUDE_MODEL, usage: json.usage }); } catch {}
    const text = (json?.content?.[0]?.text || '').trim();
    return { ok: true, text };
  } catch (e) {
    return { error: e?.message || 'Gagal memanggil AI' };
  }
}

// Briefing advisor otomatis (dipanggil saat panel dibuka / tombol refresh).
export async function getCeoAdvisorAnalysis() {
  if (!(await assertOwner())) return { error: 'Akses khusus owner.' };
  const m = await buildCeoMetrics();
  const ctx = metricsToContext(m);
  const r = await callClaude({
    system: systemPrompt(ctx),
    feature: 'ceo-advisor',
    maxTokens: 1600,
    messages: [{
      role: 'user',
      content: `Bertindaklah sebagai Business Analyst + Business Advisor saya. Tanpa saya minta, analisa situasi perusahaan dari data di atas lalu beri briefing eksekutif untuk saya (Owner). Susun dalam 4 bagian dengan judul tebal yang jelas:

**1. Kondisi Perusahaan** — potret sehat/tidaknya sekarang (2-4 poin, selalu sebut angka: omzet, closing, conversion, piutang, okupansi).
**2. Perhatian & Risiko** — hal yang harus segera ditindak beserta dampaknya (2-4 poin).
**3. Arahan Memaksimalkan Potensi** — langkah konkret mengoptimalkan yang SUDAH ada (naikkan conversion, isi seat kosong, kelola cashflow/piutang, upsell/naikkan nilai per pax) — 3-5 rekomendasi dengan target angka.
**4. Peluang Ekspansi & Pertumbuhan** — masukan strategis untuk tumbuh: destinasi/paket baru, segmen pasar baru, penambahan kapasitas/keberangkatan, kanal akuisisi baru, atau kemitraan — 2-4 ide yang relevan dengan data & karakter bisnis travel ini, sebut asumsi/prasyaratnya.

Bersikap proaktif dan tegas seperti advisor berpengalaman. Semua berbasis angka yang ada; kalau sebuah rekomendasi butuh data tambahan, sebut singkat. Padat, tanpa basa-basi. Total maksimal ~450 kata.`,
    }],
  });
  return r.ok ? { ok: true, text: r.text, generatedAt: new Date().toISOString() } : r;
}

// Chat diskusi dengan CEO AI. history: [{role:'user'|'assistant', content}]
export async function askCeoAI(question, history) {
  if (!(await assertOwner())) return { error: 'Akses khusus owner.' };
  const q = String(question || '').trim();
  if (!q) return { error: 'Pertanyaan kosong.' };
  const m = await buildCeoMetrics();
  const ctx = metricsToContext(m);
  const hist = Array.isArray(history) ? history.slice(-10) : [];
  const messages = [
    ...hist.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content).map((h) => ({ role: h.role, content: String(h.content).slice(0, 4000) })),
    { role: 'user', content: q },
  ];
  const r = await callClaude({ system: systemPrompt(ctx), feature: 'ceo-chat', maxTokens: 1500, messages });
  return r.ok ? { ok: true, text: r.text } : r;
}
