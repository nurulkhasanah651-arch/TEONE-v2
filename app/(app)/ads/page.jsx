// Round 152: Ads Manager — FULL (Channel ROI + Avg Days + Per-Trip Performance)
// Supersedes R149, R151
// Path: app/(app)/ads/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import AdsManager from '@/components/ads/AdsManager';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const r = await promise; return r.data || fallback; } catch { return fallback; }
}

const CHANNELS = {
  meta:       { label: 'Meta (FB/IG) Ads', icon: '📱', color: 'bg-blue-50 border-blue-200 text-blue-800',     paid: true,  source: 'ads_meta' },
  google:     { label: 'Google Ads',       icon: '🔍', color: 'bg-red-50 border-red-200 text-red-800',         paid: true,  source: 'ads_google' },
  tiktok:     { label: 'TikTok Ads',       icon: '🎵', color: 'bg-pink-50 border-pink-200 text-pink-800',     paid: true,  source: 'ads_tiktok' },
  instagram:  { label: 'Instagram Organik',icon: '📸', color: 'bg-purple-50 border-purple-200 text-purple-800',paid: false, source: 'instagram' },
  whatsapp:   { label: 'WhatsApp Organik', icon: '💬', color: 'bg-green-50 border-green-200 text-green-800',  paid: false, source: 'whatsapp' },
  offline:    { label: 'Offline / Walk-in',icon: '🏪', color: 'bg-amber-50 border-amber-200 text-amber-800',  paid: false, source: 'offline' },
  alumni:     { label: 'Alumni Referral',  icon: '🎓', color: 'bg-indigo-50 border-indigo-200 text-indigo-800',paid: false, source: 'alumni' },
  mitra:      { label: 'Mitra Partnership',icon: '🤝', color: 'bg-teal-50 border-teal-200 text-teal-800',     paid: false, source: 'mitra' },
};

// channel key untuk closings di cs_daily_updates
function csClosingFieldsByChannel(c) {
  return {
    meta:      c.from_ads_meta   || 0,
    google:    c.from_ads_google || 0,
    tiktok:    c.from_ads_tiktok || 0,
    instagram: c.from_instagram  || 0,
    whatsapp:  c.from_whatsapp   || 0,
    offline:   c.from_offline    || 0,
    alumni:    c.closing_alumni  || 0,
    mitra:     c.closing_mitra   || 0,
  };
}

function mapLeadSourceToChannel(source) {
  if (!source) return null;
  const s = String(source).toLowerCase();
  if (s === 'ads_meta')   return 'meta';
  if (s === 'ads_google') return 'google';
  if (s === 'ads_tiktok') return 'tiktok';
  if (s === 'instagram')  return 'instagram';
  if (s === 'whatsapp')   return 'whatsapp';
  if (s === 'offline')    return 'offline';
  if (s === 'alumni')     return 'alumni';
  if (s === 'mitra')      return 'mitra';
  return null;
}

