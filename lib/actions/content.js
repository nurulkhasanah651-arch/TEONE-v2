'use server';

// Konten Manager — kalender konten per trip/campaign + integrasi Instagram Graph API
// Token IG disimpan di app_secrets (hanya bisa dibaca service role)

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-5';
const GRAPH = 'https://graph.facebook.com/v21.0';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

function intOrNull(v) {
  if (v === null || v === undefined || `${v}`.trim() === '') return null;
  const n = parseInt(`${v}`.replace(/[^0-9-]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

// ═══════════════ KALENDER KONTEN ═══════════════

export async function createContentPost(formData) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };

  const row = {
    title: (formData.get('title') || '').trim(),
    caption: (formData.get('caption') || '').trim() || null,
    content_type: formData.get('content_type') || 'feed',
    scheduled_date: formData.get('scheduled_date') || null,
    status: formData.get('status') || 'draft',
    trip_id: (formData.get('trip_id') || '').trim() || null,
    campaign_name: (formData.get('campaign_name') || '').trim() || null,
    assignee: (formData.get('assignee') || '').trim() || null,
    ig_permalink: (formData.get('ig_permalink') || '').trim() || null,
    notes: (formData.get('notes') || '').trim() || null,
    posted_date: formData.get('posted_date') || null,
    ig_likes: intOrNull(formData.get('ig_likes')),
    ig_comments: intOrNull(formData.get('ig_comments')),
    ig_reach: intOrNull(formData.get('ig_reach')),
    ig_saved: intOrNull(formData.get('ig_saved')),
    posting_time: formData.get('posting_time') || null,
    deadline: formData.get('deadline') || null,
    progress: formData.get('progress') || 'brief',
    platform: (formData.get('platform') || '').trim() || null,
    content_pillar: (formData.get('content_pillar') || '').trim() || null,
    objective: (formData.get('objective') || '').trim() || null,
    brief: (formData.get('brief') || '').trim() || null,
    kode_trip: (formData.get('kode_trip') || '').trim() || null,
    link_draft: (formData.get('link_draft') || '').trim() || null,
    link_trello: (formData.get('link_trello') || '').trim() || null,
    boost_ads: formData.get('boost_ads') === '1' || formData.get('boost_ads') === 'on',
    brand_tag: (formData.get('brand_tag') || '').trim() || null,
    created_by: user.user_metadata?.name || user.email || 'unknown',
  };
  if (!row.title) return { error: 'Judul konten wajib diisi' };

  const { error } = await supabase.from('content_posts').insert(row);
  if (error) return { error: error.message };
  revalidatePath('/content');
  return { ok: true };
}

export async function updateContentPost(id, formData) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };

  const updates = {};
  for (const f of ['title','caption','content_type','scheduled_date','status','trip_id','campaign_name','assignee','ig_permalink','notes','posted_date','posting_time','deadline','progress','platform','content_pillar','objective','brief','kode_trip','link_draft','link_trello','brand_tag']) {
    if (formData.has(f)) {
      const v = (formData.get(f) || '').toString().trim();
      updates[f] = v || null;
    }
  }
  for (const f of ['ig_likes','ig_comments','ig_reach','ig_saved']) {
    if (formData.has(f)) updates[f] = intOrNull(formData.get(f));
  }
  if (formData.has('boost_ads')) updates.boost_ads = formData.get('boost_ads') === '1' || formData.get('boost_ads') === 'on';
  if (updates.title === null) return { error: 'Judul konten wajib diisi' };

  const { error } = await supabase.from('content_posts').update(updates).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/content');
  return { ok: true };
}

export async function deleteContentPost(id) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase.from('content_posts').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/content');
  return { ok: true };
}

