// Ads Manager dashboard — Round 42

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';
import AdsManager from '@/components/ads/AdsManager';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const r = await promise; return r.data || fallback; } catch { return fallback; }
}

const PLATFORM_CFG = {
  meta:   { label: 'Meta (FB/IG)', icon: '📱', color: 'bg-blue-100 text-blue-700' },
  google: { label: 'Google',       icon: '🔍', color: 'bg-red-100 text-red-700' },
  tiktok: { label: 'TikTok',       icon: '🎵', color: 'bg-pink-100 text-pink-700' },
  other:  { label: 'Lainnya',      icon: '🌐', color: 'bg-slate-100 text-slate-700' },
};

export default async function AdsManagerPage({ searchParams }) {
  const sp = await searchParams;
  const filterMonth = sp?.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  const supabase = createClient();
  const [adsEntries, csUpdates, trips] = await Promise.all([
    safeQuery(supabase.from('ads_entries').select('*').order('date', { ascending: false })),
    safeQuery(supabase.from('cs_daily_updates').select('*')),
    safeQuery(supabase.from('trips').select('id, kode_trip, name, status, publish_date, closed_at, departure, sold, quota, price')),
  ]);

  // Filter by month
  const adsThisMonth = adsEntries.filter((e) => (e.date || '').startsWith(filterMonth));
  const csThisMonth = csUpdates.filter((c) => (c.tanggal || '').startsWith(filterMonth));

  // Stats per platform
  const platformStats = { meta: { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 },
                          google: { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 },
                          tiktok: { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 },
                          other: { spend: 0, leads: 0, closings: 0, impressions: 0, clicks: 0 } };
  for (const e of adsThisMonth) {
    const p = platformStats[e.platform] || platformStats.other;
    p.spend += Number(e.spend) || 0;
    p.leads += e.leads || 0;
    p.impressions += e.impressions || 0;
    p.clicks += e.clicks || 0;
  }
  for (const c of csThisMonth) {
    platformStats.meta.closings   += c.from_ads_meta   || 0;
    platformStats.google.closings += c.from_ads_google || 0;
    platformStats.tiktok.closings += c.from_ads_tiktok || 0;
  }

  // Total stats
  const totalSpend = Object.values(platformStats).reduce((s, p) => s + p.spend, 0);
  const totalLeads = Object.values(platformStats).reduce((s, p) => s + p.leads, 0);
  const totalClosings = Object.values(platformStats).reduce((s, p) => s + p.closings, 0);
  const cac = totalClosings > 0 ? totalSpend / totalClosings : 0;
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const convRate = totalLeads > 0 ? (totalClosings / totalLeads * 100) : 0;

  // Trip performance — durasi sell (publish_date → closed_at / today)
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
        <p className="mt-1 text-slate-600">Performa iklan per platform · CAC, CPL, ROI · Durasi sell per trip</p>
      </div>

      {/* Month filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Bulan:</span>
        <form action="/ads" method="get" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={filterMonth} className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
          <button type="submit" className="px-3 py-1.5 bg-brand-500 text-white text-sm font-semibold rounded">Filter</button>
        </form>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="💰 Total Spend" value={fmtRupiah(totalSpend)} sub={`${adsThisMonth.length} entries`} color="bg-amber-50 text-amber-700" />
        <StatCard label="🎯 Total Leads" value={totalLeads.toLocaleString('id-ID')} color="bg-blue-50 text-blue-700" />
        <StatCard label="✓ Closings" value={totalClosings.toLocaleString('id-ID')} color="bg-green-50 text-green-700" />
        <StatCard label="💵 CAC" value={fmtRupiah(cac)} sub="Cost per closing" color="bg-purple-50 text-purple-700" />
        <StatCard label="📊 Conv Rate" value={`${convRate.toFixed(1)}%`} sub={`CPL: ${fmtRupiah(cpl)}`} color="bg-indigo-50 text-indigo-700" />
      </div>

      {/* Per platform breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Performa per Platform (Bulan {filterMonth})</h2>
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

      {/* Trip performance — durasi sell */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">⏱ Durasi Sell per Trip (Publish → Close)</h2>
          <p className="text-xs text-slate-500 mt-0.5">Untuk lihat berapa lama 1 group laku setelah diiklankan.</p>
        </div>
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
                  <th className="px-3 py-2 text-left">Status</th>
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
                    <td className="px-3 py-2 text-[11px]">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
