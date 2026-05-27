// Round 151: Ads Manager — tambah kolom "Avg Days to Close" per channel (dari R150)
// (sudah include R149 Channel ROI)
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
  // PAID ADS
  meta:       { label: 'Meta (FB/IG) Ads', icon: '📱', color: 'bg-blue-50 border-blue-200 text-blue-800',     paid: true,  source: 'ads_meta' },
  google:     { label: 'Google Ads',       icon: '🔍', color: 'bg-red-50 border-red-200 text-red-800',         paid: true,  source: 'ads_google' },
  tiktok:     { label: 'TikTok Ads',       icon: '🎵', color: 'bg-pink-50 border-pink-200 text-pink-800',     paid: true,  source: 'ads_tiktok' },
  // ORGANIC
  instagram:  { label: 'Instagram Organik',icon: '📸', color: 'bg-purple-50 border-purple-200 text-purple-800',paid: false, source: 'instagram' },
  whatsapp:   { label: 'WhatsApp Organik', icon: '💬', color: 'bg-green-50 border-green-200 text-green-800',  paid: false, source: 'whatsapp' },
  offline:    { label: 'Offline / Walk-in',icon: '🏪', color: 'bg-amber-50 border-amber-200 text-amber-800',  paid: false, source: 'offline' },
  alumni:     { label: 'Alumni Referral',  icon: '🎓', color: 'bg-indigo-50 border-indigo-200 text-indigo-800',paid: false, source: 'alumni' },
  mitra:      { label: 'Mitra Partnership',icon: '🤝', color: 'bg-teal-50 border-teal-200 text-teal-800',     paid: false, source: 'mitra' },
};

