'use server';

// Round 103: Roomlist actions — Family Priority + Gender + Room Type matching
//
// Algoritma:
// 1. Family group → 1 room (atau split kalau >cap) — semua anggota satu room
//    label "FAM-01-Andi" / "FAM-02-Budi" dst
// 2. Solo traveler → group by (room_type, gender) → fill room per capacity
//    label "DBL-01" / "TRP-02" / "TWN-03"
//
// Rules:
// - Family room: semua anggota family dalam 1 room (no gender mixing rule,
//   karena keluarga sendiri)
// - Solo room: WAJIB 1 gender + 1 room_type
// - Child no bed / Infant: share parent room (tagged "share parent")

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Capacity per room type
const ROOM_CAPACITY = {
  single: 1,
  double: 2,
  twin: 2,
  triple: 3,
  quad: 4,
  family: 4,
};

const ROOM_PREFIX = {
  single: 'SGL',
  double: 'DBL',
  twin: 'TWN',
  triple: 'TRP',
  quad: 'QUAD',
  family: 'FAM',
};

function roomTypeKey(rt) {
  if (!rt) return null;
  const lc = String(rt).toLowerCase().replace(/[^a-z]/g, '');
  if (['single'].includes(lc)) return 'single';
  if (['double', 'dbl'].includes(lc)) return 'double';
  if (['twin', 'twn'].includes(lc)) return 'twin';
  if (['triple', 'trp'].includes(lc)) return 'triple';
  if (['quad', 'quadruple'].includes(lc)) return 'quad';
  if (['family', 'fam'].includes(lc)) return 'family';
  if (lc.includes('childnobed') || lc.includes('cnb')) return 'child_no_bed';
  if (lc.includes('infant')) return 'infant';
  if (lc.includes('landtour')) return 'land_tour';
  return null;
}

function genderLabel(g) {
  if (g === 'L' || g === 'M' || (g || '').toLowerCase().startsWith('l') || (g || '').toLowerCase().startsWith('m')) return '♂ Cowok';
  if (g === 'P' || g === 'F' || (g || '').toLowerCase().startsWith('p') || (g || '').toLowerCase().startsWith('f')) return '♀ Cewek';
  return '? Unknown';
}

function genderKey(g) {
  if (g === 'L' || g === 'M' || (g || '').toLowerCase().startsWith('l') || (g || '').toLowerCase().startsWith('m')) return 'L';
  if (g === 'P' || g === 'F' || (g || '').toLowerCase().startsWith('p') || (g || '').toLowerCase().startsWith('f')) return 'P';
  return 'X';
}

function sanitizeName(s) {
  return String(s || '').replace(/[^A-Za-z]/g, '').slice(0, 8) || 'Family';
}

