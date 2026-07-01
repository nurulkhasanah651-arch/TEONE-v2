// CEO Dashboard — ringkasan eksekutif owner-only, brand-aware (TEONE/Khasanah terpisah).
// Additive: tidak mengubah halaman lain. Data real dari invoices, trip_passengers, trips, leads, refunds.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { fmtRupiah, fmtShort, fmtDate, daysUntil } from '@/lib/utils/format';
import { getRoleFromUser } from '@/lib/utils/roles';
import { getBrandCode } from '@/lib/brand';
import { BRAND_UI } from '@/lib/brand-shared';

export const dynamic = 'force-dynamic';

// ---- helper WIB (UTC+7) ----
const WIB = 7 * 3600 * 1000;
function wibMonth(ts) { if (!ts) return null; return new Date(new Date(ts).getTime() + WIB).toISOString().slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split('-');
  const nm = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${nm[+m - 1]} ${y.slice(2)}`;
}
function paxActive(p) {
  return p.status !== 'cancelled' && p.transfer_status !== 'transferred'
    && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}
const num = (v) => (v == null || isNaN(v) ? 0 : Number(v));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default async function CeoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Guard owner-only (defense-in-depth di luar sidebar)
  let role = getRoleFromUser(user);
  if (user?.id) {
    const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (u?.role) role = u.role;
  }
  if (role !== 'owner') redirect('/dashboard');

  const brand = getBrandCode();
  const ui = BRAND_UI[brand] || BRAND_UI.teone;

  const nowWib = new Date(Date.now() + WIB);
  const curMonth = nowWib.toISOString().slice(0, 7);
  const curYear = nowWib.toISOString().slice(0, 4);
  const prevMonth = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const todayStr = nowWib.toISOString().slice(0, 10);
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

  // ---- Omzet masuk (paid invoices) ----
  let omzetThisMonth = 0, omzetPrevMonth = 0, omzetYtd = 0, omzetAllTime = 0;
  const omzetByMonth = Object.fromEntries(months6.map((m) => [m, 0]));
  for (const iv of invoices) {
    if (iv.status !== 'paid') continue;
    const a = num(iv.amount);
    omzetAllTime += a;
    const mk = wibMonth(iv.paid_at);
    if (!mk) continue;
    if (mk === curMonth) omzetThisMonth += a;
    if (mk === prevMonth) omzetPrevMonth += a;
    if (mk.startsWith(curYear)) omzetYtd += a;
    if (mk in omzetByMonth) omzetByMonth[mk] += a;
  }
  // Outstanding tagihan (belum lunas)
  let outstanding = 0;
  for (const iv of invoices) if (['sent', 'partial', 'draft'].includes(iv.status)) outstanding += num(iv.amount);

  // ---- Peserta aktif: nilai kontrak + closing per bulan + per trip ----
  const activePax = pax.filter(paxActive);
  let bookedValue = 0;
  const closeByMonth = Object.fromEntries(months6.map((m) => [m, 0]));
  const seatByTrip = {}, valueByTrip = {};
  let closeThisMonth = 0, closePrevMonth = 0;
  for (const p of activePax) {
    const v = num(p.price_paid);
    bookedValue += v;
    seatByTrip[p.trip_id] = (seatByTrip[p.trip_id] || 0) + 1;
    valueByTrip[p.trip_id] = (valueByTrip[p.trip_id] || 0) + v;
    if (p.lead_source === 'master') continue; // Master Trip = bukan closing
    const mk = wibMonth(p.joined_at);
    if (mk === curMonth) closeThisMonth++;
    if (mk === prevMonth) closePrevMonth++;
    if (mk in closeByMonth) closeByMonth[mk]++;
  }

  // ---- Leads bulan ini ----
  let leadsThisMonth = 0;
  for (const l of leads) {
    if (!l.tanggal || l.tanggal.slice(0, 7) !== curMonth) continue;
    leadsThisMonth += num(l.leads_ig) + num(l.leads_tiktok) + num(l.leads_wa) + num(l.leads_fb)
      + num(l.leads_ads_meta) + num(l.leads_ads_google) + num(l.leads_ads_tiktok);
  }
  const convRate = pct(closeThisMonth, leadsThisMonth);

  // ---- Refund bulan ini ----
  let refundThisMonth = 0, refundCount = 0;
  for (const r of refunds) {
    if (!['approved', 'processed', 'done', 'completed', 'transferred'].includes(String(r.status || '').toLowerCase())) continue;
    const ts = r.processed_at || r.approved_at || r.created_at;
    if (wibMonth(ts) === curMonth) { refundThisMonth += num(r.refund_amount); refundCount++; }
  }

  // ---- Operasional trip ----
  const activeTrips = trips.filter((t) => ['open selling', 'prepare to sell'].includes(t.status));
  const upcoming = trips
    .filter((t) => t.departure && t.departure >= todayStr)
    .sort((a, b) => a.departure.localeCompare(b.departure));
  const upcoming30 = upcoming.filter((t) => daysUntil(t.departure) <= 30);
  let totalQuota = 0, totalSeat = 0;
  for (const t of activeTrips) { totalQuota += num(t.quota); totalSeat += num(seatByTrip[t.id]); }

  // ---- Top trip by nilai kontrak ----
  const topTrips = trips
    .map((t) => ({ ...t, seat: seatByTrip[t.id] || 0, value: valueByTrip[t.id] || 0 }))
    .filter((t) => t.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // ---- Delta % ----
  const omzetDelta = omzetPrevMonth > 0 ? Math.round(((omzetThisMonth - omzetPrevMonth) / omzetPrevMonth) * 100) : null;
  const closeDelta = closePrevMonth > 0 ? Math.round(((closeThisMonth - closePrevMonth) / closePrevMonth) * 100) : null;
  const maxOmzet = Math.max(1, ...months6.map((m) => omzetByMonth[m]));
  const maxClose = Math.max(1, ...months6.map((m) => closeByMonth[m]));

  // ---- Insight otomatis ----
  const insights = [];
  if (omzetDelta != null) insights.push(`Omzet masuk bulan ini ${omzetDelta >= 0 ? 'naik' : 'turun'} ${Math.abs(omzetDelta)}% dibanding bulan lalu (${fmtRupiah(omzetThisMonth)} vs ${fmtRupiah(omzetPrevMonth)}).`);
  else insights.push(`Omzet masuk bulan ini ${fmtRupiah(omzetThisMonth)}.`);
  if (closeDelta != null) insights.push(`Closing bulan ini ${closeThisMonth} pax (${closeDelta >= 0 ? '+' : ''}${closeDelta}% vs bulan lalu), conversion rate ${convRate}% dari ${leadsThisMonth} leads.`);
  else insights.push(`Closing bulan ini ${closeThisMonth} pax, conversion rate ${convRate}% dari ${leadsThisMonth} leads.`);
  if (outstanding > 0) insights.push(`Piutang belum lunas ${fmtRupiah(outstanding)} perlu ditindaklanjuti finance.`);
  if (topTrips[0]) insights.push(`Trip kontribusi terbesar: ${topTrips[0].kode_trip || topTrips[0].name} (${fmtRupiah(topTrips[0].value)}, ${topTrips[0].seat} pax).`);
  if (totalQuota > 0) insights.push(`Okupansi trip aktif ${pct(totalSeat, totalQuota)}% (${totalSeat}/${totalQuota} seat).`);

  const Delta = ({ v }) => v == null ? null : (
    <span className={`text-xs font-semibold ${v >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}%</span>
  );

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">🧠</span>
        <h1 className="text-2xl font-bold text-slate-800">CEO Dashboard</h1>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">OWNER</span>
      </div>
      <p className="text-sm text-slate-500 mb-5">Ringkasan eksekutif · {ui.label} · {monthLabel(curMonth)}</p>

      {/* Ringkasan Eksekutif */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">🧠 Ringkasan Eksekutif</p>
        <ul className="space-y-1.5 text-sm">
          {insights.map((t, i) => (<li key={i} className="flex gap-2"><span className="text-slate-400">•</span><span>{t}</span></li>))}
        </ul>
      </div>

      {/* KPI utama */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Omzet Masuk Bln Ini</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{fmtRupiah(omzetThisMonth)}</p>
          <div className="mt-1"><Delta v={omzetDelta} /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Closing Bln Ini</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{closeThisMonth} <span className="text-sm font-medium text-slate-400">pax</span></p>
          <div className="mt-1"><Delta v={closeDelta} /></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Conversion Rate</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{convRate}%</p>
          <p className="text-xs text-slate-400 mt-1">{leadsThisMonth} leads bln ini</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Piutang Belum Lunas</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{fmtRupiah(outstanding)}</p>
          <p className="text-xs text-slate-400 mt-1">tagihan sent/partial</p>
        </div>
      </div>

      {/* KPI sekunder */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Omzet YTD {curYear}</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{fmtRupiah(omzetYtd)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nilai Kontrak Aktif</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{fmtRupiah(bookedValue)}</p>
          <p className="text-xs text-slate-400 mt-1">{activePax.length} pax aktif</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Okupansi Trip Aktif</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{pct(totalSeat, totalQuota)}%</p>
          <p className="text-xs text-slate-400 mt-1">{totalSeat}/{totalQuota} seat · {activeTrips.length} trip</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Refund Bln Ini</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{fmtRupiah(refundThisMonth)}</p>
          <p className="text-xs text-slate-400 mt-1">{refundCount} transaksi</p>
        </div>
      </div>

      {/* Trend 6 bulan */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Omzet Masuk · 6 Bulan</p>
          <div className="flex items-end gap-2 h-40">
            {months6.map((m) => (
              <div key={m} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-slate-500 font-medium">{fmtShort(omzetByMonth[m])}</span>
                <div className="w-full rounded-t bg-gradient-to-t from-emerald-500 to-emerald-400" style={{ height: `${Math.max(4, (omzetByMonth[m] / maxOmzet) * 120)}px` }} />
                <span className="text-[10px] text-slate-400">{monthLabel(m)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Closing (pax) · 6 Bulan</p>
          <div className="flex items-end gap-2 h-40">
            {months6.map((m) => (
              <div key={m} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-slate-500 font-medium">{closeByMonth[m]}</span>
                <div className="w-full rounded-t bg-gradient-to-t from-blue-500 to-blue-400" style={{ height: `${Math.max(4, (closeByMonth[m] / maxClose) * 120)}px` }} />
                <span className="text-[10px] text-slate-400">{monthLabel(m)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top trip + Trip berangkat */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Top Trip · Nilai Kontrak</p>
          <div className="space-y-2">
            {topTrips.length === 0 && <p className="text-sm text-slate-400">Belum ada data.</p>}
            {topTrips.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg hover:bg-slate-50 px-2 py-1.5">
                <span className="text-sm text-slate-700 truncate">{t.kode_trip || t.name}<span className="text-slate-400"> · {t.seat} pax</span></span>
                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{fmtShort(t.value)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Trip Berangkat ≤ 30 Hari</p>
          <div className="space-y-2">
            {upcoming30.length === 0 && <p className="text-sm text-slate-400">Tidak ada keberangkatan dalam 30 hari.</p>}
            {upcoming30.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg hover:bg-slate-50 px-2 py-1.5">
                <span className="text-sm text-slate-700 truncate">{t.kode_trip || t.name}</span>
                <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">{fmtDate(t.departure)} · H-{daysUntil(t.departure)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
