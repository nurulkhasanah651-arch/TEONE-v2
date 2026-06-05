// R215e: Roomlist auto-generator
// Path: lib/utils/roomlist.js
//
// Algorithm:
// 1. Family group_id dulu → sekamar (priority)
// 2. Non-family: group by room_type
// 3. Within room_type: cowok ke cowok, cewok ke cewok (gak campur)
// 4. Fill rooms sampai capacity
//
// Output: [{ room_no, room_type, capacity, label, is_family, gender, pax: [...] }]

import { ROOM_CAPACITY } from '@/lib/utils/room-pricing';

export function normalizeGender(p) {
  const g = String(p?.gender || p?.sex || '').trim().toLowerCase();
  if (!g) return '?';
  if (/^m$|male|laki|cowok/.test(g)) return 'M';
  if (/^f$|female|perempuan|wanita|cewok|cewek/.test(g)) return 'F';
  if (g === 'l') return 'M';
  if (g === 'p') return 'F';
  return '?';
}

export function genderLabel(g) {
  if (g === 'M') return 'Cowok';
  if (g === 'F') return 'Cewok';
  return 'Belum tau';
}

export function generateRoomlist(passengers, customers = []) {
  // Filter active passengers
  const active = (passengers || []).filter((p) => {
    if (p.transfer_status === 'transferred') return false;
    if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') return false;
    return true;
  });

  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  // 1. Group by family_group_id
  const familyGroups = {};
  const noFamily = [];
  for (const p of active) {
    if (p.family_group_id) {
      if (!familyGroups[p.family_group_id]) familyGroups[p.family_group_id] = [];
      familyGroups[p.family_group_id].push(p);
    } else {
      noFamily.push(p);
    }
  }

  const rooms = [];
  let roomCounter = 1;

  // 2. Place family groups first
  for (const familyId of Object.keys(familyGroups)) {
    const members = familyGroups[familyId];

    // Determine room type — pakai room_type member pertama, atau auto by count
    let roomType = members[0]?.room_type;
    if (!roomType) {
      const count = members.length;
      if (count === 1) roomType = 'single';
      else if (count === 2) roomType = 'twin';
      else if (count === 3) roomType = 'triple';
      else roomType = 'quad';
    }
    const capacity = ROOM_CAPACITY[roomType] || 4;

    // Family name from first member's customer
    const firstCust = custMap[members[0]?.customer_id];
    const familyName = firstCust?.name?.split(' ').slice(-1)[0] || `#${familyId.slice(0, 6)}`;

    // Split family into rooms if > capacity
    let roomIdxInFamily = 1;
    for (let i = 0; i < members.length; i += capacity) {
      const slice = members.slice(i, i + capacity);
      const roomLabel = members.length > capacity
        ? `Family ${familyName} (Room ${roomIdxInFamily})`
        : `Family ${familyName}`;
      rooms.push({
        room_no: roomCounter++,
        room_type: roomType,
        capacity,
        label: roomLabel,
        is_family: true,
        family_id: familyId,
        gender: 'mixed',
        pax: slice,
      });
      roomIdxInFamily++;
    }
  }

  // 3. Group non-family by room_type
  const byRoomType = { single: [], twin: [], double: [], triple: [], quad: [], unassigned: [] };
  for (const p of noFamily) {
    const rt = p.room_type || 'unassigned';
    if (byRoomType[rt]) byRoomType[rt].push(p);
    else byRoomType.unassigned.push(p);
  }

  // 4. Within each room_type: group by gender, then fill
  for (const rt of ['quad', 'triple', 'double', 'twin', 'single', 'unassigned']) {
    const list = byRoomType[rt];
    if (!list || list.length === 0) continue;
    const capacity = ROOM_CAPACITY[rt] || 1;

    const males = list.filter((p) => normalizeGender(p) === 'M');
    const females = list.filter((p) => normalizeGender(p) === 'F');
    const unknown = list.filter((p) => normalizeGender(p) === '?');

    const groups = [
      { label: 'Cowok', pax: males, key: 'M' },
      { label: 'Cewok', pax: females, key: 'F' },
      { label: 'Belum tau gender', pax: unknown, key: '?' },
    ];

    for (const group of groups) {
      if (group.pax.length === 0) continue;
      for (let i = 0; i < group.pax.length; i += capacity) {
        const slice = group.pax.slice(i, i + capacity);
        const isPartial = slice.length < capacity;
        rooms.push({
          room_no: roomCounter++,
          room_type: rt === 'unassigned' ? 'unassigned' : rt,
          capacity,
          label: rt === 'unassigned'
            ? `${group.label} (BELUM ASSIGN room type)`
            : `${group.label}${isPartial ? ` (${slice.length}/${capacity} pax)` : ''}`,
          is_family: false,
          gender: group.key,
          pax: slice,
        });
      }
    }
  }

  return rooms;
}

// Summary stats untuk display
export function roomlistSummary(rooms) {
  const summary = {
    total_rooms: rooms.length,
    by_type: { single: 0, twin: 0, double: 0, triple: 0, quad: 0, unassigned: 0 },
    family_rooms: 0,
    cowok_rooms: 0,
    cewok_rooms: 0,
    unknown_rooms: 0,
    total_pax: 0,
  };
  for (const r of rooms) {
    summary.by_type[r.room_type] = (summary.by_type[r.room_type] || 0) + 1;
    if (r.is_family) summary.family_rooms++;
    else if (r.gender === 'M') summary.cowok_rooms++;
    else if (r.gender === 'F') summary.cewok_rooms++;
    else summary.unknown_rooms++;
    summary.total_pax += r.pax?.length || 0;
  }
  return summary;
}
