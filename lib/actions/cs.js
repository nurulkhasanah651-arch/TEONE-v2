'use server';

// CS Daily Updates server actions — handles CS update + optional inline participants

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function parseFields(formData) {
  return {
    trip_id: formData.get('trip_id'),
    tanggal: formData.get('tanggal'),
    from_instagram: parseInt(formData.get('from_instagram')) || 0,
    from_whatsapp: parseInt(formData.get('from_whatsapp')) || 0,
    from_offline: parseInt(formData.get('from_offline')) || 0,
    closing_alumni: parseInt(formData.get('closing_alumni')) || 0,
    closing_mitra: parseInt(formData.get('closing_mitra')) || 0,
    jumlah_leads: parseInt(formData.get('jumlah_leads')) || 0,
    notes: formData.get('notes') || null,
  };
}

async function recomputeTripSold(supabase, trip_id) {
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

export async function createCSUpdate(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseFields(formData);
  if (!f.trip_id) return { error: 'Trip harus dipilih' };
  if (!f.tanggal) return { error: 'Tanggal harus diisi' };

  const total_terjual_hari_ini =
    f.from_instagram + f.from_whatsapp + f.from_offline + f.closing_alumni + f.closing_mitra;

  // Auto-compute sisa_seat from current trip data
  const { data: tripData } = await supabase
    .from('trips')
    .select('quota, sold, seat_left')
    .eq('id', f.trip_id)
    .maybeSingle();
  const sisa_seat = tripData?.seat_left ?? Math.max((tripData?.quota || 0) - (tripData?.sold || 0), 0);
  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error: csErr } = await supabase.from('cs_daily_updates').insert({
    trip_id: f.trip_id,
    tanggal: f.tanggal,
    total_terjual_hari_ini,
    from_instagram: f.from_instagram,
    from_whatsapp: f.from_whatsapp,
    from_offline: f.from_offline,
    closing_alumni: f.closing_alumni,
    closing_mitra: f.closing_mitra,
    jumlah_leads: f.jumlah_leads,
    sisa_seat,
    notes: f.notes,
    updated_by,
  });
  if (csErr) return { error: 'Gagal simpan CS update: ' + csErr.message };

  // Parse participants JSON from hidden field
  const participantsRaw = formData.get('participants');
  let participants = [];
  if (participantsRaw && typeof participantsRaw === 'string' && participantsRaw.length > 2) {
    try {
      participants = JSON.parse(participantsRaw);
    } catch (e) {
      return { error: 'Format peserta tidak valid: ' + e.message };
    }
  }

  // Insert each participant
  const insertErrors = [];
  let insertedCount = 0;
  for (let idx = 0; idx < participants.length; idx++) {
    const p = participants[idx];
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

    if (cErr || !customer) {
      insertErrors.push(`Peserta #${idx + 1} (${fullName}): ${cErr?.message || 'unknown customer error'}`);
      continue;
    }

    const { error: pErr } = await supabase.from('trip_passengers').insert({
      trip_id: f.trip_id,
      customer_id: customer.id,
      room_type: p.room_type || null,
      price_paid: parseInt(p.price_paid) || 0,
      status: 'confirmed',
    });

    if (pErr) {
      await supabase.from('customers').delete().eq('id', customer.id);
      insertErrors.push(`Peserta #${idx + 1} (${fullName}): ${pErr.message}`);
      continue;
    }
    insertedCount++;
  }

  if (insertedCount > 0) {
    await recomputeTripSold(supabase, f.trip_id);
  }

  // If some participants failed, return error (but CS update is already saved)
  if (insertErrors.length > 0) {
    return { error: `CS update tersimpan, tapi ${insertErrors.length} peserta gagal:\n${insertErrors.join('\n')}` };
  }

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  revalidatePath(`/trips/${f.trip_id}`);
  revalidatePath('/trips');
  redirect('/cs');
}

export async function updateCSUpdate(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const f = parseFields(formData);
  const total_terjual_hari_ini =
    f.from_instagram + f.from_whatsapp + f.from_offline + f.closing_alumni + f.closing_mitra;

  const { error } = await supabase
    .from('cs_daily_updates')
    .update({
      tanggal: f.tanggal,
      total_terjual_hari_ini,
      from_instagram: f.from_instagram,
      from_whatsapp: f.from_whatsapp,
      from_offline: f.from_offline,
      closing_alumni: f.closing_alumni,
      closing_mitra: f.closing_mitra,
      jumlah_leads: f.jumlah_leads,
      notes: f.notes,
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  if (f.trip_id) revalidatePath(`/trips/${f.trip_id}`);
  redirect('/cs');
}

export async function deleteCSUpdate(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('cs_daily_updates').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/cs');
  revalidatePath('/dashboard');
  return { ok: true };
}
