'use server';

// CS Daily Updates server actions — handles CS update + optional participants

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

  const { error: csErr } = await supabase.from('cs_daily_updates').insert({
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

  if (csErr) return { error: 'Gagal simpan CS update: ' + csErr.message };

  // Parse participants JSON (optional)
  let participants = [];
  try {
    participants = JSON.parse(formData.get('participants') || '[]');
  } catch {
    participants = [];
  }

  // Insert each participant (customer + trip_passengers link)
  let insertedCount = 0;
  for (const p of participants) {
    const first = (p.first_name || '').trim();
    const last = (p.last_name || '').trim();
    const fullName = `${first} ${last}`.trim();
    if (!fullName) continue;

    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .insert({
        name: fullName,
        first_name: first,
        surname: last || null,
        phone: p.phone?.trim() || null,
        whatsapp: p.phone?.trim() || null,
        email: p.email?.trim() || null,
      })
      .select('id')
      .single();

    if (cErr || !customer) continue;

    const { error: pErr } = await supabase.from('trip_passengers').insert({
      trip_id,
      customer_id: customer.id,
      room_type: p.room_type || null,
      price_paid: parseInt(p.price_paid) || 0,
      status: 'confirmed',
    });

    if (pErr) {
      await supabase.from('customers').delete().eq('id', customer.id);
      continue;
    }
    insertedCount++;
  }

  // Recompute sold count on trip if any participant added
  if (insertedCount > 0) {
    const { count } = await supabase
      .from('trip_passengers')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip_id);
    const { data: t } = await supabase.from('trips').select('quota').eq('id', trip_id).single();
    const quota = t?.quota || 0;
    await supabase.from('trips')
      .update({ sold: count || 0, seat_left: Math.max(quota - (count || 0), 0) })
      .eq('id', trip_id);
  }

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  revalidatePath(`/trips/${trip_id}`);
  revalidatePath('/trips');

  redirect('/cs');
}