// ============================================================
// MAIN: Auto-Assign with Family Priority
// ============================================================
export async function autoAssignRoomsFamilyPriority(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  // 1. Fetch all passengers
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, customer_id, room_type, family_group_id, is_family_head, joined_at')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  if (!pax || pax.length === 0) return { error: 'Belum ada peserta di trip ini' };

  // Fetch customers (for gender + name)
  const customerIds = pax.map((p) => p.customer_id).filter(Boolean);
  let custMap = {};
  if (customerIds.length > 0) {
    const { data: custs } = await supabase
      .from('customers')
      .select('id, name, gender')
      .in('id', customerIds);
    custMap = Object.fromEntries((custs || []).map((c) => [c.id, c]));
  }

  // Fetch family groups
  const { data: famGroups } = await supabase
    .from('family_groups')
    .select('*')
    .eq('trip_id', tripId);
  const famMap = Object.fromEntries((famGroups || []).map((f) => [f.id, f]));

  // 2. Reset all existing assignments
  await supabase
    .from('trip_passengers')
    .update({ room_assignment: null, room_notes: null })
    .eq('trip_id', tripId);

  // 3. Bucket passengers
  const familyMembers = {}; // family_id → [passenger...]
  const solo = [];
  const specials = []; // child_no_bed / infant / land_tour
  for (const p of pax) {
    const rtKey = roomTypeKey(p.room_type);
    if (rtKey === 'child_no_bed' || rtKey === 'infant' || rtKey === 'land_tour') {
      specials.push({ ...p, _rtKey: rtKey });
      continue;
    }
    if (p.family_group_id && famMap[p.family_group_id]) {
      if (!familyMembers[p.family_group_id]) familyMembers[p.family_group_id] = [];
      familyMembers[p.family_group_id].push({ ...p, _rtKey: rtKey });
    } else {
      solo.push({ ...p, _rtKey: rtKey });
    }
  }

  const updates = [];

  // 4. PHASE 1 — Family rooms
  let famCounter = 1;
  for (const fg of (famGroups || [])) {
    const members = familyMembers[fg.id];
    if (!members || members.length === 0) continue;
    const famLabel = sanitizeName(fg.name);
    const ROOM_CAP = 4; // family room cap (generic)
    let roomIdx = 1;
    let inCurrent = 0;

    for (const m of members) {
      if (inCurrent >= ROOM_CAP) {
        roomIdx++;
        inCurrent = 0;
      }
      const suffix = members.length <= ROOM_CAP ? '' : ` (${roomIdx})`;
      const label = `FAM-${String(famCounter).padStart(2, '0')}-${famLabel}${suffix}`;
      updates.push({
        id: m.id,
        room_assignment: label,
        room_notes: `Family: ${fg.name}${m.is_family_head ? ' (Kepala)' : ''}`,
      });
      inCurrent++;
    }
    famCounter++;
  }

  // 5. PHASE 2 — Solo by (room_type, gender)
  // Group by (rtKey, gender)
  const soloBuckets = {};
  for (const p of solo) {
    const rtKey = p._rtKey;
    if (!rtKey || !ROOM_CAPACITY[rtKey]) {
      // unknown room type → label "Unassigned" later
      updates.push({
        id: p.id,
        room_assignment: 'UNASSIGNED',
        room_notes: 'Room type tidak dikenali — assign manual',
      });
      continue;
    }
    const c = custMap[p.customer_id] || {};
    const g = genderKey(c.gender);
    // Single room: gak perlu pairing, satu room per peserta
    if (rtKey === 'single') {
      const key = `single|${g}`;
      if (!soloBuckets[key]) soloBuckets[key] = [];
      soloBuckets[key].push(p);
      continue;
    }
    const key = `${rtKey}|${g}`;
    if (!soloBuckets[key]) soloBuckets[key] = [];
    soloBuckets[key].push(p);
  }

  // Assign rooms within each bucket
  const typeCounters = {}; // rtKey → next room number
  // Process buckets in order: single, double/twin, triple, quad, family (smaller first)
  const bucketKeys = Object.keys(soloBuckets).sort((a, b) => {
    const order = { single: 1, double: 2, twin: 2, triple: 3, quad: 4, family: 5 };
    const aType = a.split('|')[0];
    const bType = b.split('|')[0];
    return (order[aType] || 99) - (order[bType] || 99);
  });

  for (const bucketKey of bucketKeys) {
    const [rtKey, g] = bucketKey.split('|');
    const list = soloBuckets[bucketKey];
    const cap = ROOM_CAPACITY[rtKey] || 2;
    const prefix = ROOM_PREFIX[rtKey] || 'ROOM';

    if (!typeCounters[rtKey]) typeCounters[rtKey] = 1;

    let currentRoom = typeCounters[rtKey];
    let inCurrent = 0;
    for (const p of list) {
      if (inCurrent >= cap) {
        currentRoom++;
        inCurrent = 0;
      }
      const label = `${prefix}-${String(currentRoom).padStart(2, '0')}`;
      updates.push({
        id: p.id,
        room_assignment: label,
        room_notes: `${genderLabel(g)} · ${rtKey.toUpperCase()}`,
      });
      inCurrent++;
    }
    typeCounters[rtKey] = currentRoom + 1; // bucket berikutnya (gender lain) start room baru
  }

  // 6. PHASE 3 — Special: child_no_bed / infant / land_tour
  for (const sp of specials) {
    let label;
    let note;
    if (sp._rtKey === 'child_no_bed') {
      label = '(share parent)';
      note = 'Child no bed — share room dengan orang tua';
    } else if (sp._rtKey === 'infant') {
      label = '(share parent)';
      note = 'Infant — share room dengan orang tua';
    } else if (sp._rtKey === 'land_tour') {
      label = 'LAND TOUR';
      note = 'Land tour only — tidak butuh kamar';
    } else {
      label = 'UNASSIGNED';
      note = 'Manual assign';
    }
    updates.push({ id: sp.id, room_assignment: label, room_notes: note });
  }

  // 7. Bulk update
  let errors = [];
  for (const u of updates) {
    const { error } = await supabase
      .from('trip_passengers')
      .update({ room_assignment: u.room_assignment, room_notes: u.room_notes })
      .eq('id', u.id);
    if (error) errors.push(`#${u.id}: ${error.message}`);
  }

  revalidatePath(`/visa/${tripId}/roomlist`);
  revalidatePath(`/visa/${tripId}`);
  revalidatePath(`/trips/${tripId}`);

  if (errors.length > 0) {
    return { error: `Sebagian gagal (${errors.length}/${updates.length}): ${errors.slice(0, 3).join(', ')}` };
  }

  return {
    ok: true,
    assigned: updates.length,
    family_rooms: (famGroups || []).filter((fg) => familyMembers[fg.id]?.length).length,
    solo_count: solo.length,
    specials_count: specials.length,
  };
}

