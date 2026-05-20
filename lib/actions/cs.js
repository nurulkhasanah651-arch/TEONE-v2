'use server';

// CS Daily Updates server actions — kept in lib/actions to avoid (app) parenthesis import issues

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createCSUpdate(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const trip_id = formData.get('trip_id');
  const tanggal = formData.get('tanggal');
  if (!trip_id) return { error: 'Trip harus dipilih' };
  if (!tanggal) return { error: 'Tanggal harus diisi' };

  const from_instagram = parseInt(formData.get('from_instagram')) || 0;
  const from_whatsapp = parseInt(formData.get('from_whatsapp')) || 0;
  const from_offline = parseInt(formData.get('from_offline')) || 0;
  const closing_alumni = parseInt(formData.get('closing_alumni')) || 0;
  const closing_mitra = parseInt(formData.get('closing_mitra')) || 0;
  const jumlah_leads = parseInt(formData.get('jumlah_leads')) || 0;
  const notes = formData.get('notes') || null;

  // Auto-compute total terjual hari ini from sum of all sources
  const total_terjual_hari_ini =
    from_instagram + from_whatsapp + from_offline + closing_alumni + closing_mitra;

  // Auto-compute sisa_seat from current trip data (not user input)
  const { data: tripData } = await supabase
    .from('trips')
    .select('quota, sold, seat_left')
    .eq('id', trip_id)
    .maybeSingle();
  const sisa_seat = tripData?.seat_left ?? Math.max((tripData?.quota || 0) - (tripData?.sold || 0), 0);

  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('cs_daily_updates').insert({
    trip_id,
    tanggal,
    total_terjual_hari_ini,
    from_instagram,
    from_whatsapp,
    from_offline,
    closing_alumni,
    closing_mitra,
    jumlah_leads,
    sisa_seat,
    notes,
    updated_by,
  });

  if (error) return { error: error.message };

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  revalidatePath(`/trips/${trip_id}`);

  // If any closing happened, redirect to trip detail so CS can add participant details
  if (total_terjual_hari_ini > 0) {
    redirect(`/trips/${trip_id}?from=cs`);
  }
  redirect('/cs');
}
