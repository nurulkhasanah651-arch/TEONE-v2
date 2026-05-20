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
  const trip_id = parseInt(formData.get('trip_id'));
  const tanggal = formData.get('tanggal');
  const total_terjual_hari_ini = parseInt(formData.get('total_terjual_hari_ini')) || 0;
  const from_instagram = parseInt(formData.get('from_instagram')) || 0;
  const from_whatsapp = parseInt(formData.get('from_whatsapp')) || 0;
  const from_offline = parseInt(formData.get('from_offline')) || 0;
  const jumlah_leads = parseInt(formData.get('jumlah_leads')) || 0;
  const sisa_seat = parseInt(formData.get('sisa_seat')) || 0;
  const catatan = formData.get('catatan') || null;

  if (!trip_id) return { error: 'Trip harus dipilih' };
  if (!tanggal) return { error: 'Tanggal harus diisi' };

  // Insert
  const { error } = await supabase.from('cs_daily_updates').insert({
    trip_id,
    tanggal,
    total_terjual_hari_ini,
    from_instagram,
    from_whatsapp,
    from_offline,
    jumlah_leads,
    sisa_seat,
    catatan,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  redirect('/cs');
}
