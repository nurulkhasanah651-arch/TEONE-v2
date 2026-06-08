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