// ============================================================
// LEGACY: simple auto-assign (no family priority) — kept for backward compat
// ============================================================
export async function autoAssignRooms(tripId) {
  return autoAssignRoomsFamilyPriority(tripId);
}

// ============================================================
// MANUAL OVERRIDE
// ============================================================
export async function updateRoomAssignment(passengerId, tripId, roomAssignment, notes) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

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

// ============================================================
// CLEAR ALL
// ============================================================
export async function clearAllRoomAssignments(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const { error } = await supabase
    .from('trip_passengers')
    .update({ room_assignment: null, room_notes: null })
    .eq('trip_id', tripId);

  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}/roomlist`);
  return { ok: true };
}

// ============================================================
// R231: FINAL ROOMLIST — simpan susunan kamar final ke trips.final_roomlist
// rooms: [{ room_no, room_type, capacity, label, is_family, gender, members:[{passenger_id?, name, gender}], note }]
// ============================================================
export async function saveFinalRoomlist(tripId, rooms) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!Array.isArray(rooms)) return { error: 'Data roomlist tidak valid' };

  const payload = {
    rooms,
    saved_at: new Date().toISOString(),
    saved_by: user.email || 'unknown',
  };
  const { error } = await supabase.from('trips').update({ final_roomlist: payload }).eq('id', tripId);
  if (error) return { error: error.message };

  // SINKRON BALIK ke master trip: room_type + room_assignment tiap peserta
  // mengikuti Final Roomlist → Room Distribution / HPP / sheet otomatis cocok
  for (const r of rooms) {
    const ids = (r.members || []).map((m) => m.passenger_id).filter(Boolean);
    if (ids.length === 0) continue;
    await supabase
      .from('trip_passengers')
      .update({
        room_type: r.room_type || null,
        room_assignment: `Room ${r.room_no}${r.label ? ` — ${r.label}` : ''}`,
      })
      .in('id', ids)
      .eq('trip_id', tripId);
  }

  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true, saved_at: payload.saved_at };
}

export async function clearFinalRoomlist(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase.from('trips').update({ final_roomlist: null }).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath(`/finance/cashflow/${tripId}`);
  return { ok: true };
}
