'use server';

// Manifest paspor lengkap per trip — dipakai tombol Download di Portal TL,
// HPP Cashflow, dan tab Visa. Brand-aware (halaman ini di belakang middleware).
import { createClient } from '@/lib/supabase/server';
import { calcAge, fmtDate } from '@/lib/utils/format';
import { normalizeGender } from '@/lib/utils/roomlist';

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
      };
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
    birth_date: fmtDate(birth), age: age == null ? '' : age,
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

    return { ok: true, trip: { name: trip.name, kode_trip: trip.kode_trip, departure: trip.departure, return_date: trip.return_date, arrival: trip.arrival, isFinal: Array.isArray(saved) && saved.length > 0 }, rooms };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}
