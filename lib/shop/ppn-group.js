// Hitung PPN paket tour per group: expected + collected (yang sudah dibayar).
// Dipakai: tab Accounting PPN, income Estimate Profit & Real Proyeksi Group.
//  - KHASANAH: 1,1% dari PAKET TOUR (add-on negara lain), infant BEBAS.
//  - TEONE: 1,1% dari HARGA PAKET per kamar, SEMUA pax (termasuk infant/child no bed/land tour).
//    + PPN PERUSAHAAN (potensi): 1,1% dari biaya non-kamar yg ditanggung perusahaan
//      (base, flight/bagasi domestik, tips, perlengkapan, visa) — KECUALI city tax & asuransi.
// Path: lib/shop/ppn-group.js
import { getTourAddonTemplatesPublic } from '@/lib/shop/data';
import { tourPpnReg, ppnApplies } from '@/lib/utils/umroh-plus';
import { mainExpectedPerPassenger, paxRoomKey, mainAddonTotalForKey, visaPriceFor } from '@/lib/utils/price-breakdown';
import { currentBrandCode } from '@/lib/supabase/service-env';

function isActive(p) { return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'; }
function isInfant(p) { return p.age_type === 'infant' || String(p.room_type || '').toLowerCase().includes('infant'); }
function roomPriceOf(p, bd) {
  const k = paxRoomKey({ room_type: p.room_type, age_type: p.age_type });
  return Number(bd[k] || bd[p.room_type] || bd[String(p.room_type || '').toLowerCase()] || 0);
}
// Biaya non-kamar yg PPN-nya ditanggung PERUSAHAAN (TEONE). Semua item yg diisi KECUALI
// city tax & asuransi. = (base+flight+bagasi+tips+perlengkapan sesuai aturan kamar) − city tax + visa.
function companyBaseOf(p, bd, grpVisa) {
  const key = paxRoomKey({ room_type: p.room_type, age_type: p.age_type });
  if (key === 'infant') return 0;                                  // infant tanpa biaya wajib
  const main = Number(mainAddonTotalForKey(bd, key)) || 0;         // sudah termasuk city tax (aturan infant/child)
  const cityTax = (key === 'child_no_bed') ? 0 : (Number(bd.city_tax) || 0); // child_no_bed sudah tanpa city tax
  let base = Math.max(main - cityTax, 0);                          // buang city tax; asuransi memang bukan main addon
  if (!p.visa_ready && (grpVisa || p.include_visa)) base += Number(visaPriceFor(bd, p.visa_type)) || 0;
  return base;
}

// Return { [tripId]: { label, pax, tourTotal, ppnExpected, ppnCollected } }.
export async function computePpnByGroup(db, tripIds = null) {
  const out = {};
  if (!db) return out;
  let brand = 'teone'; try { brand = currentBrandCode(); } catch {}
  // PPN Khasanah DIBATALKAN (sementara) → tab PPN kosong utk Khasanah.
  if (brand === 'khasanah') return out;

  // TEONE: PPN hanya utk PENDAFTAR BARU (joined_at >= 2 Agu 2026). Bukan lagi berbasis keberangkatan,
  // jadi semua trip non-cancelled masuk kandidat; penyaringan per-pax dilakukan via ppnApplies().
  const { data: trips } = await db.from('trips')
    .select('id, name, departure, price_breakdown, status, visa_requirement');
  const relevant = [];
  for (const t of (trips || [])) {
    if (['cancelled'].includes(t.status)) continue;
    if (tripIds && !tripIds.map(String).includes(String(t.id))) continue;
    const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
    relevant.push({ id: t.id, bd, departure: t.departure, mode: 'teone', label: 'Paket Tour', grpVisa: String(t.visa_requirement || '') === 'group' });
  }
  if (!relevant.length) return out;

  const relIds = relevant.map((t) => t.id);
  let pax = [];
  // PENTING: paginate .range() — PostgREST cap 1000 baris. Tanpa ini, group Okt+ dgn total
  // pax > 1000 kepotong → jumlah pax per group tidak sesuai master trip.
  for (let i = 0; i < relIds.length; i += 100) {
    const idsChunk = relIds.slice(i, i + 100);
    let from = 0;
    for (;;) {
      const { data } = await db.from('trip_passengers')
        .select('id, trip_id, room_type, age_type, price_paid, discount_amount, transfer_status, refund_status, include_visa, visa_ready, visa_type, joined_at')
        .in('trip_id', idsChunk).range(from, from + 999);
      const rows = data || [];
      pax = pax.concat(rows);
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  pax = pax.filter(isActive);

  const paidByPax = {};
  const paxIds = pax.map((p) => p.id);
  for (let i = 0; i < paxIds.length; i += 300) {
    const idsChunk = paxIds.slice(i, i + 300);
    let from = 0;
    for (;;) {
      const { data } = await db.from('participant_payments')
        .select('passenger_id, amount, is_addon').in('passenger_id', idsChunk).range(from, from + 999);
      const rows = data || [];
      for (const r of rows) { if (r.is_addon === true) continue; paidByPax[r.passenger_id] = (paidByPax[r.passenger_id] || 0) + (Number(r.amount) || 0); }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  const byTrip = {}; for (const p of pax) (byTrip[p.trip_id] = byTrip[p.trip_id] || []).push(p);
  for (const t of relevant) {
    const list = byTrip[t.id] || [];
    let ppnExpected = 0, ppnCollected = 0, tourTotal = 0, cnt = 0;
    let coBase = 0, ppnCompany = 0;   // PPN Perusahaan (potensi) — TEONE
    for (const p of list) {
      // TEONE: hanya PENDAFTAR BARU (joined_at >= 2 Agu 2026) yang kena PPN. Peserta lama dilewati.
      if (!ppnApplies(brand, p.joined_at)) continue;
      const base = roomPriceOf(p, t.bd);
      const ppnPer = tourPpnReg(base, brand, p.joined_at);
      // PPN PESERTA (dari harga kamar). base bisa 0 utk pax yg tipe kamarnya tak kebaca.
      if (ppnPer > 0) {
        const mainExp = Number(mainExpectedPerPassenger(p, t.bd, brand)) || 0;
        const pokokGross = Number(p.price_paid) > 0 ? Number(p.price_paid) : mainExp;
        const pokokNet = Math.max(pokokGross - (Number(p.discount_amount) || 0), 0);
        const paid = paidByPax[p.id] || 0;
        // PPN dibayar PALING AKHIR: hanya terhitung setelah pokok lunas (kelebihan bayar di atas pokok).
        const col = Math.min(Math.max(paid - pokokNet, 0), ppnPer);
        ppnExpected += ppnPer; ppnCollected += col; tourTotal += base;
      }
      // PPN PERUSAHAAN (potensi) — dari biaya non-kamar (kecuali city tax & asuransi).
      const cb = companyBaseOf(p, t.bd, t.grpVisa);
      const cppn = tourPpnReg(cb, brand, p.joined_at);
      if (cppn > 0) { coBase += cb; ppnCompany += cppn; }
      cnt += 1;   // hitung hanya pax yg kena PPN (pendaftar baru)
    }
    if (cnt) out[t.id] = { label: t.label, pax: cnt, tourTotal, ppnExpected, ppnCollected, coBase, ppnCompany };
  }
  return out;
}
