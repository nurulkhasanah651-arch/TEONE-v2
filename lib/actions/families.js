'use server';

// R100d + R192e: Family Group actions — CAPTURE UPDATE errors (sebelumnya silent fail)
// R192e: trip_passengers.family_group_id ga ke-update walau INSERT family_groups sukses.
//        Fix: capture error dari setiap UPDATE call.
// Path: lib/actions/families.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) {
    throw new Error('SUPABASE env vars missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function revalidateAll(tripId) {
  revalidatePath('/invoices');
  revalidatePath('/finance');
  revalidatePath('/finance/payments');
  revalidatePath('/finance/cashflow');
  revalidatePath('/accounting');
  revalidatePath('/dashboard');
  revalidatePath('/trips');
  if (tripId) {
    revalidatePath(`/finance/payments/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
  }
}

// ============================================================
// CREATE FAMILY GROUP — R192e: capture all errors
// ============================================================
export async function createFamilyGroup({ trip_id, name, head_passenger_id, member_passenger_ids = [] }) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!trip_id || !head_passenger_id) {
    return { error: 'trip_id + head_passenger_id wajib' };
  }
  if (!name || !name.trim()) {
    return { error: 'Nama family wajib' };
  }

  const supabase = getServiceClient();

  const { data: headPax, error: headErr } = await supabase
    .from('trip_passengers')
    .select('id, customer_id')
    .eq('id', head_passenger_id)
    .maybeSingle();

  if (headErr) return { error: 'Fetch head error: ' + headErr.message };
  if (!headPax) return { error: 'Kepala keluarga tidak ditemukan (id=' + head_passenger_id + ')' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';
  const { data: family, error: insertErr } = await supabase
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

  if (insertErr) return { error: 'Insert family_groups gagal: ' + insertErr.message };
  if (!family) return { error: 'Family group ga ke-create (no row returned)' };

  // R192e: CAPTURE error UPDATE head passenger
  const { error: headUpdErr, data: headUpd } = await supabase
    .from('trip_passengers')
    .update({
      family_group_id: family.id,
      is_family_head: true,
    })
    .eq('id', head_passenger_id)
    .select('id, family_group_id, is_family_head');

  if (headUpdErr) {
    console.error('[createFamilyGroup] head update fail:', headUpdErr);
    // Cleanup: delete family_groups row biar gak orphan
    try { await supabase.from('family_groups').delete().eq('id', family.id); } catch {}
    return { error: '⚠ Update kepala family gagal: ' + headUpdErr.message + ' (Cek RLS policy trip_passengers)' };
  }

  // Verify head benar-benar ke-update
  if (!headUpd || headUpd.length === 0 || !headUpd[0].family_group_id) {
    console.error('[createFamilyGroup] head update no-op:', { head_passenger_id, family_id: family.id });
    try { await supabase.from('family_groups').delete().eq('id', family.id); } catch {}
    return {
      error: '⚠ Head update gak menghasilkan perubahan. Cek: (1) RLS policy trip_passengers, (2) head_passenger_id valid, (3) policy SELECT trip_passengers ada.',
    };
  }

  // R192e: CAPTURE error UPDATE member passengers
  const memberIds = (Array.isArray(member_passenger_ids) ? member_passenger_ids : [])
    .filter((id) => id && id !== head_passenger_id);

  if (memberIds.length > 0) {
    const { error: memberUpdErr, data: memberUpd } = await supabase
      .from('trip_passengers')
      .update({
        family_group_id: family.id,
        is_family_head: false,
      })
      .in('id', memberIds)
      .select('id, family_group_id');

    if (memberUpdErr) {
      console.error('[createFamilyGroup] members update fail:', memberUpdErr);
      return {
        error: '⚠ Family + head ke-create OK, tapi update anggota gagal: ' + memberUpdErr.message,
        warning: true,
        family_id: family.id,
      };
    }

    console.log('[createFamilyGroup] OK', { family_id: family.id, head_passenger_id, members_updated: memberUpd?.length || 0 });
  }

  revalidateAll(trip_id);
  return { ok: true, family_id: family.id };
}

// ============================================================
// UPDATE FAMILY GROUP
// ============================================================
export async function updateFamilyGroup({ family_id, name, head_passenger_id }) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!family_id) return { error: 'family_id wajib' };

  const supabase = getServiceClient();

  const { data: family } = await supabase
    .from('family_groups')
    .select('trip_id, head_passenger_id')
    .eq('id', family_id)
    .maybeSingle();
  if (!family) return { error: 'Family tidak ditemukan' };

  const updates = {};
  if (name && name.trim()) updates.name = name.trim();

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

    if (family.head_passenger_id) {
      const { error: e1 } = await supabase
        .from('trip_passengers')
        .update({ is_family_head: false })
        .eq('id', family.head_passenger_id);
      if (e1) return { error: 'Demote old head gagal: ' + e1.message };
    }
    const { error: e2 } = await supabase
      .from('trip_passengers')
      .update({ is_family_head: true })
      .eq('id', head_passenger_id);
    if (e2) return { error: 'Promote new head gagal: ' + e2.message };
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
// ADD / REMOVE PASSENGER
// ============================================================
export async function addPassengerToFamily({ family_id, passenger_id }) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  if (!family_id || !passenger_id) return { error: 'family_id & passenger_id wajib' };

  const { data: family } = await supabase
    .from('family_groups')
    .select('trip_id')
    .eq('id', family_id)
    .maybeSingle();
  if (!family) return { error: 'Family tidak ditemukan' };

  // Peserta wajib dari trip yang sama — cegah salah pilih lintas trip.
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id, family_group_id')
    .eq('id', passenger_id)
    .maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };
  if (String(pax.trip_id) !== String(family.trip_id)) return { error: 'Peserta bukan dari trip yang sama' };

  const { error, data } = await supabase
    .from('trip_passengers')
    .update({
      family_group_id: family_id,
      is_family_head: false,
    })
    .eq('id', passenger_id)
    .select('id, family_group_id');

  if (error) return { error: 'Update gagal: ' + error.message };
  if (!data || data.length === 0) return { error: 'Peserta gak ke-update (cek RLS atau ID)' };

  revalidateAll(family.trip_id);
  return { ok: true };
}

export async function removePassengerFromFamily({ passenger_id }) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient();

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

  const { error } = await supabase
    .from('trip_passengers')
    .update({
      family_group_id: null,
      is_family_head: false,
    })
    .eq('id', passenger_id);

  if (error) return { error: 'Remove gagal: ' + error.message };

  revalidateAll(pax.trip_id);
  return { ok: true };
}

// ============================================================
// DELETE FAMILY GROUP
// ============================================================
export async function deleteFamilyGroup(family_id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient();

  const { data: family } = await supabase
    .from('family_groups')
    .select('trip_id')
    .eq('id', family_id)
    .maybeSingle();
  if (!family) return { error: 'Family tidak ditemukan' };

  const { error: paxErr } = await supabase
    .from('trip_passengers')
    .update({
      family_group_id: null,
      is_family_head: false,
    })
    .eq('family_group_id', family_id);
  if (paxErr) return { error: 'Reset peserta gagal: ' + paxErr.message };

  const { error } = await supabase.from('family_groups').delete().eq('id', family_id);
  if (error) return { error: error.message };

  revalidateAll(family.trip_id);
  return { ok: true };
}
