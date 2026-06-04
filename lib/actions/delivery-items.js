// lib/actions/delivery-items.js
// R208: Server actions untuk delivery items config + item status + internal notes

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function revalidateAll(tripId) {
  revalidatePath('/finance/payments');
  if (tripId) revalidatePath(`/finance/payments/${tripId}`);
}

/**
 * Save delivery items config per trip
 * itemsConfig: { cowok: [...], cewek: [...] }
 */
export async function saveDeliveryItemsConfig(tripId, itemsConfig) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!tripId) return { error: 'Trip ID kosong' };
  if (!itemsConfig || typeof itemsConfig !== 'object') {
    return { error: 'Items config harus berupa object {cowok, cewek}' };
  }

  // Sanitize
  const cowok = Array.isArray(itemsConfig.cowok) ? itemsConfig.cowok.filter(Boolean).map(String) : [];
  const cewek = Array.isArray(itemsConfig.cewek) ? itemsConfig.cewek.filter(Boolean).map(String) : [];

  const { error } = await supabase
    .from('trips')
    .update({ delivery_items_config: { cowok, cewek } })
    .eq('id', tripId);

  if (error) return { error: 'Update failed: ' + error.message };

  revalidateAll(tripId);
  return { ok: true };
}

/**
 * Update status item per peserta
 * itemKey: nama item (e.g. "Koper", "Kain ihram")
 * status: "belum" | "siap" | "dikirim" | "diterima"
 */
export async function updateItemStatus(passengerId, itemKey, status) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!passengerId) return { error: 'Passenger ID kosong' };
  if (!itemKey) return { error: 'Item key kosong' };

  // Get current status
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id, delivery_items_status')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };

  const currentStatus = (pax.delivery_items_status && typeof pax.delivery_items_status === 'object')
    ? pax.delivery_items_status
    : {};

  const newStatus = { ...currentStatus, [itemKey]: status };

  // Kalau status 'belum', hapus dari object (cleanup)
  if (status === 'belum' || !status) {
    delete newStatus[itemKey];
  }

  const { error } = await supabase
    .from('trip_passengers')
    .update({ delivery_items_status: newStatus })
    .eq('id', passengerId);

  if (error) return { error: 'Update failed: ' + error.message };

  revalidateAll(pax.trip_id);
  return { ok: true };
}

/**
 * Set semua item ke status sama (bulk)
 */
export async function setAllItemsStatus(passengerId, status, itemList = []) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!passengerId) return { error: 'Passenger ID kosong' };

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };

  const newStatus = {};
  if (status !== 'belum' && status) {
    for (const item of itemList) {
      newStatus[item] = status;
    }
  }

  const { error } = await supabase
    .from('trip_passengers')
    .update({ delivery_items_status: newStatus })
    .eq('id', passengerId);

  if (error) return { error: 'Update failed: ' + error.message };

  revalidateAll(pax.trip_id);
  return { ok: true };
}

/**
 * Update internal notes per peserta
 */
export async function updateInternalNotes(passengerId, notes) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!passengerId) return { error: 'Passenger ID kosong' };

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({ delivery_internal_notes: notes || null })
    .eq('id', passengerId);

  if (error) return { error: 'Update failed: ' + error.message };

  revalidateAll(pax.trip_id);
  return { ok: true };
}
