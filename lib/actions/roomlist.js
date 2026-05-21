'use server';

// Roomlist actions — auto-assign + manual override

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { roomTypeToKey } from '@/lib/utils/price-breakdown';

// Capacity per room type
const ROOM_CAPACITY = {
  quad: 4,
  triple: 3,
  double: 2,
  family: 4,
  single: 1,
};

// Room label prefix
const ROOM_PREFIX = {
  quad: 'Quad',
  triple: 'Triple',
  double: 'Double',
  family: 'Family',
  single: 'Single',
};

export async function autoAssignRooms(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: passengers } = await supabase
    .from('trip_passengers')
    .select('id, room_type, joined_at')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  if (!passengers || passengers.length === 0) return { error: 'Belum ada peserta' };

  // Group by type, assign sequential room numbers
  const counters = {}; // key -> { roomNum, currentCount }
  const updates = [];

  // Process in order: bigger room first (so they get lower numbers)
  const ordered = [...passengers].sort((a, b) => {
    const aCap = ROOM_CAPACITY[roomTypeToKey(a.room_type)] || 0;
    const bCap = ROOM_CAPACITY[roomTypeToKey(b.room_type)] || 0;
    if (bCap !== aCap) return bCap - aCap; // bigger first
    return new Date(a.joined_at) - new Date(b.joined_at);
  });

  for (const p of ordered) {
    const key = roomTypeToKey(p.room_type);
    let label = '—';

    if (!key) {
      label = p.room_type === 'Land Tour Only' || (p.room_type || '').toLowerCase().includes('land tour')
        ? 'Land Tour'
        : '—';
    } else if (key === 'child_no_bed' || key === 'infant') {
      label = '(share parent)';
    } else if (key === 'land_tour_only') {
      label = 'Land Tour';
    } else if (ROOM_CAPACITY[key]) {
      if (!counters[key]) counters[key] = { roomNum: 1, currentCount: 0 };
      const c = counters[key];
      if (c.currentCount >= ROOM_CAPACITY[key]) {
        c.roomNum += 1;
        c.currentCount = 0;
      }
      label = `${ROOM_PREFIX[key]}-${String(c.roomNum).padStart(2, '0')}`;
      c.currentCount += 1;
    }

    updates.push({ id: p.id, room_assignment: label });
  }

  // Bulk update
  let errors = [];
  for (const u of updates) {
    const { error } = await supabase
      .from('trip_passengers')
      .update({ room_assignment: u.room_assignment })
      .eq('id', u.id);
    if (error) errors.push(`Passenger ${u.id}: ${error.message}`);
  }

  revalidatePath(`/visa/${tripId}/roomlist`);
  revalidatePath(`/visa/${tripId}`);

  if (errors.length > 0) return { error: 'Sebagian gagal: ' + errors.slice(0, 3).join(', ') };
  return { ok: true, assigned: updates.length };
}

export async function updateRoomAssignment(passengerId, tripId, roomAssignment, notes) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({
      room_assignment: (roomAssignment || '').trim() || null,
      room_notes: (notes || '').trim() || null,
    })
    .eq('id', passengerId);

  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}/roomlist`);
  revalidatePath(`/visa/${tripId}`);
  return { ok: true };
}

export async function clearAllRoomAssignments(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({ room_assignment: null, room_notes: null })
    .eq('trip_id', tripId);

  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}/roomlist`);
  return { ok: true };
}
