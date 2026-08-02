// Hitung PPN paket tour per group (Khasanah): expected + collected (yang sudah dibayar).
// Dipakai: tab Accounting PPN, income Estimate Profit & Real Proyeksi Group.
// Path: lib/shop/ppn-group.js
import { getTourAddonTemplatesPublic } from '@/lib/shop/data';
import { detectTourAddon, tourPpn } from '@/lib/utils/umroh-plus';
import { mainExpectedPerPassenger } from '@/lib/utils/price-breakdown';

function isActive(p) { return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'; }
function isInfant(p) { return p.age_type === 'infant' || String(p.room_type || '').toLowerCase().includes('infant'); }

// Return { [tripId]: { label, pax, tourTotal, ppnExpected, ppnCollected } } — hanya trip
// "Umroh Plus" yg kena PPN (berangkat Okt 2026+ & terdeteksi paket tour).
export async function computePpnByGroup(db, tripIds = null) {
  const out = {};
  if (!db) return out;
  let tpl = [];
  try { tpl = await getTourAddonTemplatesPublic(); } catch {}
  if (!tpl.length) return out;

  // Trip kandidat: berangkat >= Okt 2026 (PPN mulai) + terdeteksi paket tour.
  let q = db.from('trips').select('id, name, departure, price_breakdown, status').gte('departure', '2026-10-01');
  const { data: trips } = await q;
  const relevant = [];
  for (const t of (trips || [])) {
    if (['cancelled'].includes(t.status)) continue;
    if (tripIds && !tripIds.map(String).includes(String(t.id))) continue;
    const addon = detectTourAddon(t.name, tpl);
    if (!addon || !(addon.amount > 0)) continue;
    const per = tourPpn(addon.amount, t.departure);
    if (per <= 0) continue;
    relevant.push({ id: t.id, name: t.name, departure: t.departure, bd: (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {}, addon, per });
  }
  if (!relevant.length) return out;

  const relIds = relevant.map((t) => t.id);
  // Peserta aktif non-infant untuk trip terkait.
  let pax = [];
  for (let i = 0; i < relIds.length; i += 100) {
    const { data } = await db.from('trip_passengers')
      .select('id, trip_id, room_type, age_type, price_paid, discount_amount, transfer_status, refund_status')
      .in('trip_id', relIds.slice(i, i + 100));
    pax = pax.concat(data || []);
  }
  pax = pax.filter((p) => isActive(p) && !isInfant(p));

  // Pembayaran pokok per peserta (semua non-addon) → utk proporsi collected.
  const paidByPax = {};
  const paxIds = pax.map((p) => p.id);
  for (let i = 0; i < paxIds.length; i += 400) {
    const { data } = await db.from('participant_payments')
      .select('passenger_id, amount, is_addon').in('passenger_id', paxIds.slice(i, i + 400));
    for (const r of (data || [])) { if (r.is_addon === true) continue; paidByPax[r.passenger_id] = (paidByPax[r.passenger_id] || 0) + (Number(r.amount) || 0); }
  }

  const byTrip = {}; for (const p of pax) (byTrip[p.trip_id] = byTrip[p.trip_id] || []).push(p);
  for (const t of relevant) {
    const list = byTrip[t.id] || [];
    let ppnExpected = 0, ppnCollected = 0;
    for (const p of list) {
      const mainExp = Number(mainExpectedPerPassenger(p, t.bd, 'khasanah')) || 0;
      const pokokGross = Number(p.price_paid) > 0 ? Number(p.price_paid) : mainExp;
      const exp = Math.max(pokokGross - (Number(p.discount_amount) || 0), 0) + t.per;
      const paid = paidByPax[p.id] || 0;
      const col = exp > 0 ? Math.round(t.per * Math.min(Math.max(paid / exp, 0), 1)) : 0;
      ppnExpected += t.per;
      ppnCollected += col;
    }
    if (list.length) out[t.id] = { label: t.addon.label, pax: list.length, tourTotal: t.addon.amount * list.length, ppnExpected, ppnCollected };
  }
  return out;
}
