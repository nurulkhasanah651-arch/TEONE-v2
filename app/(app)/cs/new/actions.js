'use server';

// Server Action — secure mutation, runs only on server
// No client-side direct DB writes

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createCSUpdate(formData) {
  const supabase = createClient();

  // Auth check on server side
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Parse + validate input
  // trip_id is kept as-is (could be UUID or int — Supabase handles both)
  const trip_id_raw = formData.get('trip_id');
  // Try parseInt first; if NaN, use raw string (UUID case)
  const parsed = parseInt(trip_id_raw, 10);
  const trip_id = Number.isFinite(parsed) && String(parsed) === String(trip_id_raw) ? parsed : trip_id_raw;
  const tanggal = formData.get('tanggal');
  const total_terjual_hari_ini = parseInt(formData.get('total_terjual_hari_ini')) || 0;
  const from_instagram = parseInt(formData.get('from_instagram')) || 0;
  const from_whatsapp = parseInt(formData.get('from_whatsapp')) || 0;
  const from_offline = parseInt(formData.get('from_offline')) || 0;
  const jumlah_leads = parseInt(formData.get('jumlah_leads')) || 0;
  const sisa_seat = parseInt(formData.get('sisa_seat')) || 0;
  const notes = formData.get('catatan') || null;

  if (!trip_id) return { error: 'Trip harus dipilih' };
  if (!tanggal) return { error: 'Tanggal harus diisi' };

  // Insert — column names must match Supabase schema
  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';
  const { error } = await supabase.from('cs_daily_updates').insert({
    trip_id,
    tanggal,
    total_terjual_hari_ini,
    from_instagram,
    from_whatsapp,
    from_offline,
    jumlah_leads,
    sisa_seat,
    notes,
    updated_by,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  redirect('/cs');
}