// Tautkan post IG (dari cache media) ke rencana konten
export async function linkIgMedia(id, igMediaId, igPermalink) {
  const { supabase, user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase.from('content_posts')
    .update({ ig_media_id: igMediaId || null, ig_permalink: igPermalink || null, status: igMediaId ? 'posted' : undefined })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/content');
  return { ok: true };
}

// ═══════════════ AI CAPTION ═══════════════

export async function generateCaption(input) {
  const { user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY belum di-set di Vercel env vars' };

  const { brand = 'khasanah', tripName = '', destination = '', departure = '', price = '', contentType = 'feed', extra = '' } = input || {};

  const brandVoice = brand === 'khasanah'
    ? 'Khasanah Travel (umroh & hajj) — gaya hangat, religius, menyentuh hati, sapaan Islami, ajak jamaah beribadah dengan nyaman'
    : 'TravelingEropa (tur Eropa & internasional) — gaya fun, aspiratif, FOMO halus, banyak detail destinasi';

  const prompt = `Kamu social media specialist untuk ${brandVoice}.
Buat konten Instagram ${contentType.toUpperCase()} untuk promosi trip berikut:

Trip: ${tripName || '(umum, bukan trip spesifik)'}
Destinasi: ${destination || '-'}
Keberangkatan: ${departure || '-'}
Harga: ${price || '(jangan sebut harga)'}
Catatan tambahan: ${extra || '-'}

Output JSON valid (tanpa markdown, tanpa teks lain):
{
  "hook": "kalimat pembuka scroll-stopper max 60 karakter",
  "caption": "caption lengkap 3-5 paragraf pendek, ada CTA ke link bio/WA, emoji secukupnya",
  "hashtags": "string 15-20 hashtag relevan dipisah spasi",
  "ide_visual": ["3 ide visual/scene untuk konten ini"]
}`;

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { error: `Claude API error (${res.status}): ${errText.slice(0, 200)}` };
    }
    const json = await res.json();
    try { await logClaudeUsage({ feature: 'caption', model: CLAUDE_MODEL, usage: json.usage }); } catch {}
    const text = (json?.content?.[0]?.text || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: 'Respons AI tidak berformat JSON' };
    return { ok: true, result: JSON.parse(match[0]) };
  } catch (e) {
    return { error: e?.message || 'Gagal generate caption' };
  }
}

// ═══════════════ KONEKSI INSTAGRAM ═══════════════

