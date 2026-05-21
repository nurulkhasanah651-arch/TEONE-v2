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
