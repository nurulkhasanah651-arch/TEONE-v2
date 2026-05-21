// Ads Manager dashboard — Round 43: tambah Per-Trip section
// Auto-aggregate leads/closings dari cs_daily_updates per trip per platform

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import AdsManager from '@/components/ads/AdsManager';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const r = await promise; return r.data || fallback; } catch { return fallback; }
}

const PLATFORM_CFG = {
  meta:   { label: 'Meta',   icon: '📱', color: 'bg-blue-100 text-blue-700',   barColor: 'bg-blue-500' },
  google: { label: 'Google', icon: '🔍', color: 'bg-red-100 text-red-700',     barColor: 'bg-red-500' },
  tiktok: { label: 'TikTok', icon: '🎵', color: 'bg-pink-100 text-pink-700',   barColor: 'bg-pink-500' },
  other:  { label: 'Other',  icon: '🌐', color: 'bg-slate-100 text-slate-700', barColor: 'bg-slate-500' },
};

export default async function AdsManagerPage({ searchParams }) {
  const sp = await searchParams;
  const filterMonth = sp?.month || new Date().toISOString().slice(0, 7);

  const supabase = createClient();
  const [adsEntries, csUpdates, trips] = await Promise.all([
    safeQuery(supabase.from('ads_entries').select('*').order('date', { ascending: false })),
    safeQuery(supabase.from('cs_daily_updates').select('*')),
    safeQuery(supabase.from('trips').select('*')),
  ]);

  // ============ MONTHLY OVERVIEW ============
  const adsThisMonth = adsEntries.filter((e) => (e.date || '').startsWith(filterMonth));
  const csThisMonth = csUpdates.filter((c) => (c.tanggal || '').startsWith(filterMonth));

  const platformStats = {
    meta:   { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 },
    google: { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 },
    tiktok: { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 },
    other:  { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 },
  };
  for (const e of adsThisMonth) {
    const p = platformStats[e.platform] || platformStats.other;
    p.spend += Number(e.spend) || 0;
    p.leads += e.leads || 0;
    p.impressions += e.impressions || 0;
    p.clicks += e.clicks || 0;
  }
  // CS daily aggregated: closings + leads (ini real dari sales follow-up)
  for (const c of csThisMonth) {
    platformStats.meta.closings   += c.from_ads_meta   || 0;
    platformStats.google.closings += c.from_ads_google || 0;
    platformStats.tiktok.closings += c.from_ads_tiktok || 0;
    // Override leads dari CS daily (lebih akurat untuk attribution)
    platformStats.meta.leads   = Math.max(platformStats.meta.leads,   csThisMonth.reduce((s, x) => s + (x.leads_ads_meta || 0), 0));
    platformStats.google.leads = Math.max(platformStats.google.leads, csThisMonth.reduce((s, x) => s + (x.leads_ads_google || 0), 0));
    platformStats.tiktok.leads = Math.max(platformStats.tiktok.leads, csThisMonth.reduce((s, x) => s + (x.leads_ads_tiktok || 0), 0));
  }

  const totalSpend = Object.values(platformStats).reduce((s, p) => s + p.spend, 0);
  const totalLeads = Object.values(platformStats).reduce((s, p) => s + p.leads, 0);
  const totalClosings = Object.values(platformStats).reduce((s, p) => s + p.closings, 0);
  const cac = totalClosings > 0 ? totalSpend / totalClosings : 0;
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const convRate = totalLeads > 0 ? (totalClosings / totalLeads * 100) : 0;

  // ============ PER TRIP ============
  // Aggregate spend per trip per platform (dari ads_entries WHERE trip_id matches)
  const tripSpend = {}; // tripId -> { meta, google, tiktok, other, total }
  for (const e of adsEntries) {
    if (!e.trip_id) continue;
    if (!tripSpend[e.trip_id]) tripSpend[e.trip_id] = { meta: 0, google: 0, tiktok: 0, other: 0, total: 0 };
    const platform = ['meta', 'google', 'tiktok'].includes(e.platform) ? e.platform : 'other';
    tripSpend[e.trip_id][platform] += Number(e.spend) || 0;
    tripSpend[e.trip_id].total += Number(e.spend) || 0;
  }

  // Aggregate closings + leads per trip per platform (dari cs_daily_updates)
  const tripAds = {}; // tripId -> { metaClosings, googleClosings, tiktokClosings, metaLeads, ... }
  for (const c of csUpdates) {
    if (!c.trip_id) continue;
    if (!tripAds[c.trip_id]) tripAds[c.trip_id] = {
      metaClosings: 0, googleClosings: 0, tiktokClosings: 0,
      metaLeads: 0, googleLeads: 0, tiktokLeads: 0,
    };
    tripAds[c.trip_id].metaClosings += c.from_ads_meta || 0;
    tripAds[c.trip_id].googleClosings += c.from_ads_google || 0;
    tripAds[c.trip_id].tiktokClosings += c.from_ads_tiktok || 0;
    tripAds[c.trip_id].metaLeads += c.leads_ads_meta || 0;
    tripAds[c.trip_id].googleLeads += c.leads_ads_google || 0;
    tripAds[c.trip_id].tiktokLeads += c.leads_ads_tiktok || 0;
  }

  // Build per-trip rows
  const perTripRows = trips
    .map((t) => {
      const spend = tripSpend[t.id] || { meta: 0, google: 0, tiktok: 0, other: 0, total: 0 };
      const ads = tripAds[t.id] || { metaClosings: 0, googleClosings: 0, tiktokClosings: 0, metaLeads: 0, googleLeads: 0, tiktokLeads: 0 };
      const totalClosings = ads.metaClosings + ads.googleClosings + ads.tiktokClosings;
      const totalLeads = ads.metaLeads + ads.googleLeads + ads.tiktokLeads;
      const revenue = (totalClosings || 0) * (t.price || 0);
      const cac = totalClosings > 0 ? spend.total / totalClosings : 0;
      const cpl = totalLeads > 0 ? spend.total / totalLeads : 0;
      const roas = spend.total > 0 ? revenue / spend.total : 0;
      const conv = totalLeads > 0 ? (totalClosings / totalLeads * 100) : 0;
      return { trip: t, spend, ads, totalClosings, totalLeads, revenue, cac, cpl, roas, conv };
    })
    .filter((r) => r.spend.total > 0 || r.totalClosings > 0 || r.totalLeads > 0) // hide yg ga ada data
    .sort((a, b) => b.roas - a.roas); // best ROAS dulu

  // Durasi sell
  const tripsWithPublish = trips
    .filter((t) => t.publish_date)
    .map((t) => {
      const publishD = new Date(t.publish_date);
      const endD = t.closed_at ? new Date(t.closed_at) : new Date();
      const days = Math.round((endD - publishD) / (1000 * 60 * 60 * 24));
      const fillRate = t.quota ? Math.round((t.sold || 0) / t.quota * 100) : 0;
      return { ...t, days_to_sell: days, fillRate };
    })
    .sort((a, b) => (a.days_to_sell - b.days_to_sell));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Ads Manager</h1>
        <p className="mt-1 text-slate-600">Performa iklan per platform + per trip · CAC, CPL, ROAS · Durasi sell</p>
      </div>

      {/* Month filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Bulan:</span>
        <form action="/ads" method="get" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={filterMonth} className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <button type="submit" className="px-3 py-1.5 bg-brand-500 text-white text-sm font-semibold rounded">Filter</button>
        </form>
      </div>

      {/* MONTHLY OVERVIEW */}
      <section>
        <h2 className="text-lg font-bold text-brand-700 mb-3">📅 Monthly Overview ({filterMonth})</h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <StatCard label="💰 Total Spend" value={fmtRupiah(totalSpend)} sub={`${adsThisMonth.length} entries`} color="bg-amber-50 text-amber-700" />
          <StatCard label="🎯 Total Leads" value={totalLeads.toLocaleString('id-ID')} color="bg-blue-50 text-blue-700" />
          <StatCard label="✓ Closings" value={totalClosings.toLocaleString('id-ID')} color="bg-green-50 text-green-700" />
          <StatCard label="💵 CAC" value={fmtRupiah(cac)} sub="Cost per closing" color="bg-purple-50 text-purple-700" />
          <StatCard label="📊 Conv Rate" value={`${convRate.toFixed(1)}%`} sub={`CPL: ${fmtRupiah(cpl)}`} color="bg-indigo-50 text-indigo-700" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-brand-700 text-sm">Per Platform</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
            {Object.entries(platformStats).map(([key, st]) => {
              const cfg = PLATFORM_CFG[key];
              const cacP = st.closings > 0 ? st.spend / st.closings : 0;
              const cplP = st.leads > 0 ? st.spend / st.leads : 0;
              const convP = st.leads > 0 ? (st.closings / st.leads * 100) : 0;
              return (
                <div key={key} className={`rounded-lg p-3 ${cfg.color}`}>
                  <p className="text-xs font-bold uppercase tracking-wider">{cfg.icon} {cfg.label}</p>
                  <p className="mt-2 text-xl font-bold">{fmtRupiah(st.spend)}</p>
                  <p className="text-[10px] opacity-80">spend</p>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                    <div><p className="font-bold">{st.leads}</p><p className="opacity-70">leads</p></div>
                    <div><p className="font-bold">{st.closings}</p><p className="opacity-70">closes</p></div>
                    <div><p className="font-bold">{convP.toFixed(0)}%</p><p className="opacity-70">conv</p></div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-current/20 text-[10px]">
                    <p>CAC: <strong>{fmtRupiah(cacP)}</strong></p>
                    <p>CPL: <strong>{fmtRupiah(cplP)}</strong></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PER TRIP — BARU di Round 43 */}
      <section>
        <h2 className="text-lg font-bold text-brand-700 mb-3">🎯 Performa Per Trip</h2>
        <p className="text-xs text-slate-500 mb-3">
          Leads & closing per platform AUTO dari CS Daily Input. Spend per platform dari Ads Manager entries. Trip yang dipakai di kampanye saja yang muncul.
        </p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          {perTripRows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              Belum ada data ads per trip. Pastikan saat input ads spend di Ads Manager, pilih "Trip terkait" — dan CS daily input closing/leads dari ads.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Trip</th>
                    <th className="px-3 py-2 text-right">Spend Total</th>
                    <th className="px-3 py-2 text-right">Leads</th>
                    <th className="px-3 py-2 text-right">Closings</th>
                    <th className="px-3 py-2 text-right">CAC</th>
                    <th className="px-3 py-2 text-right">CPL</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perTripRows.map((r) => (
                    <tr key={r.trip.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link href={`/trips/${r.trip.id}`} className="font-semibold text-brand-700 hover:underline text-xs">
                          {r.trip.kode_trip || `#${r.trip.id}`}
                        </Link>
                        <p className="text-[11px] text-slate-500">{r.trip.name}</p>
                        {/* Per platform mini breakdown */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.spend.meta > 0 && (
                            <span className="text-[9px] bg-blue-50 text-blue-700 px-1 rounded">📱{fmtRupiah(r.spend.meta)} · {r.ads.metaClosings}c</span>
                          )}
                          {r.spend.google > 0 && (
                            <span className="text-[9px] bg-red-50 text-red-700 px-1 rounded">🔍{fmtRupiah(r.spend.google)} · {r.ads.googleClosings}c</span>
                          )}
                          {r.spend.tiktok > 0 && (
                            <span className="text-[9px] bg-pink-50 text-pink-700 px-1 rounded">🎵{fmtRupiah(r.spend.tiktok)} · {r.ads.tiktokClosings}c</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-amber-700">{fmtRupiah(r.spend.total)}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.totalLeads}</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-green-700">{r.totalClosings}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.cac > 0 ? fmtRupiah(r.cac) : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.cpl > 0 ? fmtRupiah(r.cpl) : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">{fmtRupiah(r.revenue)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs font-bold ${r.roas >= 3 ? 'text-green-700' : r.roas >= 1 ? 'text-amber-700' : 'text-red-700'}`}>
                          {r.roas > 0 ? `${r.roas.toFixed(1)}x` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold text-sm">
                  <tr>
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-right text-amber-700">
                      {fmtRupiah(perTripRows.reduce((s, r) => s + r.spend.total, 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {perTripRows.reduce((s, r) => s + r.totalLeads, 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-green-700">
                      {perTripRows.reduce((s, r) => s + r.totalClosings, 0)}
                    </td>
                    <td colSpan="2"></td>
                    <td className="px-3 py-2 text-right text-xs text-green-700">
                      {fmtRupiah(perTripRows.reduce((s, r) => s + r.revenue, 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {(() => {
                        const ts = perTripRows.reduce((s, r) => s + r.spend.total, 0);
                        const tr = perTripRows.reduce((s, r) => s + r.revenue, 0);
                        return ts > 0 ? `${(tr / ts).toFixed(1)}x` : '—';
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="mt-2 p-3 bg-slate-50 rounded text-[11px] text-slate-600">
          <strong>Legend:</strong> ROAS = Revenue / Spend ·
          <span className="text-green-700 font-bold ml-1">≥3x bagus</span> ·
          <span className="text-amber-700 font-bold ml-1">1-3x BEP</span> ·
          <span className="text-red-700 font-bold ml-1">&lt;1x rugi</span>.
          Revenue dihitung dari (closing ads × harga trip).
        </div>
      </section>

      {/* DURASI SELL */}
      <section>
        <h2 className="text-lg font-bold text-brand-700 mb-3">⏱ Durasi Sell per Trip (Publish → Close)</h2>
        <p className="text-xs text-slate-500 mb-3">Berapa lama 1 group laku setelah diiklankan.</p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          {tripsWithPublish.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 text-center">
              Belum ada trip dengan tanggal publish. Edit trip → set "Tanggal Publish".
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Trip</th>
                    <th className="px-3 py-2 text-left">Publish</th>
                    <th className="px-3 py-2 text-left">Closed / Now</th>
                    <th className="px-3 py-2 text-right">Durasi</th>
                    <th className="px-3 py-2 text-right">Fill Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tripsWithPublish.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link href={`/trips/${t.id}`} className="font-semibold text-brand-700 hover:underline">
                          {t.kode_trip || `#${t.id}`}
                        </Link>
                        <p className="text-[11px] text-slate-500">{t.name}</p>
                      </td>
                      <td className="px-3 py-2 text-xs">{fmtDate(t.publish_date)}</td>
                      <td className="px-3 py-2 text-xs">{t.closed_at ? fmtDate(t.closed_at) : <em className="text-slate-400">belum closed</em>}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-bold ${t.days_to_sell < 30 ? 'text-green-700' : t.days_to_sell < 60 ? 'text-amber-700' : 'text-red-700'}`}>
                          {t.days_to_sell} hari
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs font-bold ${t.fillRate >= 80 ? 'text-green-700' : t.fillRate >= 50 ? 'text-amber-700' : 'text-slate-500'}`}>
                          {t.fillRate}%
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">({t.sold}/{t.quota})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* INPUT SPEND */}
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
