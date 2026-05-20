'use server';

// Daily Leads tracker — 1 entry per date (upsert by tanggal)

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function upsertDailyLeads(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tanggal = formData.get('tanggal');
  if (!tanggal) return { error: 'Tanggal harus diisi' };

  const leads_ig = parseInt(formData.get('leads_ig')) || 0;
  const leads_tiktok = parseInt(formData.get('leads_tiktok')) || 0;
  const leads_wa = parseInt(formData.get('leads_wa')) || 0;
  const leads_fb = parseInt(formData.get('leads_fb')) || 0;
  const notes = formData.get('notes') || null;
  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Upsert by tanggal — 1 row per day
  const { error } = await supabase.from('cs_daily_leads').upsert(
    { tanggal, leads_ig, leads_tiktok, leads_wa, leads_fb, notes, updated_by },
    { onConflict: 'tanggal' }
  );

  if (error) return { error: error.message };

  revalidatePath('/cs/leads');
  revalidatePath('/cs');
  revalidatePath('/dashboard');
  redirect('/cs/leads');
}
