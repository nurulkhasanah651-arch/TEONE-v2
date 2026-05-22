// CS Daily — Round 75: Leads History via client component (view switcher + edit + download)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LeadsQuickForm from '@/components/cs/LeadsQuickForm';
import LeadsHistoryTable from '@/components/cs/LeadsHistoryTable';
import CSUpdateRow from '@/components/cs/CSUpdateRow';

export const dynamic = 'force-dynamic';

function sumOrganic(l) {
  return (l?.leads_ig || 0) + (l?.leads_tiktok || 0) + (l?.leads_wa || 0) + (l?.leads_fb || 0);
}
function sumAds(l) {
  return (l?.leads_ads_meta || 0) + (l?.leads_ads_google || 0) + (l?.leads_ads_tiktok || 0);
}

export default async function CSPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch in parallel — leads ALL HISTORY untuk client recap, updates max 20
  const [updatesRes, leadsRes, todayLeadsRes] = await Promise.all([
    supabase.from('cs_daily_updates').select('*, trips(name, kode_trip)').order('tanggal', { ascending: false }).limit(20),
    supabase.from('cs_daily_leads').select('*').order('tanggal', { ascending: false }),
    supabase.from('cs_daily_leads').select('*').eq('tanggal', today).maybeSingle(),
  ]);

  const updates = updatesRes.data || [];
  const allLeads = leadsRes.data || [];
  const todayLeads = todayLeadsRes.data;

  const todayUpdates = updates.filter((u) => u.tanggal === today);
  const todayClosing = todayUpdates.reduce((s, u) => s + (u.total_terjual_hari_ini || 0), 0);
  const todayLeadsOrganic = sumOrganic(todayLeads);
  const todayLeadsAds = sumAds(todayLeads);
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

      {/* Quick summary */}
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

      {/* === LEADS HARIAN SECTION === */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">📊 Leads Harian (Global, Semua Channel)</h2>
          <p className="text-xs text-slate-500 mt-0.5">Organic + Ads. List 7 hari terakhir tersedia di tab Daily. Rekap mingguan/bulanan untuk arsip.</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Form input/edit hari ini */}
          <LeadsQuickForm initial={todayLeads ? { ...todayLeads } : { tanggal: today }} />

          {/* History + view switcher (client component) */}
          <LeadsHistoryTable allLeads={allLeads} />
        </div>
      </section>

      {/* === CLOSING PER TRIP SECTION === */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">📝 Update Closing per Trip</h2>
          <p className="text-xs text-slate-500 mt-0.5">Riwayat 20 update terakhir.</p>
        </div>
        {updates.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-lg font-bold text-slate-700">Belum ada update</p>
            <p className="mt-1 text-sm text-slate-500">Klik "Input CS Daily" untuk mulai.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {updates.map((u) => <CSUpdateRow key={u.id} update={u} />)}
          </div>
        )}
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
