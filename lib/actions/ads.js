'use server';

// Ads Manager — CRUD ads_entries

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createAdsEntry(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const date = formData.get('date') || new Date().toISOString().slice(0, 10);
  const platform = (formData.get('platform') || 'meta').trim();
  const campaign_name = (formData.get('campaign_name') || '').trim() || null;
  const trip_id = (formData.get('trip_id') || '').trim() || null;
  const spend = parseInt(formData.get('spend')) || 0;
  const impressions = parseInt(formData.get('impressions')) || 0;
  const clicks = parseInt(formData.get('clicks')) || 0;
  const leads = parseInt(formData.get('leads')) || 0;
  const notes = (formData.get('notes') || '').trim() || null;

  if (spend < 0 || leads < 0) return { error: 'Spend & leads tidak boleh negatif' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('ads_entries').insert({
    date, platform, campaign_name, trip_id, spend, impressions, clicks, leads, notes, created_by,
  });

  if (error) return { error: error.message };

  revalidatePath('/ads');
  return { ok: true };
}

export async function updateAdsEntry(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const updates = {
    date: formData.get('date') || undefined,
    platform: formData.get('platform') || undefined,
    campaign_name: (formData.get('campaign_name') || '').trim() || null,
    trip_id: (formData.get('trip_id') || '').trim() || null,
    spend: parseInt(formData.get('spend')) || 0,
    impressions: parseInt(formData.get('impressions')) || 0,
    clicks: parseInt(formData.get('clicks')) || 0,
    leads: parseInt(formData.get('leads')) || 0,
    notes: (formData.get('notes') || '').trim() || null,
  };

  const { error } = await supabase.from('ads_entries').update(updates).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/ads');
  return { ok: true };
}

export async function deleteAdsEntry(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('ads_entries').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/ads');
  return { ok: true };
}

// ─── Hubungkan Campaign (Meta) ↔ Trip ───
import { extractTripCode } from '@/lib/windsor';
import { getBrandCode } from '@/lib/brand';

const _ADS_LINK_ROLES = ['owner', 'manager', 'ops', 'accounting'];
async function _assertAdsLink(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null };
  const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  return { user, role: u?.role || null };
}

// Daftar campaign + status link ke trip + daftar trip untuk dropdown.
export async function getCampaignTripMappings() {
  const supabase = createClient();
  const { user, role } = await _assertAdsLink(supabase);
  if (!user) return { error: 'Not authenticated' };
  if (!_ADS_LINK_ROLES.includes(role)) return { error: 'Akses khusus management' };

  const { data: ads } = await supabase.from('ads_entries')
    .select('campaign_name, trip_id, spend, leads, platform')
    .eq('platform', 'meta');
  const byC = {};
  for (const a of (ads || [])) {
    const k = a.campaign_name || '(tanpa nama campaign)';
    if (!byC[k]) byC[k] = { campaign_name: k, spend: 0, leads: 0, rows: 0, trip_id: null };
    byC[k].spend += Number(a.spend) || 0;
    byC[k].leads += Number(a.leads) || 0;
    byC[k].rows += 1;
    if (a.trip_id) byC[k].trip_id = a.trip_id;
  }
  const { data: maps } = await supabase.from('ad_campaign_map').select('campaign_name, trip_id');
  const manual = new Map((maps || []).map((m) => [m.campaign_name, m.trip_id]));

  const { data: trips } = await supabase.from('trips')
    .select('id, kode_trip, name, departure').order('departure', { ascending: false, nullsFirst: false });
  const tripLabel = {}; const kodeToId = {};
  for (const t of (trips || [])) {
    tripLabel[t.id] = `${t.kode_trip || t.id} — ${t.name || ''}`.trim();
    if (t.kode_trip) kodeToId[String(t.kode_trip).toUpperCase()] = t.id;
  }
  const campaigns = Object.values(byC).map((c) => {
    const code = extractTripCode(c.campaign_name);
    const autoTripId = code ? (kodeToId[code] || null) : null;
    const isManual = manual.has(c.campaign_name);
    return {
      campaign_name: c.campaign_name,
      spend: c.spend, leads: c.leads, rows: c.rows,
      trip_id: c.trip_id || null,
      trip_label: c.trip_id ? (tripLabel[c.trip_id] || c.trip_id) : null,
      detected_code: code,
      auto_trip_id: autoTripId,
      manual: isManual,
      linked: Boolean(c.trip_id),
    };
  }).sort((a, b) => (a.linked ? 1 : 0) - (b.linked ? 1 : 0) || b.spend - a.spend);

  const tripOptions = (trips || []).map((t) => ({ id: t.id, label: `${t.kode_trip || t.id} — ${t.name || ''}`.trim() }));
  return { ok: true, campaigns, trips: tripOptions };
}

// Set / hapus link campaign -> trip (override manual). tripId '' = tanpa trip (umum).
export async function setCampaignTrip(campaignName, tripId) {
  const supabase = createClient();
  const { user, role } = await _assertAdsLink(supabase);
  if (!user) return { error: 'Not authenticated' };
  if (!_ADS_LINK_ROLES.includes(role)) return { error: 'Akses khusus management' };
  const name = String(campaignName || '').trim();
  if (!name) return { error: 'Campaign kosong' };
  const tId = tripId ? String(tripId) : null;
  const brandId = getBrandCode() === 'khasanah' ? 2 : 1;

  const { error: e1 } = await supabase.from('ad_campaign_map').upsert(
    { brand_id: brandId, campaign_name: name, trip_id: tId, updated_by: user.email || 'unknown', updated_at: new Date().toISOString() },
    { onConflict: 'brand_id,campaign_name' }
  );
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase.from('ads_entries').update({ trip_id: tId }).eq('campaign_name', name);
  if (e2) return { error: e2.message };

  revalidatePath('/ads');
  return { ok: true };
}
