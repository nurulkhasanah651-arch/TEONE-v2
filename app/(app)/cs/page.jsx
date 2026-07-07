// CS Daily — Round 78: Closing 30 hari + peserta closing di download

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LeadsQuickForm from '@/components/cs/LeadsQuickForm';
import LeadsHistoryTable from '@/components/cs/LeadsHistoryTable';
import ClosingHistoryTable from '@/components/cs/ClosingHistoryTable';
import { fetchAll } from '@/lib/supabase/fetch-all';
import CsRecapPanel from '@/components/cs/CsRecapPanel';
import { getCsRecapGroup, buildCsRecap } from '@/lib/actions/cs-recap';
import ClosingRangePanel from '@/components/cs/ClosingRangePanel';

export const dynamic = 'force-dynamic';

function sumOrganic(l) {
  return (l?.leads_ig || 0) + (l?.leads_tiktok || 0) + (l?.leads_wa || 0) + (l?.leads_fb || 0);
}
function sumAdsLeads(l) {
  return (l?.leads_ads_meta || 0) + (l?.leads_ads_google || 0) + (l?.leads_ads_tiktok || 0);
}
function sumClosing(u) {
  return (u.from_instagram || 0) + (u.from_whatsapp || 0) + (u.from_offline || 0)
    + (u.closing_alumni || 0) + (u.closing_mitra || 0) + (u.from_website || 0)
    + (u.from_ads_meta || 0) + (u.from_ads_google || 0) + (u.from_ads_tiktok || 0);
}

export default async function CSPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch in parallel
  const [updatesRes, leadsRes, todayLeadsRes, paxRes] = await Promise.all([
    supabase.from('cs_daily_updates').select('*, trips(name, kode_trip)').order('tanggal', { ascending: false }),
    supabase.from('cs_daily_leads').select('*').order('tanggal', { ascending: false }),
    supabase.from('cs_daily_leads').select('*').eq('tanggal', today).maybeSingle(),
    supabase.from('trip_passengers').select('*, trips(name, kode_trip), customers(*)').order('joined_at', { ascending: false }),
  ]);

  const recapGroup = await getCsRecapGroup().catch(() => ({ group: '' }));

  const allUpdates = updatesRes.data || [];
  const allLeads = leadsRes.data || [];
  const todayLeads = todayLeadsRes.data;
  const allParticipants = paxRes.data || [];

  // Closing per (trip+tanggal) = jumlah PESERTA aktual masuk dalam window bisnis tanggal itu
  // (per orang, konsisten dgn kartu "Closing Hari Ini"). Window: [D-1 18:00 WIB, D 18:00 WIB).
  const _bizWin = (dStr) => { const d0 = new Date(dStr + 'T00:00:00Z').getTime(); return { s: d0 - 13 * 3600 * 1000, e: d0 + 11 * 3600 * 1000 }; };
  const _sinceIso = new Date(Date.now() - 32 * 24 * 3600 * 1000).toISOString();
  const _recentPax = await fetchAll(() => supabase.from('trip_passengers')
    .select('trip_id, joined_at, transfer_status, refund_status, lead_source').gte('joined_at', _sinceIso));
  const _activePax = (_recentPax || []).filter((p) => p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund' && p.lead_source !== 'master');
  const closingPaxByUpdate = {};
  for (const u of allUpdates) {
    if (!u.tanggal) continue;
    const { s: _s, e: _e } = _bizWin(u.tanggal);
    let n = 0;
    for (const p of _activePax) {
      if (String(p.trip_id) !== String(u.trip_id)) continue;
      const j = p.joined_at ? new Date(p.joined_at).getTime() : 0;
      if (j >= _s && j < _e) n++;
    }
    closingPaxByUpdate[u.id] = n;
  }

  const todayUpdates = allUpdates.filter((u) => u.tanggal === today);
  const todayClosing = todayUpdates.reduce((s, u) => s + sumClosing(u), 0);
  const todayLeadsOrganic = sumOrganic(todayLeads);
  const todayLeadsAds = sumAdsLeads(todayLeads);
  const todayLeadsTotal = todayLeadsOrganic + todayLeadsAds;
  // Samakan kartu dgn Rekap WA (cutoff bisnis 18:00 + sumber peserta/web aktual)
  let _rec = null; try { _rec = await buildCsRecap(); } catch { _rec = null; }
  const cardClosing = (_rec && _rec.ok && typeof _rec.totalClosing === 'number') ? _rec.totalClosing : todayClosing;
  const cardLeadsTotal = (_rec && _rec.ok && typeof _rec.leadsTotal === 'number') ? _rec.leadsTotal : todayLeadsTotal;
  const cardLeadsOrg = (_rec && _rec.ok && typeof _rec.leadsOrganic === 'number') ? _rec.leadsOrganic : todayLeadsOrganic;
  const cardLeadsAds = (_rec && _rec.ok && typeof _rec.leadsAds === 'number') ? _rec.leadsAds : todayLeadsAds;
  const cardTripAktif = (_rec && _rec.ok && typeof _rec.tripAktif === 'number') ? _rec.tripAktif : todayUpdates.length;

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
        <SummaryCard label="Closing Hari Ini" value={cardClosing} color="text-green-700" bg="bg-green-50" />
        <SummaryCard label="Leads Hari Ini" value={cardLeadsTotal} sub={`${cardLeadsOrg} organic + ${cardLeadsAds} ads`} color="text-blue-700" bg="bg-blue-50" />
        <SummaryCard label="Trip Aktif Hari Ini" value={cardTripAktif} color="text-brand-700" bg="bg-brand-50" />
        <SummaryCard
          label="Conv. Rate Hari Ini"
          value={cardLeadsTotal > 0 ? `${Math.round((cardClosing / cardLeadsTotal) * 100)}%` : '—'}
          color="text-purple-700"
          bg="bg-purple-50"
        />
      </div>

      <CsRecapPanel initialGroup={recapGroup?.group || ''} />

      <ClosingRangePanel defaultFrom={today.slice(0, 8) + '01'} defaultTo={today} />

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
          <p className="text-xs text-slate-500 mt-0.5">30 hari terakhir di tab Daily. Setelah lewat sebulan, data otomatis muncul di rekap bulanan. Download Excel include detail peserta.</p>
        </div>
        <ClosingHistoryTable allUpdates={allUpdates} participants={allParticipants} closingPax={closingPaxByUpdate} />
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