export async function saveIgConnection(formData) {
  const { user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };
  const role = user.app_metadata?.role || user.user_metadata?.role;
  if (!['owner', 'accounting', 'manager'].includes(role)) {
    return { error: 'Hanya owner/manager yang boleh mengubah koneksi IG' };
  }

  const token = (formData.get('token') || '').trim();
  if (!token) return { error: 'Access token wajib diisi' };

  // Verifikasi token → cari IG business account
  let igUserId = (formData.get('ig_user_id') || '').trim();
  let username = '';
  try {
    if (!igUserId) {
      const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=name,instagram_business_account&access_token=${encodeURIComponent(token)}`);
      const pages = await pagesRes.json();
      if (pages.error) return { error: `Meta API: ${pages.error.message}` };
      const withIg = (pages.data || []).find((p) => p.instagram_business_account?.id);
      if (!withIg) return { error: 'Tidak ada Instagram Business Account yang tertaut ke Facebook Page di token ini. Pastikan IG sudah Business & tertaut ke Page.' };
      igUserId = withIg.instagram_business_account.id;
    }
    const igRes = await fetch(`${GRAPH}/${igUserId}?fields=username,followers_count&access_token=${encodeURIComponent(token)}`);
    const ig = await igRes.json();
    if (ig.error) return { error: `Meta API: ${ig.error.message}` };
    username = ig.username || '';
  } catch (e) {
    return { error: `Gagal verifikasi token: ${e?.message}` };
  }

  const svc = getServiceClient();
  if (!svc) return { error: 'SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel' };
  const rows = [
    { key: 'ig_access_token', value: token, updated_at: new Date().toISOString() },
    { key: 'ig_user_id', value: igUserId, updated_at: new Date().toISOString() },
    { key: 'ig_username', value: username, updated_at: new Date().toISOString() },
  ];
  const { error } = await svc.from('app_secrets').upsert(rows, { onConflict: 'key' });
  if (error) return { error: error.message };

  await refreshIgData(true);
  revalidatePath('/content');
  return { ok: true, username };
}

async function getIgCreds(svc) {
  const { data } = await svc.from('app_secrets').select('key, value').in('key', ['ig_access_token', 'ig_user_id', 'ig_username']);
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return { token: map.ig_access_token, igUserId: map.ig_user_id, username: map.ig_username };
}

export async function refreshIgData(force = false) {
  const { user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };

  const svc = getServiceClient();
  if (!svc) return { error: 'SUPABASE_SERVICE_ROLE_KEY belum di-set' };

  const { token, igUserId, username } = await getIgCreds(svc);
  if (!token || !igUserId) return { error: 'not_connected' };

  // Cache 1 jam kecuali force
  if (!force) {
    const { data: cached } = await svc.from('ig_cache').select('fetched_at').eq('key', 'overview').maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 3600_000) {
      return { ok: true, cached: true };
    }
  }

  try {
    // 1) Profil
    const profRes = await fetch(`${GRAPH}/${igUserId}?fields=username,followers_count,follows_count,media_count,profile_picture_url&access_token=${encodeURIComponent(token)}`);
    const prof = await profRes.json();
    if (prof.error) return { error: `Meta API: ${prof.error.message}` };

    // 2) Reach 30 hari (defensif — metrik bisa beda antar akun)
    let reach30 = null;
    try {
      const insRes = await fetch(`${GRAPH}/${igUserId}/insights?metric=reach&period=days_28&access_token=${encodeURIComponent(token)}`);
      const ins = await insRes.json();
      reach30 = ins?.data?.[0]?.values?.slice(-1)?.[0]?.value ?? null;
    } catch {}

    // 3) Media terbaru + metrik dasar
    const mediaRes = await fetch(`${GRAPH}/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=24&access_token=${encodeURIComponent(token)}`);
    const media = await mediaRes.json();
    if (media.error) return { error: `Meta API: ${media.error.message}` };
    const items = media.data || [];

    // 4) Insights per media (reach + saved) — best effort
    await Promise.all(items.map(async (m) => {
      try {
        const metric = m.media_type === 'VIDEO' ? 'reach,saved,plays' : 'reach,saved';
        const r = await fetch(`${GRAPH}/${m.id}/insights?metric=${metric}&access_token=${encodeURIComponent(token)}`);
        const j = await r.json();
        for (const d of (j.data || [])) {
          m[d.name] = d.values?.[0]?.value ?? null;
        }
      } catch {}
    }));

    const overview = {
      profile: { username: prof.username || username, followers: prof.followers_count, follows: prof.follows_count, media_count: prof.media_count, picture: prof.profile_picture_url || null },
      reach30,
      media: items,
    };
    await svc.from('ig_cache').upsert({ key: 'overview', data: overview, fetched_at: new Date().toISOString() }, { onConflict: 'key' });
    revalidatePath('/content');
    return { ok: true };
  } catch (e) {
    return { error: e?.message || 'Gagal mengambil data Instagram' };
  }
}

export async function disconnectIg() {
  const { user } = await requireUser();
  if (!user) return { error: 'Not authenticated' };
  const role = user.app_metadata?.role || user.user_metadata?.role;
  if (!['owner', 'accounting', 'manager'].includes(role)) return { error: 'Hanya owner/manager' };
  const svc = getServiceClient();
  if (!svc) return { error: 'Service key belum di-set' };
  await svc.from('app_secrets').delete().in('key', ['ig_access_token', 'ig_user_id', 'ig_username']);
  await svc.from('ig_cache').delete().eq('key', 'overview');
  revalidatePath('/content');
  return { ok: true };
}
