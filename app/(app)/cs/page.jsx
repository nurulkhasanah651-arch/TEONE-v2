// CS Daily — list of recent daily updates
// Server Component: fetches cs_daily_updates from Supabase

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function CSPage() {
  const supabase = createClient();

  // Fetch recent CS daily updates joined with trip info
  const { data: updates, error } = await supabase
    .from('cs_daily_updates')
    .select('*, trips(name, kode_trip)')
    .order('tanggal', { ascending: false })
    .limit(30);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-bold">Error loading CS updates</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  // Today's totals
  const today = new Date().toISOString().slice(0, 10);
  const todayUpdates = updates?.filter((u) => u.tanggal === today) || [];
  const todayTerjual = todayUpdates.reduce((s, u) => s + (u.total_terjual_hari_ini || 0), 0);
  const todayLeads = todayUpdates.reduce((s, u) => s + (u.jumlah_leads || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with CTA */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">CS Daily Updates</h1>
          <p className="mt-1 text-slate-600">Input harian dari tim CS — terjual, leads, sumber, sisa seat.</p>
        </div>
        <Link
          href="/cs/new"
          className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
        >
          <span>+</span> Input CS Daily
        </Link>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="Terjual Hari Ini" value={todayTerjual} color="text-green-700" bg="bg-green-50" />
        <SummaryCard label="Leads Hari Ini" value={todayLeads} color="text-blue-700" bg="bg-blue-50" />
        <SummaryCard label="Update Hari Ini" value={todayUpdates.length} color="text-brand-700" bg="bg-brand-50" />
      </div>

      {/* Recent updates list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Update Terbaru</h2>
        </div>
        {updates?.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-lg font-bold text-slate-700">Belum ada update</p>
            <p className="mt-1 text-sm text-slate-500">Klik tombol "Input CS Daily" untuk mulai.</p>
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
                  <div className="flex gap-3 text-xs">
                    <Chip label="Terjual" value={u.total_terjual_hari_ini || 0} color="text-green-700" bg="bg-green-50" />
                    <Chip label="Leads" value={u.jumlah_leads || 0} color="text-blue-700" bg="bg-blue-50" />
                    <Chip label="Sisa" value={u.sisa_seat || 0} color="text-amber-700" bg="bg-amber-50" />
                  </div>
                </div>
                {(u.from_instagram || u.from_whatsapp || u.from_offline) > 0 && (
                  <div className="mt-2 flex gap-2 text-[11px] text-slate-500">
                    <span>IG: {u.from_instagram || 0}</span>
                    <span>·</span>
                    <span>WA: {u.from_whatsapp || 0}</span>
                    <span>·</span>
                    <span>Offline: {u.from_offline || 0}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bg }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      <div className={`mt-2 h-1 w-8 rounded-full ${bg}`} />
    </div>
  );
}

function Chip({ label, value, color, bg }) {
  return (
    <span className={`px-2 py-1 rounded font-semibold ${bg} ${color}`}>
      {label}: {value}
    </span>
  );
}
