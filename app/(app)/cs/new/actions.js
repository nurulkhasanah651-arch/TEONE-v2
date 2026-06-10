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

  // Parse + validate input — keep trip_id as string to preserve bigint/UUID precision
  // Supabase will coerce string to the correct column type automatically
  const trip_id = formData.get('trip_id');
  const tanggal = formData.get('tanggal');
  const total_terjual_hari_ini = parseInt(formData.get('total_terjual_hari_ini')) || 0;
  const from_instagram = parseInt(formData.get('from_instagram')) || 0;
  const from_whatsapp = parseInt(formData.get('from_whatsapp')) || 0;
  const from_offline = parseInt(formData.get('from_offline')) || 0;
  const jumlah_leads = parseInt(formData.get('jumlah_leads')) || 0;
  const sisa_seat = parseInt(formData.get('sisa_seat')) || 0;
  const notes = formData.get('catatan') || null;
  const closing_mitra = parseInt(formData.get('closing_mitra')) || 0;
  const closing_alumni = parseInt(formData.get('closing_alumni')) || 0;
  const mitra_id = formData.get('mitra_id') ? Number(formData.get('mitra_id')) : null;

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
    closing_mitra,
    closing_alumni,
    mitra_id,
    updated_by,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  redirect('/cs');
}
