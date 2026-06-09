// Vercel Cron: sinkron data marketing dari Windsor.ai ke web app.
//   - Meta Ads → ads_entries (Ads Manager)
//   - Instagram → ig_cache (Performa IG di tab Konten)
// Per brand: travelingeropa→teone (teone.dev), khasanahtravel→khasanah (khasanahtravel.app)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WINDSOR_BRANDS, fetchMetaAds, fetchInstagramOverview } from '@/lib/windsor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function brandDb(brand) {
  if (brand === 'khasanah') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY;
    return { url, key, brand_id: 2 };
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    brand_id: 1,
  };
}

async function syncBrand(brand, cfg) {
  const { url, key, brand_id } = brandDb(brand);
  if (!url || !key) return { brand, error: 'Supabase env brand belum lengkap' };
  const db = createClient(url, key, { auth: { persistSession: false } });

  const result = { brand, ads_rows: 0, ig_media: 0, errors: [] };

  // ── Meta Ads → ads_entries ──
  try {
    const ads = await fetchMetaAds(cfg.meta_account, 'last_30d');
    // hapus baris hasil sync sebelumnya (30 hari) agar tidak dobel
    const minDate = ads.reduce((m, r) => (r.date < m ? r.date : m), '9999-12-31');
    await db.from('ads_entries').delete().eq('created_by', 'windsor-sync').gte('date', minDate);
    if (ads.length) {
      const rows = ads.map((r) => ({
        date: r.date, platform: 'meta', campaign_name: r.campaign_name,
        spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads,
        notes: 'Auto-sync Windsor', created_by: 'windsor-sync', brand_id,
      }));
      // insert per batch
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db.from('ads_entries').insert(rows.slice(i, i + 200));
        if (error) { result.errors.push('ads insert: ' + error.message); break; }
      }
      result.ads_rows = rows.length;
    }
  } catch (e) { result.errors.push('meta: ' + (e?.message || 'err')); }

  // ── Instagram → ig_cache ──
  try {
    const overview = await fetchInstagramOverview(cfg.ig_account, 'last_30d');
    await db.from('ig_cache').upsert(
      { key: 'overview', data: overview, fetched_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    result.ig_media = overview.media?.length || 0;
  } catch (e) { result.errors.push('ig: ' + (e?.message || 'err')); }

  return result;
}

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    // izinkan juga pemanggilan manual dengan ?secret= untuk tes
    const url = new URL(request.url);
    if (url.searchParams.get('secret') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results = [];
  for (const [brand, cfg] of Object.entries(WINDSOR_BRANDS)) {
    results.push(await syncBrand(brand, cfg));
  }
  return NextResponse.json({ ok: true, synced_at: new Date().toISOString(), results });
}
