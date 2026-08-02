// Hitung PPN paket tour per group: expected + collected (yang sudah dibayar).
// Dipakai: tab Accounting PPN, income Estimate Profit & Real Proyeksi Group.
//  - KHASANAH: 1,1% dari PAKET TOUR (add-on negara lain), infant BEBAS.
//  - TEONE: 1,1% dari HARGA PAKET per kamar, SEMUA pax (termasuk infant/child no bed/land tour).
// Path: lib/shop/ppn-group.js
import { getTourAddonTemplatesPublic } from '@/lib/shop/data';
import { detectTourAddon, tourPpn } from '@/lib/utils/umroh-plus';
import { mainExpectedPerPassenger, paxRoomKey } from '@/lib/utils/price-breakdown';
import { currentBrandCode } from '@/lib/supabase/service-env';

function isActive(p) { return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'; }
function isInfant(p) { return p.age_type === 'infant' || String(p.room_type || '').toLowerCase().includes('infant'); }
function roomPriceOf(p, bd) {
  const k = paxRoomKey({ room_type: p.room_type, age_type: p.age_type });
  return Number(bd[k] || bd[p.room_type] || bd[String(p.room_type || '').toLowerCase()] || 0);
}

// Return { [tripId]: { label, pax, tourTotal, ppnExpected, ppnCollected } }.
export async function computePpnByGroup(db, tripIds = null) {
  const out = {};
  if (!db) return out;
  let brand = 'teone'; try { brand = currentBrandCode(); } catch {}
  const isKh = brand === 'khasanah';

  let tpl = [];
  if (isKh) { try { tpl = await getTourAddonTemplatesPublic(); } catch {} if (!tpl.length) return out; }

  const { data: trips } = await db.from('trips')
    .select('id, name, departure, price_breakdown, status').gte('departure', '2026-10-01');
  const relevant = [];
  for (const t of (trips || [])) {
    if (['cancelled'].includes(t.status)) continue;
    if (tripIds && !tripIds.map(String).includes(String(t.id))) continue;
    const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
    if (isKh) {
      const addon = detectTourAddon(t.name, tpl);
      if (!addon || !(addon.amount > 0)) continue;
      const per = tourPpn(addon.amount, t.departure);
      if (per <= 0) continue;
      relevant.push({ id: t.id, bd, departure: t.departure, mode: 'kh', per, addonAmount: addon.amount, label: addon.label });
    } else {
      // TEONE: cukup cek keberangkatan Okt+ (base per pax dari harga kamar dihitung di bawah).
      if (tourPpn(1000000, t.departure) <= 0) continue;
      relevant.push({ id: t.id, bd, departure: t.departure, mode: 'teone', label: 'Paket Tour' });
    }
  }
  if (!relevant.length) return out;

  const relIds = relevant.map((t) => t.id);
  let pax = [];
  for (let i = 0; i < relIds.length; i += 100) {
    const { data } = await db.from('trip_passengers')
      .select('id, trip_id, room_type, age_type, price_paid, discount_amount, transfer_status, refund_status')
      .in('trip_id', relIds.slice(i, i + 100));
    pax = pax.concat(data || []);
  }
  pax = pax.filter(isActive);

  const paidByPax = {};
  const paxIds = pax.map((p) => p.id);
  for (let i = 0; i < paxIds.length; i += 400) {
    const { data } = await db.from('participant_payments')
      .select('passenger_id, amount, is_addon').in('passenger_id', paxIds.slice(i, i + 400));
    for (const r of (data || [])) { if (r.is_addon === true) continue; paidByPax[r.passenger_id] = (paidByPax[r.passenger_id] || 0) + (Number(r.amount) || 0); }
  }

  const byTrip = {}; for (const p of pax) (byTrip[p.trip_id] = byTrip[p.trip_id] || []).push(p);
  for (const t of relevant) {
    // Khasanah: infant bebas. TEONE: semua pax (termasuk infant/child/land tour).
    const list = (byTrip[t.id] || []).filter((p) => t.mode === 'teone' ? true : !isInfant(p));
    let ppnExpected = 0, ppnCollected = 0, tourTotal = 0, cnt = 0;
    for (const p of list) {
      const base = t.mode === 'kh' ? t.addonAmount : roomPriceOf(p, t.bd);
      const ppnPer = t.mode === 'kh' ? t.per : tourPpn(base, t.departure);
      if (ppnPer <= 0) continue;
      const mainExp = Number(mainExpectedPerPassenger(p, t.bd, brand)) || 0;
      const pokokGross = Number(p.price_paid) > 0 ? Number(p.price_paid) : mainExp;
      const exp = Math.max(pokokGross - (Number(p.discount_amount) || 0), 0) + ppnPer;
      const paid = paidByPax[p.id] || 0;
      const col = exp > 0 ? Math.round(ppnPer * Math.min(Math.max(paid / exp, 0), 1)) : 0;
      ppnExpected += ppnPer; ppnCollected += col; tourTotal += base; cnt += 1;
    }
    if (cnt) out[t.id] = { label: t.label, pax: cnt, tourTotal, ppnExpected, ppnCollected };
  }
  return out;
}
