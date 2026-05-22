// CS Daily — Round 76: Leads + Closing keduanya pakai History Table (daily/weekly/monthly + download)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LeadsQuickForm from '@/components/cs/LeadsQuickForm';
import LeadsHistoryTable from '@/components/cs/LeadsHistoryTable';
import ClosingHistoryTable from '@/components/cs/ClosingHistoryTable';

export const dynamic = 'force-dynamic';

function sumOrganic(l) {
  return (l?.leads_ig || 0) + (l?.leads_tiktok || 0) + (l?.leads_wa || 0) + (l?.leads_fb || 0);
}
function sumAdsLeads(l) {
  return (l?.leads_ads_meta || 0) + (l?.leads_ads_google || 0) + (l?.leads_ads_tiktok || 0);
}
function sumClosing(u) {
  return (u.from_instagram || 0) + (u.from_whatsapp || 0) + (u.from_offline || 0)
    + (u.closing_alumni || 0) + (u.closing_mitra || 0)
    + (u.from_ads_meta || 0) + (u.from_ads_google || 0) + (u.from_ads_tiktok || 0);
}

export default async function CSPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch in parallel — ALL leads & updates (client component bagi tampilan per view)
  const [updatesRes, leadsRes, todayLeadsRes] = await Promise.all([
    supabase.from('cs_daily_updates').select('*, trips(name, kode_trip)').order('tanggal', { ascending: false }),
    supabase.from('cs_daily_leads').select('*').order('tanggal', { ascending: false }),
    supabase.from('cs_daily_leads').select('*').eq('tanggal', today).maybeSingle(),
  ]);

  const allUpdates = updatesRes.data || [];
  const allLeads = leadsRes.data || [];
  const todayLeads = todayLeadsRes.data;

  const todayUpdates = allUpdates.filter((u) => u.tanggal === today);
  const todayClosing = todayUpdates.reduce((s, u) => s + sumClosing(u), 0);
  const todayLeadsOrganic = sumOrganic(todayLeads);
  const todayLeadsAds = sumAdsLeads(todayLeads);
  const todayLeadsTotal = todayLeadsOrganic + todayLeadsAds;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">CS Daily</h1>
          <p className="mt-1 text-slate-600">Pantau leads harian + input closing per trip.</p>
        </div>
        <Link
          href="/cs/new"
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
        >
          <span>+</span> Input CS Daily
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Closing Hari Ini" value={todayClosing} color="text-green-700" bg="bg-green-50" />
        <SummaryCard label="Leads Hari Ini" value={todayLeadsTotal} sub={`${todayLeadsOrganic} organic + ${todayLeadsAds} ads`} color="text-blue-700" bg="bg-blue-50" />
        <SummaryCard label="Trip Aktif Hari Ini" value={todayUpdates.length} color="text-brand-700" bg="bg-brand-50" />
        <SummaryCard
          label="Conv. Rate Hari Ini"
          value={todayLeadsTotal > 0 ? `${Math.round((todayClosing / todayLeadsTotal) * 100)}%` : '—'}
          color="text-purple-700"
          bg="bg-purple-50"
        />
      </div>

      {/* === LEADS HARIAN === */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">📊 Leads Harian (Global, Semua Channel)</h2>
          <p className="text-xs text-slate-500 mt-0.5">Organic + Ads. 7 hari terakhir di tab Daily, lebih lama → Rekap.</p>
        </div>
        <div className="p-5 space-y-4">
          <LeadsQuickForm initial={todayLeads ? { ...todayLeads } : { tanggal: today }} />
          <LeadsHistoryTable allLeads={allLeads} />
        </div>
      </section>

      {/* === CLOSING PER TRIP === */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">📝 Update Closing per Trip</h2>
          <p className="text-xs text-slate-500 mt-0.5">Daily list (7 hari) + rekap mingguan/bulanan + download CSV.</p>
        </div>
        <ClosingHistoryTable allUpdates={allUpdates} />
      </section>
    </div>
  );
}

function SummaryCard({ label, value, sub, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
