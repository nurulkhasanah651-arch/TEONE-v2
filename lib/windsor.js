// Windsor.ai REST client — tarik data Meta Ads & Instagram untuk diisi ke web app.
// Butuh env WINDSOR_API_KEY.
// Pemetaan akun → brand:
//   travelingeropa (Meta 232728765331319 / IG 17841402156713353) → teone
//   khasanahtravel (Meta KHASANAH-AD 1163990175175427 / IG 17841400206423625) → khasanah

const BASE = 'https://connectors.windsor.ai';

export const WINDSOR_BRANDS = {
  teone: { meta_account: '232728765331319', ig_account: '17841402156713353' },
  khasanah: { meta_account: '1163990175175427', ig_account: '17841400206423625' },
};

// Akun Meta yang menampung iklan kedua brand (KHASANAH-AD + travelingeropa).
// Routing per CAMPAIGN: nama diawali "TE" -> teone, selain itu -> khasanah.
export const META_AD_ACCOUNTS = ['1163990175175427', '232728765331319'];

export function brandForCampaign(name) {
  return /^te[\s\-]/i.test(String(name || '').trim()) ? 'teone' : 'khasanah';
}

async function windsorFetch(connector, { fields, date_preset = 'last_30d', extra = {} }) {
  const key = process.env.WINDSOR_API_KEY;
  if (!key) throw new Error('WINDSOR_API_KEY belum di-set di Vercel env vars');
  const params = new URLSearchParams({
    api_key: key,
    date_preset,
    fields: Array.isArray(fields) ? fields.join(',') : fields,
    _renderer: 'json',
  });
  for (const [k, v] of Object.entries(extra || {})) {
    if (k.startsWith('__')) continue;
    params.set(k, v);
  }
  const url = `${BASE}/${connector}?${params.toString()}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (extra && extra.__timeout_ms) || 18000);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Windsor ${connector} HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json().catch(() => ({}));
  return Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
}

const num = (v) => Number(v || 0) || 0;

// --- Meta Ads: tarik beberapa akun sekaligus (tanpa filter brand) ---
export async function fetchMetaAdsAll(accountIds, datePreset = 'last_7d') {
  const fields = [
    'account_id', 'account_name', 'campaign', 'date',
    'spend', 'impressions', 'clicks', 'link_clicks', 'reach',
    'actions_lead', 'actions_onsite_conversion_messaging_conversation_started_7d',
  ];
  const rows = await windsorFetch('facebook', { fields, date_preset: datePreset });
  const wanted = new Set((accountIds || []).map(String));
  return rows
    .filter((r) => wanted.size === 0 || wanted.has(String(r.account_id)))
    .map((r) => {
      const formLeads = num(r.actions_lead);
      const waConv = num(r.actions_onsite_conversion_messaging_conversation_started_7d);
      return {
        date: (r.date || '').slice(0, 10),
        campaign_name: r.campaign || '(tanpa campaign)',
        spend: Math.round(num(r.spend)),
        impressions: Math.round(num(r.impressions)),
        clicks: Math.round(num(r.link_clicks) || num(r.clicks)),
        leads: Math.round(formLeads + waConv),
      };
    })
    .filter((r) => r.date);
}

// ─── Meta Ads: baris harian per campaign ───
export async function fetchMetaAds(accountId, datePreset = 'last_7d') {
  const fields = [
    'account_id', 'account_name', 'campaign', 'date',
    'spend', 'impressions', 'clicks', 'link_clicks', 'reach',
    'actions_lead', 'actions_onsite_conversion_messaging_conversation_started_7d',
  ];
  const rows = await windsorFetch('facebook', { fields, date_preset: datePreset });
  return rows
    .filter((r) => String(r.account_id) === String(accountId))
    .map((r) => {
      const formLeads = num(r.actions_lead);
      const waConv = num(r.actions_onsite_conversion_messaging_conversation_started_7d);
      return {
        date: (r.date || '').slice(0, 10),
        campaign_name: r.campaign || '(tanpa campaign)',
        spend: Math.round(num(r.spend)),
        impressions: Math.round(num(r.impressions)),
        clicks: Math.round(num(r.link_clicks) || num(r.clicks)),
        leads: Math.round(formLeads + waConv), // lead form + percakapan WA
      };
    })
    .filter((r) => r.date);
}

// ─── Instagram: profil + reach 30h + media terbaru → bentuk ig_cache.data ───
export async function fetchInstagramOverview(accountId, datePreset = 'last_7d') {
  // Jalankan 3 query IG paralel biar cepat (muat di batas waktu cron)
  const [profileRows, reachRows, mediaRows] = await Promise.all([
    windsorFetch('instagram', {
      fields: ['account_id', 'username', 'followers_count', 'follows_count', 'media_count'],
      date_preset: 'last_2d',
    }).catch(() => []),
    windsorFetch('instagram', {
      fields: ['account_id', 'date', 'reach'],
      date_preset: datePreset,
    }).catch(() => []),
    windsorFetch('instagram', {
      fields: [
        'account_id', 'media_id', 'media_caption', 'media_type', 'media_permalink',
        'timestamp', 'media_like_count', 'media_comments_count', 'media_reach', 'media_saved',
      ],
      date_preset: datePreset,
    }).catch(() => []),
  ]);

  const prof = profileRows.find((r) => String(r.account_id) === String(accountId)) || {};

  let reach30 = reachRows
    .filter((r) => String(r.account_id) === String(accountId))
    .reduce((s, r) => s + num(r.reach), 0);

  let media = [];
  {
    media = mediaRows
      .filter((r) => String(r.account_id) === String(accountId) && r.media_id)
      .map((r) => ({
        id: r.media_id,
        caption: r.media_caption || '',
        media_type: r.media_type || 'IMAGE',
        permalink: r.media_permalink || '',
        timestamp: r.timestamp || r.date || null,
        like_count: num(r.media_like_count),
        comments_count: num(r.media_comments_count),
        reach: r.media_reach != null ? num(r.media_reach) : null,
        saved: r.media_saved != null ? num(r.media_saved) : null,
      }))
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
      .slice(0, 24);
  }

  return {
    profile: {
      username: prof.username || '',
      followers: num(prof.followers_count),
      follows: num(prof.follows_count),
      media_count: num(prof.media_count),
      picture: null,
    },
    reach30,
    media,
  };
}

// --- Iklan AKTIF: per-ad creative + performa (status ACTIVE) ---
export async function fetchActiveAds(accountIds, datePreset = 'last_2d') {
  const fields = [
    'account_id', 'campaign', 'ad_id', 'ad_name', 'effective_status',
    'thumbnail_url', 'image_url', 'instagram_permalink_url', 'facebook_permalink_url',
    'spend', 'impressions', 'clicks', 'link_clicks',
    'actions_lead', 'actions_onsite_conversion_messaging_conversation_started_7d',
  ];
  const rows = await windsorFetch('facebook', { fields, date_preset: datePreset, extra: { __timeout_ms: 25000 } });
  const wanted = new Set((accountIds || []).map(String));
  // agregasi per ad_id (jumlahkan metrik beberapa hari)
  const byAd = {};
  for (const r of rows) {
    if (wanted.size && !wanted.has(String(r.account_id))) continue;
    const status = String(r.effective_status || '').toUpperCase();
    if (status && status !== 'ACTIVE') continue;
    const id = r.ad_id || r.ad_name;
    if (!id) continue;
    if (!byAd[id]) {
      byAd[id] = {
        ad_id: String(id), ad_name: r.ad_name || '(tanpa nama)',
        campaign_name: r.campaign || '', status: 'ACTIVE',
        image_url: r.image_url || r.thumbnail_url || null,
        thumbnail_url: r.thumbnail_url || r.image_url || null,
        permalink: r.instagram_permalink_url || r.facebook_permalink_url || null,
        spend: 0, impressions: 0, clicks: 0, leads: 0,
      };
    }
    const a = byAd[id];
    a.spend += num(r.spend);
    a.impressions += num(r.impressions);
    a.clicks += num(r.link_clicks) || num(r.clicks);
    a.leads += num(r.actions_lead) + num(r.actions_onsite_conversion_messaging_conversation_started_7d);
    if (!a.image_url && (r.image_url || r.thumbnail_url)) { a.image_url = r.image_url || r.thumbnail_url; a.thumbnail_url = r.thumbnail_url || r.image_url; }
    if (!a.permalink && (r.instagram_permalink_url || r.facebook_permalink_url)) a.permalink = r.instagram_permalink_url || r.facebook_permalink_url;
  }
  return Object.values(byAd).map((a) => ({
    ...a,
    spend: Math.round(a.spend), impressions: Math.round(a.impressions),
    clicks: Math.round(a.clicks), leads: Math.round(a.leads),
    ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
  }));
}
