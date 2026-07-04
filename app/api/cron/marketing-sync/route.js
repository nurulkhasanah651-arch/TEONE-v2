// Vercel Cron: sinkron data marketing dari Windsor.ai ke web app.
//   - Meta Ads → ads_entries (Ads Manager) — routing per CAMPAIGN (awalan "TE" → teone)
//   - Instagram → ig_cache (Performa IG) — per akun brand
// teone = travelingeropa (teone.dev), khasanah = khasanahtravel (khasanahtravel.app)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  WINDSOR_BRANDS, META_AD_ACCOUNTS, brandForCampaign,
  fetchMetaAdsAll, fetchInstagramOverview, fetchActiveAds, extractTripCode,
} from '@/lib/windsor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function brandDb(brand) {
  if (brand === 'khasanah') {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY,
      brand_id: 2,
    };
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    brand_id: 1,
  };
}
function dbClient(brand) {
  const { url, key, brand_id } = brandDb(brand);
  if (!url || !key) return null;
  return { db: createClient(url, key, { auth: { persistSession: false } }), brand_id };
}

// Tulis ads untuk satu brand (rows sudah dipartisi)
async function writeAds(brand, rows, errors) {
  const c = dbClient(brand);
  if (!c) { errors.push(`${brand}: supabase env kurang`); return 0; }
  // AKUMULASI HISTORI: kalau tak ada data, JANGAN hapus apa pun (histori aman).
  if (!rows.length) return 0;
  // Map kode_trip -> trip.id + override manual campaign->trip (biar per-trip auto ke-link)
  const kodeToId = {};
  try {
    const { data: trips } = await c.db.from('trips').select('id, kode_trip');
    for (const t of (trips || [])) if (t.kode_trip) kodeToId[String(t.kode_trip).toUpperCase()] = t.id;
  } catch {}
  const overrideKeys = new Set(); const override = {};
  try {
    const { data: maps } = await c.db.from('ad_campaign_map').select('campaign_name, trip_id').eq('brand_id', c.brand_id);
    for (const m of (maps || [])) { overrideKeys.add(m.campaign_name); override[m.campaign_name] = m.trip_id; }
  } catch {}
  const tripFor = (campaign) => {
    if (overrideKeys.has(campaign)) return override[campaign] || null; // override menang (null = sengaja tanpa trip)
    const code = extractTripCode(campaign);
    return code ? (kodeToId[code] || null) : null;
  };
  // Refresh HANYA tanggal yang ada di data tarikan ini (mis. 7 hari terakhir).
  // Tanggal lebih lama TIDAK disentuh -> spend histori tetap tersimpan & menumpuk lintas campaign.
  const syncDates = [...new Set(rows.map((r) => r.date).filter(Boolean))];
  if (syncDates.length) {
    await c.db.from('ads_entries').delete().eq('created_by', 'windsor-sync').in('date', syncDates);
  }
  const payload = rows.map((r) => ({
    date: r.date, platform: 'meta', campaign_name: r.campaign_name,
    spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads,
    trip_id: tripFor(r.campaign_name),
    notes: 'Auto-sync Windsor', created_by: 'windsor-sync', brand_id: c.brand_id,
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await c.db.from('ads_entries').insert(payload.slice(i, i + 200));
    if (error) { errors.push(`${brand} ads insert: ${error.message}`); break; }
  }
  return payload.length;
}

async function writeActiveAds(brand, rows, errors) {
  const c = dbClient(brand);
  if (!c) { errors.push(`${brand}: supabase env kurang`); return 0; }
  await c.db.from('active_ads').delete().eq('source', 'windsor-sync');
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    brand_id: c.brand_id, ad_id: r.ad_id, ad_name: r.ad_name, campaign_name: r.campaign_name,
    status: r.status, image_url: r.image_url, thumbnail_url: r.thumbnail_url, permalink: r.permalink,
    spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads, ctr: r.ctr,
    source: 'windsor-sync', fetched_at: new Date().toISOString(),
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await c.db.from('active_ads').insert(payload.slice(i, i + 200));
    if (error) { errors.push(`${brand} active_ads: ${error.message}`); break; }
  }
  return payload.length;
}

async function syncIg(brand, cfg, errors) {
  const c = dbClient(brand);
  if (!c) { errors.push(`${brand}: supabase env kurang`); return 0; }
  const overview = await fetchInstagramOverview(cfg.ig_account, 'last_7d');
  await c.db.from('ig_cache').upsert(
    { key: 'overview', data: overview, fetched_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  return overview.media?.length || 0;
}

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const url = new URL(request.url);
  const provided = url.searchParams.get('secret') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const cronSecret = process.env.CRON_SECRET;
  const windsorKey = process.env.WINDSOR_API_KEY;
  let ok = (!!cronSecret && provided === cronSecret) || (!!windsorKey && provided === windsorKey);
  if (!ok) {
    // Izinkan owner yang sedang login untuk memicu sync manual dari browser.
    try {
      const sb = createServerClient();
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: u } = await sb.from('users').select('role').eq('id', user.id).maybeSingle();
        if (u?.role === 'owner') ok = true;
      }
    } catch {}
  }
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const onlyBrand = url.searchParams.get('brand'); // 'teone' | 'khasanah'
  const only = url.searchParams.get('only');       // 'ads' | 'ig'
  const _rangeReq = url.searchParams.get('range'); // opsional: last_7d|last_14d|last_30d|last_90d (seed histori)
  const adsRange = ['last_7d','last_14d','last_30d','last_90d'].includes(_rangeReq) ? _rangeReq : 'last_7d';
  const errors = [];
  const out = { teone: { ads_rows: 0, active_ads: 0, ig_media: 0 }, khasanah: { ads_rows: 0, active_ads: 0, ig_media: 0 } };

  const jobs = [];

  // ── ADS (ads_entries) ──
  if (!only || only === 'ads') jobs.push((async () => {
    try {
      const all = await fetchMetaAdsAll(META_AD_ACCOUNTS, adsRange);
      const part = { teone: [], khasanah: [] };
      for (const r of all) part[brandForCampaign(r.campaign_name)].push(r);
      for (const brand of ['teone', 'khasanah']) {
        if (onlyBrand && brand !== onlyBrand) continue;
        out[brand].ads_rows = await writeAds(brand, part[brand], errors);
      }
    } catch (e) { errors.push('meta: ' + (e?.message || 'err')); }
  })());

  // ── IKLAN AKTIF (active_ads) ── (?only=activeads)
  if (!only || only === 'activeads') jobs.push((async () => {
    try {
      const activeAll = await fetchActiveAds(META_AD_ACCOUNTS, 'last_2d');
      const ap = { teone: [], khasanah: [] };
      for (const a of activeAll) ap[brandForCampaign(a.campaign_name)].push(a);
      for (const brand of ['teone', 'khasanah']) {
        if (onlyBrand && brand !== onlyBrand) continue;
        out[brand].active_ads = await writeActiveAds(brand, ap[brand], errors);
      }
    } catch (e) { errors.push('active_ads: ' + (e?.message || 'err')); }
  })());

  // ── IG: per brand ──
  if (!only || only === 'ig') {
    for (const [brand, cfg] of Object.entries(WINDSOR_BRANDS)) {
      if (onlyBrand && brand !== onlyBrand) continue;
      jobs.push((async () => {
        try { out[brand].ig_media = await syncIg(brand, cfg, errors); }
        catch (e) { errors.push(`${brand} ig: ${e?.message || 'err'}`); }
      })());
    }
  }

  await Promise.all(jobs);

  return NextResponse.json(
    { ok: true, synced_at: new Date().toISOString(), results: out, errors },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
