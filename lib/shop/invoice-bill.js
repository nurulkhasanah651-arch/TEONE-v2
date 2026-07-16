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
      visaExpected: Number(s.visaExpected) || 0, asuransiExpected: Number(s.asuransiExpected) || 0,
      visaPokok: Number(s.visaPokok) || 0, asuransiPokok: Number(s.asuransiPokok) || 0,
      pid, name, roomType: s.roomType || '',
      expectedTotal: Number(s.expectedTotal) || 0, pokokPaid: Number(s.pokokPaid) || 0, sisa: Number(s.sisa) || 0,
      roomPrice: Number(s.roomPrice) || 0, tips: Number(s.tips) || 0, cityTax: Number(s.cityTax) || 0, flight: Number(s.flight) || 0, baggage: Number(s.baggage) || 0, baseFee: Number(s.baseFee) || 0, perlengkapan: Number(s.perlengkapan) || 0,
      addonItems: Array.isArray(s.addonItems) ? s.addonItems : [],
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

  const visaExpected = members.reduce((a, m) => a + (m.visaExpected || 0), 0);
  const asuransiExpected = members.reduce((a, m) => a + (m.asuransiExpected || 0), 0);
  // Jumlah peserta yang BENAR-BENAR ditagih visa/asuransi (yg sudah 'ready visa' / tak ambil asuransi tidak dihitung)
  const visaCount = members.filter((m) => (m.visaExpected || 0) > 0).length;
  const asuransiCount = members.filter((m) => (m.asuransiExpected || 0) > 0).length;
  // Khasanah: visa & asuransi wajib, sudah di dalam pokok — ditampilkan sbg rincian, bukan opt-in.
  const visaPokok = members.reduce((a, m) => a + (m.visaPokok || 0), 0);
  const asuransiPokok = members.reduce((a, m) => a + (m.asuransiPokok || 0), 0);
  const visaPokokCount = members.filter((m) => (m.visaPokok || 0) > 0).length;
  const asuransiPokokCount = members.filter((m) => (m.asuransiPokok || 0) > 0).length;
  // Biaya tambahan (jadwal ulang, translate, dll) digabung per jenis se-keluarga.
  // Harus muncul sbg baris tagihan; kalau tidak, bayarannya mengurangi sisa tanpa pernah ditagih.
  const addonItems = (() => {
    const m = {};
    for (const mem of members) for (const it of (mem.addonItems || [])) {
      m[it.type] = (m[it.type] || 0) + (Number(it.amount) || 0);
    }
    return Object.entries(m).map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);
  })();
  return { ids, members, addonItems, expectedTotal, pokokPaid, sisa, totalPaid, addonPaid, discount, billedTotal, visaExpected, asuransiExpected, visaCount, asuransiCount, visaPokok, asuransiPokok, visaPokokCount, asuransiPokokCount, milestone: inv?.milestone || null, count: ids.length, isFamily: ids.length > 1 };
}