export default async function AdsManagerPage({ searchParams }) {
  const sp = await searchParams;
  const filterMonth = sp?.month || new Date().toISOString().slice(0, 7);

  const supabase = createClient();
  const [adsEntries, csUpdates, trips, trip_passengers] = await Promise.all([
    safeQuery(supabase.from('ads_entries').select('*').order('date', { ascending: false })),
    safeQuery(supabase.from('cs_daily_updates').select('*')),
    safeQuery(supabase.from('trips').select('id, kode_trip, name, status, publish_date, closed_at, departure, sold, quota, price')),
    safeQuery(supabase.from('trip_passengers').select('id, trip_id, customer_id, price_paid, lead_source, days_to_close, closing_date')),
  ]);

  const adsThisMonth = adsEntries.filter((e) => (e.date || '').startsWith(filterMonth));
  const csThisMonth = csUpdates.filter((c) => (c.tanggal || '').startsWith(filterMonth));
  const pxThisMonth = trip_passengers.filter((p) => (p.closing_date || '').startsWith(filterMonth));

  // ============ CHANNEL STATS (all channels, bulan ini) ============
  const stats = {};
  Object.keys(CHANNELS).forEach((k) => {
    stats[k] = { spend: 0, leads: 0, closings: 0, revenue: 0, days_arr: [] };
  });

  for (const p of pxThisMonth) {
    if (p.days_to_close == null) continue;
    const channelKey = mapLeadSourceToChannel(p.lead_source);
    if (channelKey && stats[channelKey]) {
      stats[channelKey].days_arr.push(p.days_to_close);
    }
  }

  for (const e of adsThisMonth) {
    const p = stats[e.platform];
    if (p) {
      p.spend += Number(e.spend) || 0;
      p.leads += e.leads || 0;
    }
  }

  for (const c of csThisMonth) {
    const cf = csClosingFieldsByChannel(c);
    for (const k of Object.keys(stats)) {
      stats[k].closings += cf[k] || 0;
    }
    if (c.leads_ads_meta)   stats.meta.leads   += c.leads_ads_meta;
    if (c.leads_ads_google) stats.google.leads += c.leads_ads_google;
    if (c.leads_ads_tiktok) stats.tiktok.leads += c.leads_ads_tiktok;
  }

  const totalRevenueAllChannels = trip_passengers.reduce((s, p) => s + (Number(p.price_paid) || 0), 0);
  const avgTicket = trip_passengers.length > 0 ? totalRevenueAllChannels / trip_passengers.length : 0;
  Object.keys(stats).forEach((k) => {
    stats[k].revenue = stats[k].closings * avgTicket;
  });

  // Totals
  const totalSpend = Object.values(stats).reduce((s, p) => s + p.spend, 0);
  const totalLeads = Object.values(stats).reduce((s, p) => s + p.leads, 0);
  const totalClosings = Object.values(stats).reduce((s, p) => s + p.closings, 0);
  const totalRevenue = Object.values(stats).reduce((s, p) => s + p.revenue, 0);
  const cac = totalClosings > 0 ? totalSpend / totalClosings : 0;
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const convRate = totalLeads > 0 ? (totalClosings / totalLeads * 100) : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const allDays = Object.values(stats).flatMap((s) => s.days_arr);
  const avgDaysOverall = allDays.length > 0
    ? Math.round((allDays.reduce((a, b) => a + b, 0) / allDays.length) * 10) / 10
    : null;

  const channelMetrics = Object.entries(stats).map(([key, st]) => {
    const cfg = CHANNELS[key];
    const cacP = st.closings > 0 ? st.spend / st.closings : 0;
    const cplP = st.leads > 0 ? st.spend / st.leads : 0;
    const convP = st.leads > 0 ? (st.closings / st.leads * 100) : 0;
    const roasP = st.spend > 0 ? st.revenue / st.spend : (cfg.paid ? 0 : Infinity);
    const avgDays = st.days_arr.length > 0
      ? Math.round((st.days_arr.reduce((a, b) => a + b, 0) / st.days_arr.length) * 10) / 10
      : null;
    const score = cfg.paid
      ? (st.closings > 0 ? (roasP * 10 - cacP / 100000) : 0)
      : st.closings * 100;

    return { key, cfg, ...st, cac: cacP, cpl: cplP, conv: convP, roas: roasP, avgDays, tracked: st.days_arr.length, score };
  }).sort((a, b) => b.score - a.score);

  const topChannel = channelMetrics[0];
  const worstPaid = channelMetrics
    .filter((c) => c.cfg.paid && c.spend > 0)
    .sort((a, b) => a.roas - b.roas)[0];
  const channelsWithDays = channelMetrics.filter((c) => c.avgDays != null);
  const fastestChannel = [...channelsWithDays].sort((a, b) => a.avgDays - b.avgDays)[0];
  const slowestChannel = [...channelsWithDays].sort((a, b) => b.avgDays - a.avgDays)[0];

  // ============ R152: PER-TRIP STATS ============
  // Hanya trips yang aktif/closed-recently, atau yang ada activity
  const tripMap = new Map(trips.map((t) => [String(t.id), t]));

  const tripStats = {};  // tripId -> {spend, closings, revenue, leads, days_arr, byChannel}
  function ensureTrip(tripId) {
    const idStr = String(tripId);
    if (!tripStats[idStr]) {
      tripStats[idStr] = {
        trip: tripMap.get(idStr) || null,
        spend: 0, closings: 0, revenue: 0, leads: 0,
        days_arr: [],
        byChannel: {}, // channelKey -> {spend, closings, leads}
      };
      Object.keys(CHANNELS).forEach((k) => {
        tripStats[idStr].byChannel[k] = { spend: 0, closings: 0, leads: 0 };
      });
    }
    return tripStats[idStr];
  }

  // ads_entries → spend per trip (only entries with trip_id)
  for (const e of adsThisMonth) {
    if (!e.trip_id) continue;
    const ts = ensureTrip(e.trip_id);
    ts.spend += Number(e.spend) || 0;
    ts.leads += e.leads || 0;
    if (ts.byChannel[e.platform]) {
      ts.byChannel[e.platform].spend += Number(e.spend) || 0;
      ts.byChannel[e.platform].leads += e.leads || 0;
    }
  }

  // cs_daily_updates → closings per channel per trip
  for (const c of csThisMonth) {
    if (!c.trip_id) continue;
    const ts = ensureTrip(c.trip_id);
    const cf = csClosingFieldsByChannel(c);
    for (const k of Object.keys(CHANNELS)) {
      const n = cf[k] || 0;
      ts.closings += n;
      ts.byChannel[k].closings += n;
    }
    if (c.leads_ads_meta)   { ts.leads += c.leads_ads_meta;   ts.byChannel.meta.leads   += c.leads_ads_meta; }
    if (c.leads_ads_google) { ts.leads += c.leads_ads_google; ts.byChannel.google.leads += c.leads_ads_google; }
    if (c.leads_ads_tiktok) { ts.leads += c.leads_ads_tiktok; ts.byChannel.tiktok.leads += c.leads_ads_tiktok; }
  }

  // trip_passengers → revenue + days per trip
  for (const p of pxThisMonth) {
    if (!p.trip_id) continue;
    const ts = ensureTrip(p.trip_id);
    ts.revenue += Number(p.price_paid) || 0;
    if (p.days_to_close != null) ts.days_arr.push(p.days_to_close);
  }

  const tripMetrics = Object.entries(tripStats).map(([tripId, ts]) => {
    const trip = ts.trip;
    const cacT = ts.closings > 0 ? ts.spend / ts.closings : 0;
    const roasT = ts.spend > 0 ? ts.revenue / ts.spend : (ts.closings > 0 ? Infinity : 0);
    const avgDays = ts.days_arr.length > 0
      ? Math.round((ts.days_arr.reduce((a, b) => a + b, 0) / ts.days_arr.length) * 10) / 10
      : null;
    // top channel for this trip = paling banyak closings
    let topCh = null;
    let maxC = 0;
    for (const [k, v] of Object.entries(ts.byChannel)) {
      if (v.closings > maxC) { maxC = v.closings; topCh = k; }
    }
    return {
      tripId,
      trip,
      spend: ts.spend,
      leads: ts.leads,
      closings: ts.closings,
      revenue: ts.revenue,
      cac: cacT,
      roas: roasT,
      avgDays,
      topChannel: topCh,
      topChannelClosings: maxC,
    };
  }).filter((t) => t.trip != null) // skip kalau trip udah dihapus
    .sort((a, b) => {
      // sort by total activity (closings desc, then spend desc)
      if (b.closings !== a.closings) return b.closings - a.closings;
      return b.spend - a.spend;
    });

  // best & worst trip
  const tripsWithSpend = tripMetrics.filter((t) => t.spend > 0);
  const bestTrip = tripsWithSpend.length > 0
    ? [...tripsWithSpend].sort((a, b) => b.roas - a.roas)[0]
    : null;
  const worstTrip = tripsWithSpend.length > 0
    ? [...tripsWithSpend].sort((a, b) => a.roas - b.roas)[0]
    : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">📢 Ads Manager — Channel & Trip ROI</h1>
        <p className="mt-1 text-slate-600">
          Performa per channel + per trip · CAC · ROAS · Speed-to-Close · Rekomendasi budget
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Bulan:</span>
        <form action="/ads" method="get" className="flex items-center gap-2">
          <input autoComplete="off" type="month" name="month" defaultValue={filterMonth} className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <button type="submit" className="px-3 py-1.5 bg-brand-500 text-white text-sm font-semibold rounded">Filter</button>
        </form>
      </div>

      {/* TOP STATS */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <StatCard label="💰 Ad Spend" value={fmtRupiah(totalSpend)} sub={`${adsThisMonth.length} entry`} color="bg-amber-50 text-amber-700" />
        <StatCard label="🎯 Leads" value={totalLeads.toLocaleString('id-ID')} color="bg-blue-50 text-blue-700" />
        <StatCard label="✓ Closings" value={totalClosings.toLocaleString('id-ID')} color="bg-green-50 text-green-700" />
        <StatCard label="💵 CAC" value={fmtRupiah(cac)} sub="Cost per closing" color="bg-purple-50 text-purple-700" />
        <StatCard label="📊 Conv Rate" value={`${convRate.toFixed(1)}%`} sub={`CPL ${fmtRupiah(cpl)}`} color="bg-indigo-50 text-indigo-700" />
        <StatCard label="🚀 ROAS" value={`${roas.toFixed(1)}x`} sub={`Rev: ${fmtRupiah(totalRevenue)}`} color="bg-pink-50 text-pink-700" />
        <StatCard
          label="⏱ Avg Speed"
          value={avgDaysOverall != null ? `${avgDaysOverall}d` : '—'}
          sub={avgDaysOverall != null ? `${allDays.length} tracked` : 'Belum ada data'}
          color="bg-emerald-50 text-emerald-700"
        />
      </div>

      {/* CHANNEL RECOMMENDATIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {topChannel && topChannel.closings > 0 && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
            <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1">🏆 Top Channel</p>
            <p className="text-lg font-bold text-green-900">{topChannel.cfg.icon} {topChannel.cfg.label}</p>
            <p className="text-sm text-green-700 mt-1">
              {topChannel.closings} closings ·
              {topChannel.cfg.paid
                ? ` ROAS ${topChannel.roas.toFixed(1)}x · CAC ${fmtRupiah(topChannel.cac)}`
                : ` Free · ${fmtRupiah(topChannel.revenue)} rev`}
              {topChannel.avgDays != null && <> · ⏱ {topChannel.avgDays}d</>}
            </p>
            <p className="text-xs text-green-700 italic mt-2">
              💡 Scale up channel ini. {topChannel.cfg.paid ? 'Naikin budget 30-50%.' : 'Invest ke konten/community.'}
            </p>
          </div>
        )}

        {worstPaid && worstPaid.spend > 0 && worstPaid.roas < 2 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
            <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-1">⚠ Underperformer Channel</p>
            <p className="text-lg font-bold text-red-900">{worstPaid.cfg.icon} {worstPaid.cfg.label}</p>
            <p className="text-sm text-red-700 mt-1">
              Spend {fmtRupiah(worstPaid.spend)} → {worstPaid.closings} closing · ROAS {worstPaid.roas.toFixed(1)}x
            </p>
            <p className="text-xs text-red-700 italic mt-2">
              💡 {worstPaid.roas < 1 ? 'Pause atau review creative. Loss.' : 'Optimize. Kalau bulan depan masih <2x, cut.'}
            </p>
          </div>
        )}
      </div>

      {/* SPEED INSIGHTS */}
      {(fastestChannel || slowestChannel) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fastestChannel && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4">
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">⚡ Fastest Closing</p>
              <p className="text-lg font-bold text-emerald-900">{fastestChannel.cfg.icon} {fastestChannel.cfg.label}</p>
              <p className="text-sm text-emerald-700 mt-1">
                Avg <strong>{fastestChannel.avgDays} hari</strong> · {fastestChannel.tracked} peserta tracked
              </p>
            </div>
          )}
          {slowestChannel && slowestChannel.key !== fastestChannel?.key && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
              <p className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-1">🐢 Slowest Closing</p>
              <p className="text-lg font-bold text-orange-900">{slowestChannel.cfg.icon} {slowestChannel.cfg.label}</p>
              <p className="text-sm text-orange-700 mt-1">
                Avg <strong>{slowestChannel.avgDays} hari</strong> · butuh nurturing
              </p>
            </div>
          )}
        </div>
      )}

      {/* CHANNEL PERFORMANCE TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-brand-700">📊 Performa per Channel</h2>
          <p className="text-xs text-slate-500 mt-0.5">Bulan {filterMonth} · {Object.keys(CHANNELS).length} channels · ⏱ = Avg hari chat→closing</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Channel</th>
                <th className="px-3 py-2 text-right">Spend</th>
                <th className="px-3 py-2 text-right">Leads</th>
                <th className="px-3 py-2 text-right">Closings</th>
                <th className="px-3 py-2 text-right">Conv %</th>
                <th className="px-3 py-2 text-right">CPL</th>
                <th className="px-3 py-2 text-right">CAC</th>
                <th className="px-3 py-2 text-right">Revenue Est</th>
                <th className="px-3 py-2 text-right">ROAS</th>
                <th className="px-3 py-2 text-right">⏱ Avg</th>
                <th className="px-3 py-2 text-left">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channelMetrics.map((c) => {
                const verdict = c.cfg.paid
                  ? (c.spend === 0 ? 'no spend' : c.roas >= 5 ? '🟢 Excellent' : c.roas >= 3 ? '🟢 Good' : c.roas >= 2 ? '🟡 OK' : c.roas >= 1 ? '🟡 Break-even' : '🔴 Loss')
                  : (c.closings > 0 ? '🟢 Free win' : '⚪ Sleeping');
                const verdictColor = verdict.startsWith('🟢') ? 'text-green-700' : verdict.startsWith('🟡') ? 'text-amber-700' : verdict.startsWith('🔴') ? 'text-red-700' : 'text-slate-500';

                const daysBadge = c.avgDays == null
                  ? <span className="text-slate-400 text-xs">—</span>
                  : c.avgDays <= 3
                    ? <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">{c.avgDays}d ⚡</span>
                    : c.avgDays <= 14
                      ? <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs font-bold">{c.avgDays}d</span>
                      : <span className="inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-xs font-bold">{c.avgDays}d 🐢</span>;

                return (
                  <tr key={c.key} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${c.cfg.color}`}>
                        <span>{c.cfg.icon}</span>
                        <span className="font-semibold text-xs">{c.cfg.label}</span>
                        {c.cfg.paid && <span className="text-[9px] px-1 py-0.5 rounded bg-white/50 font-bold">PAID</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {c.cfg.paid ? fmtRupiah(c.spend) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{c.leads || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 text-right font-bold">{c.closings}</td>
                    <td className="px-3 py-2 text-right text-xs">{c.leads > 0 ? `${c.conv.toFixed(0)}%` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{c.cfg.paid && c.leads > 0 ? fmtRupiah(c.cpl) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{c.cfg.paid && c.closings > 0 ? fmtRupiah(c.cac) : (c.cfg.paid ? '—' : 'FREE')}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-green-700">{fmtRupiah(c.revenue)}</td>
                    <td className="px-3 py-2 text-right">
                      {c.cfg.paid
                        ? (c.spend > 0 ? <span className={`font-bold ${c.roas >= 3 ? 'text-green-700' : c.roas >= 1 ? 'text-amber-700' : 'text-red-700'}`}>{c.roas.toFixed(1)}x</span> : '—')
                        : <span className="text-green-700 font-bold">∞</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{daysBadge}</td>
                    <td className={`px-3 py-2 text-xs font-bold ${verdictColor}`}>{verdict}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-bold border-t-2 border-slate-200">
              <tr>
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmtRupiah(totalSpend)}</td>
                <td className="px-3 py-2 text-right font-mono">{totalLeads}</td>
                <td className="px-3 py-2 text-right font-mono">{totalClosings}</td>
                <td className="px-3 py-2 text-right text-xs">{convRate.toFixed(0)}%</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmtRupiah(cpl)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmtRupiah(cac)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-green-700">{fmtRupiah(totalRevenue)}</td>
                <td className="px-3 py-2 text-right text-xs">{roas.toFixed(1)}x</td>
                <td className="px-3 py-2 text-right text-xs">{avgDaysOverall != null ? `${avgDaysOverall}d` : '—'}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ============ R152: PER-TRIP RECOMMENDATIONS ============ */}
      {(bestTrip || worstTrip) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bestTrip && bestTrip.roas >= 2 && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
              <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1">🏆 Best Trip ROI</p>
              <p className="text-lg font-bold text-green-900">
                {bestTrip.trip.kode_trip || `#${bestTrip.trip.id}`} — {bestTrip.trip.name}
              </p>
              <p className="text-sm text-green-700 mt-1">
                {bestTrip.closings} closing · Spend {fmtRupiah(bestTrip.spend)} · Revenue {fmtRupiah(bestTrip.revenue)} · <strong>ROAS {bestTrip.roas === Infinity ? '∞' : bestTrip.roas.toFixed(1) + 'x'}</strong>
              </p>
              <p className="text-xs text-green-700 italic mt-2">
                💡 Trip ini paling profitable. Replicate creative & targeting untuk trip serupa.
              </p>
            </div>
          )}
          {worstTrip && worstTrip.roas < 1.5 && worstTrip.spend > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
              <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-1">⚠ Worst Trip ROI</p>
              <p className="text-lg font-bold text-red-900">
                {worstTrip.trip.kode_trip || `#${worstTrip.trip.id}`} — {worstTrip.trip.name}
              </p>
              <p className="text-sm text-red-700 mt-1">
                {worstTrip.closings} closing · Spend {fmtRupiah(worstTrip.spend)} · ROAS {worstTrip.roas.toFixed(1)}x
              </p>
              <p className="text-xs text-red-700 italic mt-2">
                💡 Cut budget atau ganti creative. Kalau quota masih jauh, push organik (alumni/IG).
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============ R152: PER-TRIP PERFORMANCE TABLE ============ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-brand-50 to-blue-50">
          <h2 className="font-bold text-brand-700">✈ Performa per Trip</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tracking spend, closing, ROAS, dan speed-to-close per trip · Bulan {filterMonth}
          </p>
        </div>

        {tripMetrics.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p className="text-sm">Belum ada activity trip di bulan ini.</p>
            <p className="text-xs mt-1">Pastikan ads_entries pakai field <strong>trip_id</strong> supaya bisa ke-track per trip.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Trip</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Sold / Quota</th>
                  <th className="px-3 py-2 text-right">Spend</th>
                  <th className="px-3 py-2 text-right">Leads</th>
                  <th className="px-3 py-2 text-right">Closings</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2 text-right">CAC</th>
                  <th className="px-3 py-2 text-right">ROAS</th>
                  <th className="px-3 py-2 text-right">⏱ Avg</th>
                  <th className="px-3 py-2 text-left">Top Channel</th>
                  <th className="px-3 py-2 text-left">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tripMetrics.map((t) => {
                  const verdict = t.spend === 0
                    ? (t.closings > 0 ? '🟢 Free' : '⚪ Idle')
                    : t.roas >= 5 ? '🟢 Excellent'
                    : t.roas >= 3 ? '🟢 Good'
                    : t.roas >= 2 ? '🟡 OK'
                    : t.roas >= 1 ? '🟡 Break-even'
                    : '🔴 Loss';
                  const verdictColor = verdict.startsWith('🟢') ? 'text-green-700'
                    : verdict.startsWith('🟡') ? 'text-amber-700'
                    : verdict.startsWith('🔴') ? 'text-red-700'
                    : 'text-slate-500';
                  const topChCfg = t.topChannel ? CHANNELS[t.topChannel] : null;
                  const quotaPct = (t.trip.quota || 0) > 0 ? ((t.trip.sold || 0) / t.trip.quota * 100) : 0;
                  const tripStatusColor =
                    t.trip.status === 'closed' ? 'bg-slate-100 text-slate-700'
                    : t.trip.status === 'open' ? 'bg-green-100 text-green-700'
                    : t.trip.status === 'departed' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700';

                  const daysBadge = t.avgDays == null
                    ? <span className="text-slate-400 text-xs">—</span>
                    : t.avgDays <= 3
                      ? <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">{t.avgDays}d ⚡</span>
                      : t.avgDays <= 14
                        ? <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs font-bold">{t.avgDays}d</span>
                        : <span className="inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-xs font-bold">{t.avgDays}d 🐢</span>;

                  return (
                    <tr key={t.tripId} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link href={`/trips/${t.tripId}`} className="font-bold text-brand-700 hover:underline text-sm">
                          {t.trip.kode_trip || `#${t.tripId}`}
                        </Link>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{t.trip.name}</div>
                        {t.trip.departure && (
                          <div className="text-[10px] text-slate-400">DEP: {fmtDate(t.trip.departure)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tripStatusColor}`}>
                          {t.trip.status || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        <div className="font-bold">{t.trip.sold || 0}/{t.trip.quota || 0}</div>
                        <div className="text-[10px] text-slate-400">{quotaPct.toFixed(0)}% filled</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{t.spend > 0 ? fmtRupiah(t.spend) : <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2 text-right font-mono">{t.leads || <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2 text-right font-bold">{t.closings}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-green-700">{fmtRupiah(t.revenue)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{t.closings > 0 && t.spend > 0 ? fmtRupiah(t.cac) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {t.spend > 0
                          ? <span className={`font-bold ${t.roas >= 3 ? 'text-green-700' : t.roas >= 1 ? 'text-amber-700' : 'text-red-700'}`}>{t.roas === Infinity ? '∞' : t.roas.toFixed(1) + 'x'}</span>
                          : (t.closings > 0 ? <span className="text-green-700 font-bold">∞</span> : '—')}
                      </td>
                      <td className="px-3 py-2 text-right">{daysBadge}</td>
                      <td className="px-3 py-2">
                        {topChCfg ? (
                          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${topChCfg.color}`}>
                            <span>{topChCfg.icon}</span>
                            <span className="font-bold">{t.topChannelClosings}</span>
                          </div>
                        ) : <span className="text-slate-400 text-xs">—</span>}
                      </td>
                      <td className={`px-3 py-2 text-xs font-bold ${verdictColor}`}>{verdict}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAID vs ORGANIC COMPARISON */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ComparisonCard
          title="💸 Paid Channels"
          channels={channelMetrics.filter((c) => c.cfg.paid)}
          color="amber"
        />
        <ComparisonCard
          title="🌱 Organic Channels"
          channels={channelMetrics.filter((c) => !c.cfg.paid)}
          color="green"
        />
      </div>

      {/* KEY INSIGHTS */}
      <div className="bg-gradient-to-br from-brand-50 to-blue-50 border-2 border-brand-200 rounded-xl p-5">
        <h2 className="font-bold text-brand-800 mb-3 flex items-center gap-2">💡 Insights & Action Items</h2>
        <div className="space-y-2 text-sm text-slate-700">
          {totalSpend > 0 && (
            <p>📊 <strong>Avg CAC keseluruhan:</strong> {fmtRupiah(cac)}. Avg ticket = {fmtRupiah(avgTicket)}. Margin per closing = <strong className="text-green-700">{fmtRupiah(avgTicket - cac)}</strong></p>
          )}
          {avgDaysOverall != null && (
            <p>⏱ <strong>Speed to close:</strong> rata-rata {avgDaysOverall} hari. {avgDaysOverall <= 7 ? 'Funnel sehat.' : avgDaysOverall <= 14 ? 'Normal, masih bisa optimize.' : 'Lambat — perlu nurturing sequence.'}</p>
          )}
          {bestTrip && bestTrip.roas >= 3 && (
            <p>🏆 <strong>Trip terbaik:</strong> {bestTrip.trip.kode_trip || bestTrip.trip.name} ROAS {bestTrip.roas === Infinity ? '∞' : bestTrip.roas.toFixed(1) + 'x'}. Copy strategi promosi-nya ke trip lain.</p>
          )}
          {fastestChannel && slowestChannel && fastestChannel.key !== slowestChannel.key && (
            <p>⚡ <strong>{fastestChannel.cfg.label}</strong> closing {fastestChannel.avgDays}d vs <strong>{slowestChannel.cfg.label}</strong> {slowestChannel.avgDays}d — gap {(slowestChannel.avgDays - fastestChannel.avgDays).toFixed(1)} hari.</p>
          )}
          {channelMetrics.filter((c) => !c.cfg.paid && c.closings > 0).length > 0 && (
            <p>🌱 <strong>Free closing:</strong> {channelMetrics.filter((c) => !c.cfg.paid).reduce((s, c) => s + c.closings, 0)} peserta organik = pure profit margin</p>
          )}
          {topChannel && topChannel.cfg.paid && topChannel.roas > 3 && (
            <p>🚀 <strong>{topChannel.cfg.label}</strong> ROAS {topChannel.roas.toFixed(1)}x — Scale 30-50% next month.</p>
          )}
          {totalLeads > 0 && convRate < 5 && (
            <p>⚠ <strong>Conv rate rendah ({convRate.toFixed(1)}%)</strong> — Review follow-up speed/landing page.</p>
          )}
          {tripMetrics.length === 0 && (
            <p className="text-slate-500 italic">✈ Belum ada trip-level data. Pastikan saat input Ads Entry, pilih trip_id supaya bisa di-track per trip.</p>
          )}
          {avgDaysOverall == null && (
            <p className="text-slate-500 italic">⏱ Belum ada "days to close" data. Mulai isi di CS Daily input → metrik speed akan muncul.</p>
          )}
        </div>
      </div>

      {/* Ads entries CRUD */}
      <AdsManager entries={adsEntries.slice(0, 50)} trips={trips} />
    </div>
  );
}

function StatCard({ label, value, sub, color = 'bg-slate-50 text-slate-700' }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${color}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

function ComparisonCard({ title, channels, color }) {
  const totalClosings = channels.reduce((s, c) => s + c.closings, 0);
  const totalSpend = channels.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const allDays = channels.flatMap((c) => c.days_arr || []);
  const avgDays = allDays.length > 0
    ? Math.round((allDays.reduce((a, b) => a + b, 0) / allDays.length) * 10) / 10
    : null;

  const bg = color === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200';
  const textColor = color === 'amber' ? 'text-amber-800' : 'text-green-800';

  return (
    <div className={`${bg} border-2 rounded-xl p-4`}>
      <h3 className={`font-bold ${textColor} mb-2`}>{title}</h3>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <p className="opacity-70">Closings</p>
          <p className="text-lg font-bold">{totalClosings}</p>
        </div>
        <div>
          <p className="opacity-70">Spend</p>
          <p className="text-lg font-bold">{totalSpend > 0 ? fmtRupiah(totalSpend) : <span className="text-base">FREE</span>}</p>
        </div>
        <div>
          <p className="opacity-70">Revenue</p>
          <p className="text-lg font-bold">{fmtRupiah(totalRevenue)}</p>
        </div>
        <div>
          <p className="opacity-70">⏱ Avg</p>
          <p className="text-lg font-bold">{avgDays != null ? `${avgDays}d` : '—'}</p>
        </div>
      </div>
      {totalSpend > 0 && (
        <p className="mt-2 text-xs">ROAS: <strong>{roas.toFixed(1)}x</strong></p>
      )}
    </div>
  );
}
