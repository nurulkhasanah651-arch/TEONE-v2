'use server';

// Round 100: Family Group actions
// - createFamilyGroup: bikin family, set kepala + anggota
// - updateFamilyGroup: rename / pindah kepala
// - removeFamilyGroup: bubarkan family (peserta jadi individu lagi)
// - addPassengerToFamily / removePassengerFromFamily

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function revalidateAll(tripId) {
  revalidatePath('/invoices');
  revalidatePath('/finance');
  revalidatePath('/finance/payments');
  revalidatePath('/finance/cashflow');
  revalidatePath('/accounting');
  revalidatePath('/dashboard');
  if (tripId) {
    revalidatePath(`/finance/payments/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
  }
}

// ============================================================
// CREATE FAMILY GROUP
// ============================================================
export async function createFamilyGroup({ trip_id, name, head_passenger_id, member_passenger_ids = [] }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!trip_id || !head_passenger_id) {
    return { error: 'trip_id + head_passenger_id wajib' };
  }
  if (!name || !name.trim()) {
    return { error: 'Nama family wajib' };
  }

  // Fetch head passenger customer_id
  const { data: headPax } = await supabase
    .from('trip_passengers')
    .select('customer_id')
    .eq('id', head_passenger_id)
    .maybeSingle();

  if (!headPax) return { error: 'Kepala keluarga tidak ditemukan' };

  // Create family group
  const created_by = user.user_metadata?.full_name || user.email || 'unknown';
  const { data: family, error } = await supabase
    .from('family_groups')
    .insert({
      trip_id,
      name: name.trim(),
      head_passenger_id,
      head_customer_id: headPax.customer_id,
      created_by,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  // Update head passenger
  await supabase
    .from('trip_passengers')
    .update({
      family_group_id: family.id,
      is_family_head: true,
    })
    .eq('id', head_passenger_id);

  // Update member passengers
  const memberIds = (Array.isArray(member_passenger_ids) ? member_passenger_ids : [])
    .filter((id) => id && id !== head_passenger_id);
  if (memberIds.length > 0) {
    await supabase
      .from('trip_passengers')
      .update({
        family_group_id: family.id,
        is_family_head: false,
      })
      .in('id', memberIds);
  }

  revalidateAll(trip_id);
  return { ok: true, family_id: family.id };
}

// ============================================================
// UPDATE FAMILY GROUP (rename / ganti kepala)
// ============================================================
export async function updateFamilyGroup({ family_id, name, head_passenger_id }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!family_id) return { error: 'family_id wajib' };

  const { data: family } = await supabase
    .from('family_groups')
    .select('trip_id, head_passenger_id')
    .eq('id', family_id)
    .maybeSingle();
  if (!family) return { error: 'Family tidak ditemukan' };

  const updates = {};
  if (name && name.trim()) updates.name = name.trim();

  // Ganti kepala?
  if (head_passenger_id && head_passenger_id !== family.head_passenger_id) {
    const { data: newHead } = await supabase
      .from('trip_passengers')
      .select('customer_id, family_group_id')
      .eq('id', head_passenger_id)
      .maybeSingle();

    if (!newHead) return { error: 'Kandidat kepala tidak ditemukan' };
    if (newHead.family_group_id !== family_id) {
      return { error: 'Kandidat kepala bukan anggota family ini' };
    }

    updates.head_passenger_id = head_passenger_id;
    updates.head_customer_id = newHead.customer_id;

    // Unset is_family_head di kepala lama
    if (family.head_passenger_id) {
      await supabase
        .from('trip_passengers')
        .update({ is_family_head: false })
        .eq('id', family.head_passenger_id);
    }
    // Set is_family_head di kepala baru
    await supabase
      .from('trip_passengers')
      .update({ is_family_head: true })
      .eq('id', head_passenger_id);
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('family_groups')
      .update(updates)
      .eq('id', family_id);
    if (error) return { error: error.message };
  }

  revalidateAll(family.trip_id);
  return { ok: true };
}

// ============================================================
// ADD / REMOVE PASSENGER TO/FROM FAMILY
// ============================================================
export async function addPassengerToFamily({ family_id, passenger_id }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: family } = await supabase
    .from('family_groups')
    .select('trip_id')
    .eq('id', family_id)
    .maybeSingle();
  if (!family) return { error: 'Family tidak ditemukan' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({
      family_group_id: family_id,
      is_family_head: false,
    })
    .eq('id', passenger_id);

  if (error) return { error: error.message };

  revalidateAll(family.trip_id);
  return { ok: true };
}

export async function removePassengerFromFamily({ passenger_id }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Fetch passenger family info
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('trip_id, family_group_id, is_family_head')
    .eq('id', passenger_id)
    .maybeSingle();

  if (!pax) return { error: 'Peserta tidak ditemukan' };
  if (!pax.family_group_id) return { error: 'Peserta tidak dalam family' };

  if (pax.is_family_head) {
    return { error: 'Kepala keluarga ga bisa dikeluarkan. Pindah kepala dulu atau bubarkan family.' };
  }

  await supabase
    .from('trip_passengers')
    .update({
      family_group_id: null,
      is_family_head: false,
    })
    .eq('id', passenger_id);

  revalidateAll(pax.trip_id);
  return { ok: true };
}

// ============================================================
// DELETE FAMILY GROUP (bubarkan — peserta jadi individu lagi)
// ============================================================
export async function deleteFamilyGroup(family_id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: family } = await supabase
    .from('family_groups')
    .select('trip_id')
    .eq('id', family_id)
    .maybeSingle();
  if (!family) return { error: 'Family tidak ditemukan' };

  // Unset family_group_id di semua peserta
  await supabase
    .from('trip_passengers')
    .update({
      family_group_id: null,
      is_family_head: false,
    })
    .eq('family_group_id', family_id);

  // Delete family group
  const { error } = await supabase.from('family_groups').delete().eq('id', family_id);
  if (error) return { error: error.message };

  revalidateAll(family.trip_id);
  return { ok: true };
}
