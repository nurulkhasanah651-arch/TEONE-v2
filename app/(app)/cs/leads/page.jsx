// Daily Leads list — global leads tracker (per date, all sources)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = createClient();
  const { data: leads, error } = await supabase
    .from('cs_daily_leads')
    .select('*')
    .order('tanggal', { ascending: false })
    .limit(60);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-bold">Error loading leads</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  // Today's leads
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = leads?.find((l) => l.tanggal === today);
  const todayTotal = todayRow ? (todayRow.leads_ig || 0) + (todayRow.leads_tiktok || 0) + (todayRow.leads_wa || 0) + (todayRow.leads_fb || 0) : 0;

  // 7-day totals
  const last7 = (leads || []).slice(0, 7);
  const week = {
    ig: last7.reduce((s, l) => s + (l.leads_ig || 0), 0),
    tiktok: last7.reduce((s, l) => s + (l.leads_tiktok || 0), 0),
    wa: last7.reduce((s, l) => s + (l.leads_wa || 0), 0),
    fb: last7.reduce((s, l) => s + (l.leads_fb || 0), 0),
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/cs" className="text-sm text-brand-600 font-medium hover:underline">← CS Daily</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">Leads Harian</h1>
          <p className="mt-1 text-slate-600">Pantau leads masuk dari semua channel (IG, TikTok, WA, FB).</p>
        </div>
        <Link
          href="/cs/leads/new"
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
        >
          <span>+</span> Input Leads Hari Ini
        </Link>
      </div>

      {/* Today + 7-day stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <StatCard label="Total Hari Ini" value={todayTotal} color="text-brand-700" bg="bg-brand-50" big />
        <StatCard label="IG (7 hari)" value={week.ig} color="text-pink-700" bg="bg-pink-50" />
        <StatCard label="TikTok (7 hari)" value={week.tiktok} color="text-slate-700" bg="bg-slate-100" />
        <StatCard label="WA (7 hari)" value={week.wa} color="text-green-700" bg="bg-green-50" />
        <StatCard label="FB (7 hari)" value={week.fb} color="text-blue-700" bg="bg-blue-50" />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Riwayat Harian</h2>
        </div>
        {!leads || leads.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-lg font-bold text-slate-700">Belum ada data leads</p>
            <p className="mt-1 text-sm text-slate-500">Klik tombol "Input Leads Hari Ini" untuk mulai.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="px-5 py-2.5">Tanggal</th>
                  <th className="px-3 py-2.5 text-right">📷 IG</th>
                  <th className="px-3 py-2.5 text-right">🎵 TikTok</th>
                  <th className="px-3 py-2.5 text-right">💬 WA</th>
                  <th className="px-3 py-2.5 text-right">📘 FB</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((l) => {
                  const total = (l.leads_ig || 0) + (l.leads_tiktok || 0) + (l.leads_wa || 0) + (l.leads_fb || 0);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-semibold text-slate-700">{fmtDate(l.tanggal)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{l.leads_ig || 0}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{l.leads_tiktok || 0}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{l.leads_wa || 0}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{l.leads_fb || 0}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-brand-700">{total}</td>
                      <td className="px-5 py-2.5 text-right">
                        <Link href={`/cs/leads/new?date=${l.tanggal}`} className="text-xs text-brand-600 hover:underline font-semibold">
                          ✎ Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg, big = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${big ? 'text-3xl' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
