'use server';

// Round 73: Daily Leads — tambah leads_ads_meta/google/tiktok
// 1 entry per date (upsert by tanggal)

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function upsertDailyLeads(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tanggal = formData.get('tanggal');
  if (!tanggal) return { error: 'Tanggal harus diisi' };

  const fields = {
    tanggal,
    leads_ig: parseInt(formData.get('leads_ig')) || 0,
    leads_tiktok: parseInt(formData.get('leads_tiktok')) || 0,
    leads_wa: parseInt(formData.get('leads_wa')) || 0,
    leads_fb: parseInt(formData.get('leads_fb')) || 0,
    leads_ads_meta: parseInt(formData.get('leads_ads_meta')) || 0,
    leads_ads_google: parseInt(formData.get('leads_ads_google')) || 0,
    leads_ads_tiktok: parseInt(formData.get('leads_ads_tiktok')) || 0,
    notes: formData.get('notes') || null,
    updated_by: user.user_metadata?.full_name || user.email || 'unknown',
  };

  let { error } = await supabase.from('cs_daily_leads').upsert(fields, { onConflict: 'tanggal' });

  // Defensive: kalau kolom ads belum di-migrate, retry tanpa ads fields
  if (error && /leads_ads_/.test(error.message)) {
    const stripped = { ...fields };
    delete stripped.leads_ads_meta;
    delete stripped.leads_ads_google;
    delete stripped.leads_ads_tiktok;
    const retry = await supabase.from('cs_daily_leads').upsert(stripped, { onConflict: 'tanggal' });
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidatePath('/cs');
  revalidatePath('/cs/leads');
  revalidatePath('/dashboard');
  redirect('/cs');
}
