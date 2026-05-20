// CS Daily — combined: Daily Leads section + Closing updates per trip

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils/format';
import LeadsQuickForm from '@/components/cs/LeadsQuickForm';

export const dynamic = 'force-dynamic';

export default async function CSPage() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch in parallel
  const [updatesRes, leadsRes, todayLeadsRes] = await Promise.all([
    supabase.from('cs_daily_updates').select('*, trips(name, kode_trip)').order('tanggal', { ascending: false }).limit(20),
    supabase.from('cs_daily_leads').select('*').order('tanggal', { ascending: false }).limit(7),
    supabase.from('cs_daily_leads').select('*').eq('tanggal', today).maybeSingle(),
  ]);

  const updates = updatesRes.data || [];
  const recentLeads = leadsRes.data || [];
  const todayLeads = todayLeadsRes.data;

  // Today summaries
  const todayUpdates = updates.filter((u) => u.tanggal === today);
  const todayClosing = todayUpdates.reduce((s, u) => s + (u.total_terjual_hari_ini || 0), 0);
  const todayLeadsTotal = todayLeads ? (todayLeads.leads_ig || 0) + (todayLeads.leads_tiktok || 0) + (todayLeads.leads_wa || 0) + (todayLeads.leads_fb || 0) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
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
        <SummaryCard label="Leads Hari Ini" value={todayLeadsTotal} color="text-blue-700" bg="bg-blue-50" />
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
          <p className="text-xs text-slate-500 mt-0.5">Total leads masuk per channel — bukan per trip.</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Today form */}
          <LeadsQuickForm initial={todayLeads ? { ...todayLeads } : { tanggal: today }} />

          {/* Recent 7 days */}
          {recentLeads.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-3 py-2">Tanggal</th>
                    <th className="px-3 py-2 text-right">📷 IG</th>
                    <th className="px-3 py-2 text-right">🎵 TikTok</th>
                    <th className="px-3 py-2 text-right">💬 WA</th>
                    <th className="px-3 py-2 text-right">📘 FB</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLeads.map((l) => {
                    const tot = (l.leads_ig || 0) + (l.leads_tiktok || 0) + (l.leads_wa || 0) + (l.leads_fb || 0);
                    return (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-700">{fmtDate(l.tanggal)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{l.leads_ig || 0}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{l.leads_tiktok || 0}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{l.leads_wa || 0}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{l.leads_fb || 0}</td>
                        <td className="px-3 py-2 text-right font-bold text-brand-700">{tot}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
            {updates.map((u) => (
              <div key={u.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-brand-700">
                      {u.trips?.kode_trip || `#${u.trip_id}`} — {u.trips?.name || 'Unknown trip'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDate(u.tanggal)}</p>
                  </div>
                  <div className="flex gap-2 text-xs flex-wrap">
                    <Chip label="Terjual" value={u.total_terjual_hari_ini || 0} color="text-green-700" bg="bg-green-50" />
                    <Chip label="Leads" value={u.jumlah_leads || 0} color="text-blue-700" bg="bg-blue-50" />
                    <Chip label="Sisa" value={u.sisa_seat || 0} color="text-amber-700" bg="bg-amber-50" />
                  </div>
                </div>
                <div className="mt-1.5 flex gap-2 text-[11px] text-slate-500 flex-wrap">
                  {u.from_instagram > 0 && <span>📷 IG: {u.from_instagram}</span>}
                  {u.from_whatsapp > 0 && <span>· 💬 WA: {u.from_whatsapp}</span>}
                  {u.from_offline > 0 && <span>· 🏪 Offline: {u.from_offline}</span>}
                  {u.closing_alumni > 0 && <span>· 🎓 Alumni: {u.closing_alumni}</span>}
                  {u.closing_mitra > 0 && <span>· 🤝 Mitra: {u.closing_mitra}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Chip({ label, value, color, bg }) {
  return <span className={`px-2 py-1 rounded font-semibold ${bg} ${color}`}>{label}: {value}</span>;
}
