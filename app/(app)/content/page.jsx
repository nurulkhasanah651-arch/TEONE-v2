// Konten Manager — kalender konten per trip/campaign + performa Instagram
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import ContentClient from '@/components/content/ContentClient';

export default async function ContentPage() {
  const supabase = createClient();

  const [{ data: posts }, { data: trips }, { data: igCache }, { data: ads }] = await Promise.all([
    supabase.from('content_posts').select('*').order('scheduled_date', { ascending: true, nullsFirst: false }),
    supabase.from('trips').select('id, kode_trip, name, departure, status').order('departure', { ascending: true, nullsFirst: false }),
    supabase.from('ig_cache').select('data, fetched_at').eq('key', 'overview').maybeSingle(),
    supabase.from('ads_entries').select('campaign_name, trip_id, spend, impressions, clicks, leads').order('date', { ascending: false }).limit(500),
  ]);

  // Ringkas performa ads per campaign (untuk link konten ↔ campaign)
  const campaignStats = {};
  for (const a of (ads || [])) {
    const key = a.campaign_name || '(tanpa nama campaign)';
    if (!campaignStats[key]) campaignStats[key] = { spend: 0, impressions: 0, clicks: 0, leads: 0, trip_id: a.trip_id };
    campaignStats[key].spend += Number(a.spend || 0);
    campaignStats[key].impressions += Number(a.impressions || 0);
    campaignStats[key].clicks += Number(a.clicks || 0);
    campaignStats[key].leads += Number(a.leads || 0);
  }

  const activeTrips = (trips || []).filter((t) => t.status !== 'completed' && t.status !== 'cancelled');

  return (
    <ContentClient
      posts={posts || []}
      trips={activeTrips}
      ig={igCache?.data || null}
      igFetchedAt={igCache?.fetched_at || null}
      igConnected={Boolean(igCache?.data)}
      campaignStats={campaignStats}
    />
  );
}
