// Agregat tagihan invoice untuk keluarga (covers_passenger_ids) atau 1 peserta.
import { getExpectedAndPaidForPassenger } from '@/lib/actions/invoices';

export async function getInvoiceBilling(supabase, inv) {
  const ids = (inv?.is_family_invoice && Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length)
    ? inv.covers_passenger_ids
    : (inv?.passenger_id ? [inv.passenger_id] : []);

  const members = [];
  let expectedTotal = 0, pokokPaid = 0, sisa = 0, totalPaid = 0, addonPaid = 0, discount = 0;
  for (const pid of ids) {
    let s = {};
    try { s = await getExpectedAndPaidForPassenger(supabase, inv.trip_id, pid); } catch { s = {}; }
    let name = '';
    try {
      const { data: pax } = await supabase.from('trip_passengers').select('customer_id, room_type').eq('id', pid).maybeSingle();
      if (pax?.customer_id) { const { data: c } = await supabase.from('customers').select('name').eq('id', pax.customer_id).maybeSingle(); name = c?.name || ''; }
    } catch {}
    members.push({
      pid, name, roomType: s.roomType || '',
      expectedTotal: Number(s.expectedTotal) || 0, pokokPaid: Number(s.pokokPaid) || 0, sisa: Number(s.sisa) || 0,
      roomPrice: Number(s.roomPrice) || 0, tips: Number(s.tips) || 0, cityTax: Number(s.cityTax) || 0, flight: Number(s.flight) || 0, baggage: Number(s.baggage) || 0, baseFee: Number(s.baseFee) || 0,
    });
    expectedTotal += Number(s.expectedTotal) || 0;
    pokokPaid += Number(s.pokokPaid) || 0;
    sisa += Number(s.sisa) || 0;
    totalPaid += Number(s.totalPaid) || 0;
    addonPaid += Number(s.addonPaid) || 0;
    discount += Number(s.discount) || 0;
  }

  // Sisa di level keluarga: kelebihan bayar satu anggota menutup kekurangan anggota lain.
  sisa = Math.max(expectedTotal - pokokPaid, 0);

  // Nominal yang ditagih invoice ini (untuk bayar online): per-pax (×anggota) atau total invoice
  const perPaxMap = (inv?.passenger_amounts && typeof inv.passenger_amounts === 'object') ? inv.passenger_amounts : {};
  const hasCustom = Object.keys(perPaxMap).length > 0;
  let billedTotal;
  if (hasCustom) billedTotal = ids.reduce((t, pid) => t + (Number(perPaxMap[String(pid)] ?? perPaxMap[pid]) || 0), 0);
  else billedTotal = Number(inv?.amount) || 0;

  return { ids, members, expectedTotal, pokokPaid, sisa, totalPaid, addonPaid, discount, billedTotal, milestone: inv?.milestone || null, count: ids.length, isFamily: ids.length > 1 };
}
