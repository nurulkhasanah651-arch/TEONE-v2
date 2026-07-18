// Metrik CEO — dipakai halaman /ceo dan CEO AI (satu sumber angka, brand-aware).
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getBrandCode } from '@/lib/brand';
import { BRAND_UI } from '@/lib/brand-shared';
import { fmtRupiah, daysUntil } from '@/lib/utils/format';

const WIB = 7 * 3600 * 1000;
const num = (v) => (v == null || isNaN(v) ? 0 : Number(v));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
export function wibMonth(ts) { if (!ts) return null; return new Date(new Date(ts).getTime() + WIB).toISOString().slice(0, 7); }
function wibDay(ts) { if (!ts) return null; return new Date(new Date(ts).getTime() + WIB).getUTCDate(); }
export function monthLabel(key) {
  const [y, m] = key.split('-');
  const nm = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${nm[+m - 1]} ${y.slice(2)}`;
}
function paxActive(p) {
  return p.status !== 'cancelled' && p.transfer_status !== 'transferred'
    && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}

export async function buildCeoMetrics() {
  const supabase = createClient();
  const brand = getBrandCode();
  const ui = BRAND_UI[brand] || BRAND_UI.teone;

  const nowWib = new Date(Date.now() + WIB);
  const curMonth = nowWib.toISOString().slice(0, 7);
  const curYear = nowWib.toISOString().slice(0, 4);
  const prevMonth = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const todayStr = nowWib.toISOString().slice(0, 10);
  const dayOfMonth = nowWib.getUTCDate();
  const daysInMonth = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth() + 1, 0)).getUTCDate();
  const monthElapsedPct = pct(dayOfMonth, daysInMonth);
  const months6 = [];
  for (let i = 5; i >= 0; i--) months6.push(new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth() - i, 1)).toISOString().slice(0, 7));

  const [invArr, paxArr, tripsRes, leadsArr, refundsArr] = await Promise.all([
    fetchAll(() => supabase.from('invoices').select('amount, status, paid_at')),
    fetchAll(() => supabase.from('trip_passengers').select('trip_id, price_paid, status, refund_status, transfer_status, joined_at, lead_source')),
    supabase.from('trips').select('id, name, kode_trip, destination, quota, departure, status, harga_jual, price'),
    fetchAll(() => supabase.from('cs_daily_leads').select('tanggal, leads_ig, leads_tiktok, leads_wa, leads_fb, leads_ads_meta, leads_ads_google, leads_ads_tiktok')),
    fetchAll(() => supabase.from('refunds').select('refund_amount, status, approved_at, processed_at, created_at')),
  ]);
  const invoices = invArr || [];
  const pax = paxArr || [];
  const trips = tripsRes.data || [];
  const leads = leadsArr || [];
  const refunds = refundsArr || [];

  // Omzet: bulan ini (MTD), bulan lalu penuh, bulan lalu periode-sama (MTD), YTD
  let omzetThisMonth = 0, omzetPrevMonthFull = 0, omzetPrevMTD = 0, omzetYtd = 0, omzetAllTime = 0;
  const omzetByMonth = Object.fromEntries(months6.map((m) => [m, 0]));
  for (const iv of invoices) {
    if (iv.status !== 'paid') continue;
    const a = num(iv.amount); omzetAllTime += a;
    const mk = wibMonth(iv.paid_at); if (!mk) continue;
    if (mk === curMonth) omzetThisMonth += a;
    if (mk === prevMonth) { omzetPrevMonthFull += a; if (wibDay(iv.paid_at) <= dayOfMonth) omzetPrevMTD += a; }
    if (mk.startsWith(curYear)) omzetYtd += a;
    if (mk in omzetByMonth) omzetByMonth[mk] += a;
  }
  let outstanding = 0;
  for (const iv of invoices) if (['sent', 'partial', 'draft'].includes(iv.status)) outstanding += num(iv.amount);

  const activePax = pax.filter(paxActive);
  let bookedValue = 0;
  const closeByMonth = Object.fromEntries(months6.map((m) => [m, 0]));
  const seatByTrip = {}, valueByTrip = {};
  let closeThisMonth = 0, closePrevMonthFull = 0, closePrevMTD = 0;
  for (const p of activePax) {
    const v = num(p.price_paid); bookedValue += v;
    seatByTrip[p.trip_id] = (seatByTrip[p.trip_id] || 0) + 1;
    valueByTrip[p.trip_id] = (valueByTrip[p.trip_id] || 0) + v;
    if (p.lead_source === 'master') continue;
    const mk = wibMonth(p.joined_at);
    if (mk === curMonth) closeThisMonth++;
    if (mk === prevMonth) { closePrevMonthFull++; if (wibDay(p.joined_at) <= dayOfMonth) closePrevMTD++; }
    if (mk in closeByMonth) closeByMonth[mk]++;
  }

  let leadsThisMonth = 0;
  for (const l of leads) {
    if (!l.tanggal || l.tanggal.slice(0, 7) !== curMonth) continue;
    leadsThisMonth += num(l.leads_ig) + num(l.leads_tiktok) + num(l.leads_wa) + num(l.leads_fb)
      + num(l.leads_ads_meta) + num(l.leads_ads_google) + num(l.leads_ads_tiktok);
  }
  const convRate = pct(closeThisMonth, leadsThisMonth);

  let refundThisMonth = 0, refundCount = 0;
  for (const r of refunds) {
    if (!['approved', 'processed', 'done', 'completed', 'transferred'].includes(String(r.status || '').toLowerCase())) continue;
    const ts = r.processed_at || r.approved_at || r.created_at;
    if (wibMonth(ts) === curMonth) { refundThisMonth += num(r.refund_amount); refundCount++; }
  }

  // Okupansi "trip aktif" = semua trip yang BELUM berangkat & tidak dibatalkan
  // (termasuk yang sudah penuh / closed selling). Tidak bergantung status mentah yg bisa basi.
  const activeTrips = trips.filter((t) => t.status !== 'cancelled' && (!t.departure || t.departure >= todayStr));
  const upcoming = trips.filter((t) => t.departure && t.departure >= todayStr).sort((a, b) => a.departure.localeCompare(b.departure));
  const upcoming30 = upcoming.filter((t) => daysUntil(t.departure) <= 30)
    .map((t) => ({ id: t.id, kode: t.kode_trip || t.name, departure: t.departure, dm: daysUntil(t.departure), seat: seatByTrip[t.id] || 0, quota: num(t.quota) }));
  let totalQuota = 0, totalSeat = 0;
  for (const t of activeTrips) { totalQuota += num(t.quota); totalSeat += num(seatByTrip[t.id]); }

  const topTrips = trips
    .map((t) => ({ id: t.id, kode: t.kode_trip || t.name, destination: t.destination, seat: seatByTrip[t.id] || 0, quota: num(t.quota), value: valueByTrip[t.id] || 0 }))
    .filter((t) => t.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);

  // Delta apple-to-apple (MTD vs periode sama bulan lalu) — bukan vs bulan penuh
  const omzetDelta = omzetPrevMTD > 0 ? Math.round(((omzetThisMonth - omzetPrevMTD) / omzetPrevMTD) * 100) : null;
  const closeDelta = closePrevMTD > 0 ? Math.round(((closeThisMonth - closePrevMTD) / closePrevMTD) * 100) : null;
  // Proyeksi akhir bulan (run-rate kasar)
  const omzetProjection = dayOfMonth > 0 ? Math.round(omzetThisMonth / dayOfMonth * daysInMonth) : omzetThisMonth;
  const closeProjection = dayOfMonth > 0 ? Math.round(closeThisMonth / dayOfMonth * daysInMonth) : closeThisMonth;
  const occupancy = pct(totalSeat, totalQuota);

  const insights = [];
  insights.push(`Bulan ${monthLabel(curMonth)} baru berjalan ${dayOfMonth}/${daysInMonth} hari (${monthElapsedPct}%). Angka "bulan ini" masih parsial.`);
  if (omzetDelta != null) insights.push(`Omzet ${dayOfMonth} hari pertama ${fmtRupiah(omzetThisMonth)} — ${omzetDelta >= 0 ? 'naik' : 'turun'} ${Math.abs(omzetDelta)}% vs periode sama bulan lalu (${fmtRupiah(omzetPrevMTD)}). Proyeksi akhir bulan ~${fmtRupiah(omzetProjection)}.`);
  else insights.push(`Omzet ${dayOfMonth} hari pertama ${fmtRupiah(omzetThisMonth)}. Proyeksi akhir bulan ~${fmtRupiah(omzetProjection)}.`);
  if (closeDelta != null) insights.push(`Closing ${dayOfMonth} hari pertama ${closeThisMonth} pax (${closeDelta >= 0 ? '+' : ''}${closeDelta}% vs periode sama bulan lalu ${closePrevMTD} pax), conversion ${convRate}% dari ${leadsThisMonth} leads.`);
  else insights.push(`Closing ${dayOfMonth} hari pertama ${closeThisMonth} pax, conversion ${convRate}% dari ${leadsThisMonth} leads.`);
  if (outstanding > 0) insights.push(`Piutang belum lunas ${fmtRupiah(outstanding)} perlu ditindaklanjuti finance.`);
  if (topTrips[0]) insights.push(`Trip kontribusi terbesar: ${topTrips[0].kode} (${fmtRupiah(topTrips[0].value)}, ${topTrips[0].seat} pax).`);
  if (totalQuota > 0) insights.push(`Okupansi trip aktif ${occupancy}% (${totalSeat}/${totalQuota} seat).`);

  return {
    brand, brandLabel: ui.label, curMonth, curYear, prevMonth, months6,
    dayOfMonth, daysInMonth, monthElapsedPct,
    omzetThisMonth, omzetPrevMonthFull, omzetPrevMTD, omzetYtd, omzetAllTime, omzetDelta, omzetProjection, outstanding,
    bookedValue, activePaxCount: activePax.length,
    closeThisMonth, closePrevMonthFull, closePrevMTD, closeDelta, closeProjection,
    leadsThisMonth, convRate, refundThisMonth, refundCount,
    activeTripsCount: activeTrips.length, totalQuota, totalSeat, occupancy,
    omzetByMonth, closeByMonth, topTrips, upcoming30, insights,
  };
}

// Ringkasan teks kompak buat konteks LLM (grounding).
export function metricsToContext(m) {
  const rp = (n) => fmtRupiah(n);
  const trend = m.months6.map((k) => `${monthLabel(k)}: omzet ${rp(m.omzetByMonth[k])}, closing ${m.closeByMonth[k]} pax`).join('\n');
  const tops = m.topTrips.map((t, i) => `${i + 1}. ${t.kode}${t.destination ? ' (' + t.destination + ')' : ''} — ${rp(t.value)}, ${t.seat}/${t.quota || '?'} pax`).join('\n');
  const dep = m.upcoming30.length ? m.upcoming30.map((t) => `${t.kode}: ${t.departure} (H-${t.dm}), ${t.seat}/${t.quota || '?'} pax`).join('\n') : 'tidak ada';
  return `KONTEKS WAKTU (PENTING): Hari ini tanggal ${m.dayOfMonth} ${monthLabel(m.curMonth)}. Bulan berjalan BARU ${m.dayOfMonth} dari ${m.daysInMonth} hari (${m.monthElapsedPct}% berjalan). Semua angka "bulan ini" bersifat MTD/parsial — JANGAN dibandingkan langsung dengan bulan lalu yang sudah PENUH (itu menyesatkan). Gunakan perbandingan periode-yang-sama (MTD) dan proyeksi run-rate di bawah.

DATA PERUSAHAAN — ${m.brandLabel} (per ${m.dayOfMonth} ${monthLabel(m.curMonth)}):
- Omzet masuk bulan ini (MTD, ${m.dayOfMonth} hari): ${rp(m.omzetThisMonth)}
  · Periode sama bulan lalu (hari 1-${m.dayOfMonth}): ${rp(m.omzetPrevMTD)}${m.omzetDelta != null ? ` -> ${m.omzetDelta >= 0 ? '+' : ''}${m.omzetDelta}% apple-to-apple` : ''}
  · Bulan lalu PENUH (sebulan, hanya untuk konteks): ${rp(m.omzetPrevMonthFull)}
  · Proyeksi akhir bulan (run-rate kasar): ${rp(m.omzetProjection)}
- Omzet masuk YTD ${m.curYear}: ${rp(m.omzetYtd)}
- Nilai kontrak aktif (booked, belum tentu tertagih): ${rp(m.bookedValue)} dari ${m.activePaxCount} pax aktif
- Piutang belum lunas (invoice sent/partial/draft): ${rp(m.outstanding)}
- Closing bulan ini (MTD, ${m.dayOfMonth} hari): ${m.closeThisMonth} pax
  · Periode sama bulan lalu (hari 1-${m.dayOfMonth}): ${m.closePrevMTD} pax${m.closeDelta != null ? ` -> ${m.closeDelta >= 0 ? '+' : ''}${m.closeDelta}% apple-to-apple` : ''}
  · Bulan lalu PENUH: ${m.closePrevMonthFull} pax · Proyeksi akhir bulan: ${m.closeProjection} pax
- Leads bulan ini (MTD): ${m.leadsThisMonth}, conversion rate ${m.convRate}%
- Refund bulan ini: ${rp(m.refundThisMonth)} (${m.refundCount} transaksi)
- Trip aktif dijual: ${m.activeTripsCount}, okupansi ${m.occupancy}% (${m.totalSeat}/${m.totalQuota} seat)

TREND 6 BULAN (bulan berjalan = parsial):
${trend}

TOP TRIP (nilai kontrak):
${tops || 'belum ada'}

KEBERANGKATAN <= 30 HARI:
${dep}`;
}
