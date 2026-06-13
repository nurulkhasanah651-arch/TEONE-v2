// R230: Roomlist auto-generator — logika baru
// Path: lib/utils/roomlist.js
//
// Aturan:
// 1. FAMILY = penanda prioritas SEKAMAR — tidak harus 4 orang, 2 pun jadi 1 kamar.
//    - Kalau room_type sudah ditulis di master file → pakai itu (family >kapasitas dipecah, tetap berdampingan).
//    - Kalau belum → 1 kamar seukuran jumlah anggota (1=single, 2=double, 3=triple, 4=quad).
// 2. Solo traveler: digabung sesama solo traveler dengan ROOM TYPE sama + GENDER sama.
// 3. Sisa yang tidak punya roommate segender / gender belum diisi / room type belum diisi
//    → ditandai NEED UPGRADE ROOM (notif).
//
// Output room: { room_no, room_type, capacity, label, is_family, gender, pax, needs_upgrade, upgrade_note }

import { ROOM_CAPACITY, normalizeRoomType } from '@/lib/utils/room-pricing';

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

function capacityByCount(count) {
  if (count <= 1) return { type: 'single', cap: 1 };
  if (count === 2) return { type: 'double', cap: 2 };
  if (count === 3) return { type: 'triple', cap: 3 };
  return { type: 'quad', cap: 4 };
}

function isNoBed(p) {
  const t = normalizeRoomType(p.room_type) || p.room_type;
  return p.age_type === 'child_no_bed' || p.age_type === 'infant' || t === 'child_no_bed' || t === 'infant';
}