export default async function AdsManagerPage({ searchParams }) {
  const sp = await searchParams;
  const filterMonth = sp?.month || new Date().toISOString().slice(0, 7);

  const supabase = createClient();
  const [adsEntries, csUpdates, trips, trip_passengers, payments] = await Promise.all([
    safeQuery(supabase.from('ads_entries').select('*').order('date', { ascending: false })),
    safeQuery(supabase.from('cs_daily_updates').select('*')),
    safeQuery(supabase.from('trips').select('id, kode_trip, name, status, publish_date, closed_at, departure, sold, quota, price, price_breakdown')),
    // R151: include lead_source + days_to_close + closing_date
    safeQuery(supabase.from('trip_passengers').select('id, trip_id, customer_id, price_paid, lead_source, days_to_close, closing_date')),
    safeQuery(supabase.from('participant_payments').select('passenger_id, amount, is_transferred')),
  ]);

  const adsThisMonth = adsEntries.filter((e) => (e.date || '').startsWith(filterMonth));
  const csThisMonth = csUpdates.filter((c) => (c.tanggal || '').startsWith(filterMonth));
  // R151: filter peserta by closing_date di bulan ini juga
  const pxThisMonth = trip_passengers.filter((p) => (p.closing_date || '').startsWith(filterMonth));

  // Init stats per channel
  const stats = {};
  Object.keys(CHANNELS).forEach((k) => {
    stats[k] = { spend: 0, leads: 0, closings: 0, revenue: 0, days_arr: [] };
  });

  // R151: aggregate days_to_close per channel dari trip_passengers
  for (const p of pxThisMonth) {
    if (p.days_to_close == null) continue;
    const src = p.lead_source;
    if (!src) continue;
    // map lead_source ke channel key
    const channelKey = mapLeadSourceToChannel(src);
    if (channelKey && stats[channelKey]) {
      stats[channelKey].days_arr.push(p.days_to_close);
    }
  }

  // Aggregate ADS spend + leads
  for (const e of adsThisMonth) {
    const p = stats[e.platform];
    if (p) {
      p.spend += Number(e.spend) || 0;
      p.leads += e.leads || 0;
    }
  }

  // Aggregate closings dari cs_daily_updates
  for (const c of csThisMonth) {
    stats.meta.closings      += c.from_ads_meta   || 0;
    stats.google.closings    += c.from_ads_google || 0;
    stats.tiktok.closings    += c.from_ads_tiktok || 0;
    stats.instagram.closings += c.from_instagram  || 0;
    stats.whatsapp.closings  += c.from_whatsapp   || 0;
    stats.offline.closings   += c.from_offline    || 0;
    stats.alumni.closings    += c.closing_alumni  || 0;
    stats.mitra.closings     += c.closing_mitra   || 0;

    if (c.leads_ads_meta)   stats.meta.leads   += c.leads_ads_meta;
    if (c.leads_ads_google) stats.google.leads += c.leads_ads_google;
    if (c.leads_ads_tiktok) stats.tiktok.leads += c.leads_ads_tiktok;
  }

  // Revenue per channel
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

  // R151: avg days to close keseluruhan
  const allDays = Object.values(stats).flatMap((s) => s.days_arr);
  const avgDaysOverall = allDays.length > 0
    ? Math.round((allDays.reduce((a, b) => a + b, 0) / allDays.length) * 10) / 10
    : null;

  // Calc metrics per channel
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

  // R151: fastest & slowest converting channels
  const channelsWithDays = channelMetrics.filter((c) => c.avgDays != null);
  const fastestChannel = [...channelsWithDays].sort((a, b) => a.avgDays - b.avgDays)[0];
  const slowestChannel = [...channelsWithDays].sort((a, b) => b.avgDays - a.avgDays)[0];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">📢 Ads Manager — Channel ROI</h1>
        <p className="mt-1 text-slate-600">
          Performa lengkap semua channel · CAC · ROAS · Speed-to-Close · Rekomendasi optimasi budget
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Bulan:</span>
        <form action="/ads" method="get" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={filterMonth} className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <button type="submit" className="px-3 py-1.5 bg-brand-500 text-white text-sm font-semibold rounded">Filter</button>
        </form>
      </div>

      {/* R151: TOP STATS — tambah Avg Days to Close */}
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

      {/* RECOMMENDATIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {topChannel && topChannel.closings > 0 && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
            <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1">🏆 Top Performer</p>
            <p className="text-lg font-bold text-green-900">{topChannel.cfg.icon} {topChannel.cfg.label}</p>
            <p className="text-sm text-green-700 mt-1">
              {topChannel.closings} closings ·
              {topChannel.cfg.paid
                ? ` ROAS ${topChannel.roas.toFixed(1)}x · CAC ${fmtRupiah(topChannel.cac)}`
                : ` Free traffic · ${fmtRupiah(topChannel.revenue)} revenue`}
              {topChannel.avgDays != null && <> · ⏱ {topChannel.avgDays}d avg close</>}
            </p>
            <p className="text-xs text-green-700 italic mt-2">
              💡 <strong>Recommendation:</strong> Scale up channel ini! {topChannel.cfg.paid ? 'Naikin budget 30-50% per bulan.' : 'Invest lebih banyak ke konten/community building.'}
            </p>
          </div>
        )}

        {worstPaid && worstPaid.spend > 0 && worstPaid.roas < 2 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
            <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-1">⚠ Underperformer</p>
            <p className="text-lg font-bold text-red-900">{worstPaid.cfg.icon} {worstPaid.cfg.label}</p>
            <p className="text-sm text-red-700 mt-1">
              Spend {fmtRupiah(worstPaid.spend)} → cuma {worstPaid.closings} closing · ROAS {worstPaid.roas.toFixed(1)}x
              {worstPaid.avgDays != null && <> · ⏱ {worstPaid.avgDays}d avg close</>}
            </p>
            <p className="text-xs text-red-700 italic mt-2">
              💡 <strong>Recommendation:</strong> {worstPaid.roas < 1 ? 'Pause atau review creative/targeting. Money loss.' : 'Optimize creative/audience. Kalau bulan depan masih <2x, cut.'}
            </p>
          </div>
        )}
      </div>

      {/* R151: SPEED INSIGHTS */}
      {(fastestChannel || slowestChannel) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fastestChannel && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4">
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">⚡ Fastest Closing</p>
              <p className="text-lg font-bold text-emerald-900">{fastestChannel.cfg.icon} {fastestChannel.cfg.label}</p>
              <p className="text-sm text-emerald-700 mt-1">
                Avg <strong>{fastestChannel.avgDays} hari</strong> dari chat ke closing
                · {fastestChannel.tracked} peserta tracked
              </p>
              <p className="text-xs text-emerald-700 italic mt-2">
                💡 Hot channel — peserta convert cepat. Ideal untuk push promo limited-time.
              </p>
            </div>
          )}
          {slowestChannel && slowestChannel.key !== fastestChannel?.key && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
              <p className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-1">🐢 Slowest Closing</p>
              <p className="text-lg font-bold text-orange-900">{slowestChannel.cfg.icon} {slowestChannel.cfg.label}</p>
              <p className="text-sm text-orange-700 mt-1">
                Avg <strong>{slowestChannel.avgDays} hari</strong> dari chat ke closing
                · {slowestChannel.tracked} peserta tracked
              </p>
              <p className="text-xs text-orange-700 italic mt-2">
                💡 Butuh nurturing lebih lama. Siapin sequence follow-up otomatis (Day 3, 7, 14).
              </p>
            </div>
          )}
        </div>
      )}

      {/* CHANNEL PERFORMANCE TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-brand-700">📊 Performa per Channel (sorted by performance)</h2>
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
                <th className="px-3 py-2 text-right">⏱ Avg Days</th>
                <th className="px-3 py-2 text-left">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channelMetrics.map((c) => {
                const verdict = c.cfg.paid
                  ? (c.spend === 0 ? 'no spend' : c.roas >= 5 ? '🟢 Excellent' : c.roas >= 3 ? '🟢 Good' : c.roas >= 2 ? '🟡 OK' : c.roas >= 1 ? '🟡 Break-even' : '🔴 Loss')
                  : (c.closings > 0 ? '🟢 Free win' : '⚪ Sleeping');
                const verdictColor = verdict.startsWith('🟢') ? 'text-green-700' : verdict.startsWith('🟡') ? 'text-amber-700' : verdict.startsWith('🔴') ? 'text-red-700' : 'text-slate-500';

                // R151: badge color for avg days
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
                    <td className="px-3 py-2 text-right">
                      <div>{daysBadge}</div>
                      {c.tracked > 0 && <p className="text-[9px] text-slate-400 mt-0.5">{c.tracked} tracked</p>}
                    </td>
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
            <p>⏱ <strong>Speed to close:</strong> rata-rata {avgDaysOverall} hari dari chat pertama. {avgDaysOverall <= 7 ? 'Sangat cepat — funnel kalian sehat.' : avgDaysOverall <= 14 ? 'Normal — masih bisa di-optimize dengan follow-up otomatis.' : 'Lambat — perlu reminder/nurturing sequence yang lebih agresif.'}</p>
          )}
          {fastestChannel && slowestChannel && fastestChannel.key !== slowestChannel.key && (
            <p>⚡ <strong>{fastestChannel.cfg.label}</strong> closing {fastestChannel.avgDays}d vs <strong>{slowestChannel.cfg.label}</strong> closing {slowestChannel.avgDays}d. Gap {(slowestChannel.avgDays - fastestChannel.avgDays).toFixed(1)} hari — copy strategi dari channel cepat ke yang lambat.</p>
          )}
          {channelMetrics.filter((c) => !c.cfg.paid && c.closings > 0).length > 0 && (
            <p>🌱 <strong>Free closing (organik):</strong> {channelMetrics.filter((c) => !c.cfg.paid).reduce((s, c) => s + c.closings, 0)} peserta tanpa biaya iklan = pure profit margin</p>
          )}
          {topChannel && topChannel.cfg.paid && topChannel.roas > 3 && (
            <p>🚀 <strong>{topChannel.cfg.label}</strong> ROAS {topChannel.roas.toFixed(1)}x — Scale up next month, naikkan budget 30-50%</p>
          )}
          {totalLeads > 0 && convRate < 5 && (
            <p>⚠ <strong>Conv rate rendah ({convRate.toFixed(1)}%)</strong> — Review follow-up speed, atau landing page perlu di-improve</p>
          )}
          {avgDaysOverall == null && (
            <p className="text-slate-500 italic">⏱ Belum ada data "days to close" bulan ini. Mulai isi tanggal chat pertama di CS Daily input → metrik speed-to-close akan muncul otomatis.</p>
          )}
        </div>
      </div>

      {/* Ads entries CRUD */}
      <AdsManager entries={adsEntries.slice(0, 50)} trips={trips} />
    </div>
  );
}

// R151: map lead_source dari peserta ke channel key
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
  // R151: avg days across these channels
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
