'use server';

// Manifest paspor lengkap per trip — dipakai tombol Download di Portal TL,
// HPP Cashflow, dan tab Visa. Brand-aware (halaman ini di belakang middleware).
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { calcAge, fmtDate } from '@/lib/utils/format';
import { normalizeGender } from '@/lib/utils/roomlist';

function _splitName(name) {
  const s = String(name || '').trim();
  if (!s) return { first: '', last: '' };
  const parts = s.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

// Ambil crew (TL/Tim) trip + resolve passport (crew override menang, fallback master TL).
// Pakai service client supaya andal (crew disimpan terpisah dari trip_passengers).
async function fetchTripCrewResolved(tripId) {
  try {
    const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
    const db = (url && key) ? createSvc(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : createClient();
    const { data: crew } = await db.from('trip_crew').select('*').eq('trip_id', tripId).order('id', { ascending: true });
    const rows = crew || [];
    if (!rows.length) return [];
    const tlIds = [...new Set(rows.map((c) => c.tl_id).filter(Boolean))];
    let tlMap = {};
    if (tlIds.length) {
      const { data: tls } = await db.from('tour_leaders').select('*').in('id', tlIds);
      tlMap = Object.fromEntries((tls || []).map((t) => [t.id, t]));
    }
    return rows.map((c) => {
      const tl = c.tl_id ? (tlMap[c.tl_id] || {}) : {};
      const pick = (k) => (c[k] != null && String(c[k]).trim() !== '') ? c[k] : (tl[k] ?? null);
      return {
        name: (c.name && c.name.trim()) || tl.name || '',
        role: c.role || 'Tour Leader', room_type: c.room_type || '', notes: c.notes || '',
        phone: tl.phone || '',
        gender: pick('gender'), place_of_birth: pick('place_of_birth'), birth_date: pick('birth_date'),
        passport_no: pick('passport_no'), passport_expiry: pick('passport_expiry'),
        passport_issued_date: pick('passport_issued_date'), passport_issued_at: pick('passport_issued_at'),
      };
    });
  } catch { return []; }
}

export async function getManifestRows(tripId) {
  if (!tripId) return { error: 'tripId kosong' };
  const supabase = createClient();
  try {
    const { data: trip } = await supabase
      .from('trips').select('id, name, kode_trip, departure, return_date, arrival').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip tidak ditemukan' };

    const { data: tp } = await supabase
      .from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
    const active = (tp || []).filter((p) =>
      p.status !== 'cancelled' &&
      p.transfer_status !== 'transferred' &&
      p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'
    );

    // Keterangan keluarga: grup per family_group_id (>=2 anggota aktif), nomor urut kemunculan.
    const _famCount = {};
    for (const p of active) if (p.family_group_id) _famCount[p.family_group_id] = (_famCount[p.family_group_id] || 0) + 1;
    const _famNo = {}; let _fc = 0;
    for (const p of active) { const fg = p.family_group_id; if (fg && _famCount[fg] >= 2 && !(fg in _famNo)) _famNo[fg] = ++_fc; }
    const _ket = (p) => (p.family_group_id && _famCount[p.family_group_id] >= 2)
      ? `Keluarga ${_famNo[p.family_group_id]} (${_famCount[p.family_group_id]} org)` : '-';

    const ids = active.map((p) => p.customer_id).filter(Boolean);
    let cmap = {};
    if (ids.length > 0) {
      const { data: cust } = await supabase.from('customers').select('*').in('id', ids);
      cmap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
    }
    const custByName = {}; for (const c of Object.values(cmap)) { if (c?.name) custByName[String(c.name).toLowerCase()] = c; }
    const paxByName = {}; for (const p of active) { const c = cmap[p.customer_id]; const nm = String(c?.name || '').toLowerCase(); if (nm) paxByName[nm] = p; }

    const rows = active.map((p, idx) => {
      const c = cmap[p.customer_id] || {};
      const g = normalizeGender({ gender: p.gender || p.sex || c.gender || c.sex });
      const first = c.first_name || (c.name ? c.name.split(' ')[0] : '');
      const last = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');
      const birth = c.birthday || c.dob || c.date_of_birth;
      return {
        no: idx + 1,
        first_name: first,
        last_name: last,
        gender: g === 'M' ? 'L' : g === 'F' ? 'P' : '',
        place_of_birth: c.place_of_birth || c.city || '',
        birth_date: fmtDate(birth),
        age: calcAge(birth) ?? '',
        passport_no: c.passport_no || c.passport_number || '',
        issue_date: fmtDate(c.passport_issued_date || c.issue_date),
        issuing_office: c.passport_issued_at || c.issuing_office || '',
        expiry_date: fmtDate(c.passport_expiry || c.expiry_date),
        phone: c.phone || c.whatsapp || '',
        keterangan: _ket(p),
        catatan: (p.notes || '').trim(),   // permintaan khusus: halal meals, kursi roda, dll
      };
    });

    // TL/Tim (crew) — ditambahkan di akhir manifest, keterangan = role (Tour Leader, dll).
    const crew = await fetchTripCrewResolved(tripId);
    crew.forEach((c, i) => {
      const g = normalizeGender({ gender: c.gender });
      const { first, last } = _splitName(c.name);
      const _role = c.role || 'Tour Leader';
      rows.push({
        no: rows.length + 1,
        first_name: first,
        last_name: last,
        gender: g === 'M' ? 'L' : g === 'F' ? 'P' : '',
        place_of_birth: c.place_of_birth || '',
        birth_date: fmtDate(c.birth_date),
        age: calcAge(c.birth_date) ?? '',
        passport_no: c.passport_no || '',
        issue_date: fmtDate(c.passport_issued_date),
        issuing_office: c.passport_issued_at || '',
        expiry_date: fmtDate(c.passport_expiry),
        phone: c.phone || '',
        keterangan: _role,
        catatan: `${_role}${c.notes ? ' — ' + c.notes : ''}`,
        is_crew: true,
      });
    });

    return {
      ok: true,
      trip: {
        name: trip.name, kode_trip: trip.kode_trip,
        departure: trip.departure, return: trip.return_date || trip.arrival,
      },
      rows,
    };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}

// Roomlist rows per trip — pakai final_roomlist tersimpan, kalau belum ada auto-generate.
import { generateRoomlist } from '@/lib/utils/roomlist';

function buildRmDetail(c = {}, pax = {}) {
  const _notes = String(pax.notes || '').trim();
  const first = c.first_name || (c.name ? c.name.split(' ')[0] : '');
  const last = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');
  const g = normalizeGender({ gender: pax.gender || pax.sex || c.gender || c.sex });
  const birth = c.birthday || c.dob || c.date_of_birth;
  const age = calcAge(birth);
  const title = g === 'M' ? 'Mr' : g === 'F' ? ((age != null && age < 18) ? 'Miss' : 'Mrs') : '';
  return {
    name: c.name || first || '', first_name: first, surname: last, title, gender: g,
    passport_no: c.passport_no || c.passport_number || c.ktp || '',
    place_of_birth: c.place_of_birth || c.city || '',
    birth_date: fmtDate(birth), birth_raw: birth || '', age: age == null ? '' : age,
    // Catatan peserta (halal meals, kursi roda, dll) → kolom Remarks di PDF roomlist
    remarks: _notes,
  };
}

export async function getRoomlistRows(tripId) {
  if (!tripId) return { error: 'tripId kosong' };
  const supabase = createClient();
  try {
    const { data: trip } = await supabase
      .from('trips').select('id, name, kode_trip, departure, return_date, arrival, final_roomlist').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip tidak ditemukan' };

    const { data: tp } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId);
    const active = (tp || []).filter((p) =>
      p.transfer_status !== 'transferred' &&
      p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'
    );
    const ids = active.map((p) => p.customer_id).filter(Boolean);
    let cmap = {};
    if (ids.length > 0) {
      const { data: cust } = await supabase.from('customers').select('*').in('id', ids);
      cmap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
    }
    const custByName = {}; for (const c of Object.values(cmap)) { if (c?.name) custByName[String(c.name).toLowerCase()] = c; }
    const paxByName = {}; for (const p of active) { const c = cmap[p.customer_id]; const nm = String(c?.name || '').toLowerCase(); if (nm) paxByName[nm] = p; }

    let rooms;
    const saved = trip.final_roomlist?.rooms;
    if (Array.isArray(saved) && saved.length > 0) {
      rooms = saved.map((r, i) => ({
        room_no: r.room_no || i + 1, room_type: r.room_type, label: r.label,
        is_family: r.is_family, note: r.note || '',
        members: (r.members || []).map((m) => {
          const nm = String(m.name || '').toLowerCase();
          const d = buildRmDetail(custByName[nm] || {}, paxByName[nm] || {});
          return { ...d, name: m.name || d.name, gender: m.gender || d.gender };
        }),
      }));
    } else {
      rooms = generateRoomlist(active, Object.values(cmap)).map((r) => ({
        room_no: r.room_no, room_type: r.room_type, label: r.label, is_family: r.is_family,
        note: r.needs_upgrade ? r.upgrade_note : '',
        members: (r.pax || []).map((p) => buildRmDetail(cmap[p.customer_id] || {}, p)),
      }));
    }

    // TL/Tim (crew) — tampil sebagai section terpisah "TL & TIM" di paling bawah roomlist.
    // Tidak masuk ringkasan jumlah kamar (bukan tipe kamar standar). Keterangan role di Remarks.
    const crew = await fetchTripCrewResolved(tripId);
    if (crew.length) {
      rooms = [...rooms, {
        room_no: rooms.length + 1,
        room_type: 'TL & TIM',
        label: 'TL & Tim',
        is_family: false,
        is_crew: true,
        note: '',
        members: crew.map((c) => {
          const g = normalizeGender({ gender: c.gender });
          const { first, last } = _splitName(c.name);
          const age = calcAge(c.birth_date);
          const title = g === 'M' ? 'Mr' : g === 'F' ? ((age != null && age < 18) ? 'Miss' : 'Mrs') : '';
          const _role = c.role || 'Tour Leader';
          return {
            name: c.name || first || '', first_name: first, surname: last, title, gender: g,
            passport_no: c.passport_no || '', place_of_birth: c.place_of_birth || '',
            birth_date: fmtDate(c.birth_date), birth_raw: c.birth_date || '', age: age == null ? '' : age,
            remarks: `${_role}${c.notes ? ' — ' + c.notes : ''}`,
          };
        }),
      }];
    }

    return { ok: true, trip: { name: trip.name, kode_trip: trip.kode_trip, departure: trip.departure, return_date: trip.return_date, arrival: trip.arrival, isFinal: Array.isArray(saved) && saved.length > 0 }, rooms };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}
