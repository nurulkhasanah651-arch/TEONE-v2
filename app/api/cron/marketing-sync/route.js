// Vercel Cron: sinkron data marketing dari Windsor.ai ke web app.
//   - Meta Ads → ads_entries (Ads Manager) — routing per CAMPAIGN (awalan "TE" → teone)
//   - Instagram → ig_cache (Performa IG) — per akun brand
// teone = travelingeropa (teone.dev), khasanah = khasanahtravel (khasanahtravel.app)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  WINDSOR_BRANDS, META_AD_ACCOUNTS, brandForCampaign,
  fetchMetaAdsAll, fetchInstagramOverview,
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
  // Hapus SEMUA baris windsor-sync brand ini dulu (bersihkan yg pindah brand / stale), lalu isi ulang
  await c.db.from('ads_entries').delete().eq('created_by', 'windsor-sync');
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    date: r.date, platform: 'meta', campaign_name: r.campaign_name,
    spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads,
    notes: 'Auto-sync Windsor', created_by: 'windsor-sync', brand_id: c.brand_id,
  }));
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await c.db.from('ads_entries').insert(payload.slice(i, i + 200));
    if (error) { errors.push(`${brand} ads insert: ${error.message}`); break; }
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
  const ok = !cronSecret || provided === cronSecret || (windsorKey && provided === windsorKey);
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const onlyBrand = url.searchParams.get('brand'); // 'teone' | 'khasanah'
  const only = url.searchParams.get('only');       // 'ads' | 'ig'
  const errors = [];
  const out = { teone: { ads_rows: 0, ig_media: 0 }, khasanah: { ads_rows: 0, ig_media: 0 } };

  // ── ADS: tarik sekali, partisi per campaign, tulis ke tiap brand ──
  if (!only || only === 'ads') {
    try {
      const all = await fetchMetaAdsAll(META_AD_ACCOUNTS, 'last_7d');
      const part = { teone: [], khasanah: [] };
      for (const r of all) part[brandForCampaign(r.campaign_name)].push(r);
      for (const brand of ['teone', 'khasanah']) {
        if (onlyBrand && brand !== onlyBrand) continue;
        out[brand].ads_rows = await writeAds(brand, part[brand], errors);
      }
    } catch (e) { errors.push('meta: ' + (e?.message || 'err')); }
  }

  // ── IG: per brand (paralel) ──
  if (!only || only === 'ig') {
    await Promise.all(Object.entries(WINDSOR_BRANDS).map(async ([brand, cfg]) => {
      if (onlyBrand && brand !== onlyBrand) return;
      try { out[brand].ig_media = await syncIg(brand, cfg, errors); }
      catch (e) { errors.push(`${brand} ig: ${e?.message || 'err'}`); }
    }));
  }

  return NextResponse.json({ ok: true, synced_at: new Date().toISOString(), results: out, errors });
}