export function generateRoomlist(passengers, customers = []) {
  // Peserta aktif saja (refund / pindah trip tidak ikut)
  const active = (passengers || []).filter((p) => {
    if (p.transfer_status === 'transferred') return false;
    if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') return false;
    return true;
  });

  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  // Gender tersimpan di data customer — gabungkan dulu ke tiap peserta
  const activeG = active.map((p) => {
    const c = custMap[p.customer_id] || {};
    return {
      ...p,
      gender: p.gender || p.sex || c.gender || c.sex || '',
      room_type: normalizeRoomType(p.room_type) || p.room_type || null,
    };
  });

  // 1. Pisahkan family vs solo
  const familyGroups = {};
  const noFamily = [];
  for (const p of activeG) {
    if (p.family_group_id) {
      if (!familyGroups[p.family_group_id]) familyGroups[p.family_group_id] = [];
      familyGroups[p.family_group_id].push(p);
    } else {
      noFamily.push(p);
    }
  }

  const rooms = [];
  let roomCounter = 1;

  // 2. FAMILY DULU — prioritas sekamar, ukuran fleksibel
  for (const familyId of Object.keys(familyGroups)) {
    const members = familyGroups[familyId];
    // child no bed / infant TIDAK dapat bed → tempel ke kamar keluarganya, tak hitung kapasitas
    const bed = members.filter((m) => !isNoBed(m));
    const noBed = members.filter((m) => isNoBed(m));
    const baseMembers = bed.length ? bed : members; // fallback kalau semua no-bed

    // room_type dari master file (kalau ditulis); 'family' = ikut jumlah anggota berbed
    let writtenType = baseMembers.find((m) => m.room_type && m.room_type !== 'family' && (ROOM_CAPACITY[m.room_type] || 0) > 0)?.room_type || null;
    let roomType, capacity;
    if (writtenType && ROOM_CAPACITY[writtenType]) {
      roomType = writtenType;
      capacity = ROOM_CAPACITY[writtenType];
    } else {
      const auto = capacityByCount(baseMembers.length);
      roomType = auto.type;
      capacity = auto.cap;
    }

    const firstCust = custMap[members[0]?.customer_id];
    const familyName = firstCust?.name?.split(' ').slice(-1)[0] || `#${String(familyId).slice(0, 6)}`;

    // Family > kapasitas → dipecah ke beberapa kamar berdampingan (tetap 1 label family)
    const familyRooms = [];
    let roomIdxInFamily = 1;
    for (let i = 0; i < baseMembers.length; i += capacity) {
      const slice = baseMembers.slice(i, i + capacity);
      const roomLabel = baseMembers.length > capacity
        ? `Family ${familyName} (Room ${roomIdxInFamily})`
        : `Family ${familyName}`;
      const lonely = slice.length === 1 && capacity > 1;
      const room = {
        room_no: roomCounter++,
        room_type: roomType,
        capacity: baseMembers.length > capacity ? capacity : Math.max(slice.length, 1),
        label: roomLabel,
        is_family: true,
        family_id: familyId,
        gender: 'family',
        pax: [...slice],
        needs_upgrade: lonely,
        upgrade_note: lonely ? 'Sisa 1 anggota family — gabung kamar lain / upgrade room' : '',
      };
      familyRooms.push(room);
      rooms.push(room);
      roomIdxInFamily++;
    }
    // tempel child no bed / infant ke kamar pertama keluarga (tanpa menambah kapasitas)
    if (noBed.length && familyRooms.length) {
      familyRooms[0].pax.push(...noBed);
    }
  }

  // 3. SOLO TRAVELER — kelompokkan per room_type (dari master file), lalu per gender
  const byRoomType = {};
  const noType = [];
  for (const p of noFamily) {
    const rt = p.room_type && ROOM_CAPACITY[p.room_type] ? p.room_type : null;
    if (!rt) { noType.push(p); continue; }
    if (!byRoomType[rt]) byRoomType[rt] = [];
    byRoomType[rt].push(p);
  }

  for (const rt of Object.keys(byRoomType)) {
    const list = byRoomType[rt];
    const capacity = ROOM_CAPACITY[rt] || 1;

    const males = list.filter((p) => normalizeGender(p) === 'M');
    const females = list.filter((p) => normalizeGender(p) === 'F');
    const unknown = list.filter((p) => normalizeGender(p) === '?');

    for (const group of [
      { label: 'Cowok', pax: males, key: 'M' },
      { label: 'Cewok', pax: females, key: 'F' },
    ]) {
      for (let i = 0; i < group.pax.length; i += capacity) {
        const slice = group.pax.slice(i, i + capacity);
        // Sisa tanpa roommate segender (kamar tidak penuh, bukan single) → NEED UPGRADE
        const noRoommate = slice.length < capacity && capacity > 1;
        rooms.push({
          room_no: roomCounter++,
          room_type: rt,
          capacity,
          label: `${group.label}${noRoommate ? ` (${slice.length}/${capacity} pax)` : ''}`,
          is_family: false,
          gender: group.key,
          pax: slice,
          needs_upgrade: noRoommate,
          upgrade_note: noRoommate
            ? `Tidak ada roommate ${group.label.toLowerCase()} se-room-type — NEED UPGRADE ROOM`
            : '',
        });
      }
    }

    // Gender belum diisi → tidak bisa dipasangkan → NEED UPGRADE (lengkapi gender dulu)
    if (unknown.length > 0) {
      for (let i = 0; i < unknown.length; i += capacity) {
        const slice = unknown.slice(i, i + capacity);
        rooms.push({
          room_no: roomCounter++,
          room_type: rt,
          capacity,
          label: 'Gender belum diisi',
          is_family: false,
          gender: '?',
          pax: slice,
          needs_upgrade: true,
          upgrade_note: 'Gender belum diisi — lengkapi dulu biar bisa dipasangkan',
        });
      }
    }
  }

  // 4. Room type belum ditulis di master file
  if (noType.length > 0) {
    for (const grpKey of ['M', 'F', '?']) {
      const grp = noType.filter((p) => normalizeGender(p) === grpKey);
      if (grp.length === 0) continue;
      rooms.push({
        room_no: roomCounter++,
        room_type: 'unassigned',
        capacity: grp.length,
        label: `${genderLabel(grpKey)} — BELUM ASSIGN room type`,
        is_family: false,
        gender: grpKey,
        pax: grp,
        needs_upgrade: true,
        upgrade_note: 'Room type belum ditulis di master file',
      });
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
    need_upgrade_rooms: 0,
    need_upgrade_pax: [],
  };
  for (const r of rooms) {
    summary.by_type[r.room_type] = (summary.by_type[r.room_type] || 0) + 1;
    if (r.is_family) summary.family_rooms++;
    else if (r.gender === 'M') summary.cowok_rooms++;
    else if (r.gender === 'F') summary.cewok_rooms++;
    else summary.unknown_rooms++;
    summary.total_pax += r.pax?.length || 0;
    if (r.needs_upgrade) {
      summary.need_upgrade_rooms++;
      for (const p of r.pax || []) summary.need_upgrade_pax.push(p);
    }
  }
  return summary;
}
