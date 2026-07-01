// CEO Dashboard — ringkasan eksekutif + CEO AI (analyst/advisor). Owner-only, brand-aware.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtShort, fmtDate, daysUntil } from '@/lib/utils/format';
import { getRoleFromUser } from '@/lib/utils/roles';
import { buildCeoMetrics, monthLabel } from '@/lib/actions/ceo-metrics';
import CeoAiBriefing from '@/components/ceo/CeoAiBriefing';
import CeoAiChat from '@/components/ceo/CeoAiChat';

export const dynamic = 'force-dynamic';

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default async function CeoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let role = getRoleFromUser(user);
  if (user?.id) {
    const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (u?.role) role = u.role;
  }
  if (role !== 'owner') redirect('/dashboard');

  const m = await buildCeoMetrics();
  const maxOmzet = Math.max(1, ...m.months6.map((k) => m.omzetByMonth[k]));
  const maxClose = Math.max(1, ...m.months6.map((k) => m.closeByMonth[k]));

  const Delta = ({ v }) => v == null ? null : (
    <span className={`text-xs font-semibold ${v >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}%</span>
  );

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">🧠</span>
        <h1 className="text-2xl font-bold text-slate-800">CEO Dashboard</h1>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">OWNER</span>
      </div>
      <p className="text-sm text-slate-500 mb-5">Ringkasan eksekutif + CEO AI · {m.brandLabel} · {monthLabel(m.curMonth)}</p>

      {/* CEO AI — analyst & advisor otomatis (di atas) */}
      <CeoAiBriefing />

      {/* Ringkasan angka cepat */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">📌 Ringkasan Angka</p>
        <ul className="space-y-1.5 text-sm">
          {m.insights.map((t, i) => (<li key={i} className="flex gap-2"><span className="text-slate-400">•</span><span>{t}</span></li>))}
        </ul>
      </div>

      {/* KPI utama */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Omzet Masuk (MTD)</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{fmtRupiah(m.omzetThisMonth)}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Delta v={m.omzetDelta} />
            <span className="text-[10px] text-slate-400">vs periode sama bln lalu</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Hari {m.dayOfMonth}/{m.daysInMonth} · proyeksi ~{fmtShort(m.omzetProjection)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Closing (MTD)</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{m.closeThisMonth} <span className="text-sm font-medium text-slate-400">pax</span></p>
          <div className="mt-1 flex items-center gap-1.5">
            <Delta v={m.closeDelta} />
            <span className="text-[10px] text-slate-400">vs periode sama bln lalu</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Hari {m.dayOfMonth}/{m.daysInMonth} · proyeksi ~{m.closeProjection} pax</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Conversion Rate</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{m.convRate}%</p>
          <p className="text-xs text-slate-400 mt-1">{m.leadsThisMonth} leads bln ini</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Piutang Belum Lunas</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{fmtRupiah(m.outstanding)}</p>
          <p className="text-xs text-slate-400 mt-1">tagihan sent/partial</p>
        </div>
      </div>

      {/* KPI sekunder */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Omzet YTD {m.curYear}</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{fmtRupiah(m.omzetYtd)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nilai Kontrak Aktif</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{fmtRupiah(m.bookedValue)}</p>
          <p className="text-xs text-slate-400 mt-1">{m.activePaxCount} pax aktif</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Okupansi Trip Aktif</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{m.occupancy}%</p>
          <p className="text-xs text-slate-400 mt-1">{m.totalSeat}/{m.totalQuota} seat · {m.activeTripsCount} trip</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Refund Bln Ini</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{fmtRupiah(m.refundThisMonth)}</p>
          <p className="text-xs text-slate-400 mt-1">{m.refundCount} transaksi</p>
        </div>
      </div>

      {/* Trend 6 bulan */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Omzet Masuk · 6 Bulan</p>
          <div className="flex items-end gap-2 h-40">
            {m.months6.map((k) => (
              <div key={k} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-slate-500 font-medium">{fmtShort(m.omzetByMonth[k])}</span>
                <div className="w-full rounded-t bg-gradient-to-t from-emerald-500 to-emerald-400" style={{ height: `${Math.max(4, (m.omzetByMonth[k] / maxOmzet) * 120)}px` }} />
                <span className="text-[10px] text-slate-400">{monthLabel(k)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Closing (pax) · 6 Bulan</p>
          <div className="flex items-end gap-2 h-40">
            {m.months6.map((k) => (
              <div key={k} className="flex-1 flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-slate-500 font-medium">{m.closeByMonth[k]}</span>
                <div className="w-full rounded-t bg-gradient-to-t from-blue-500 to-blue-400" style={{ height: `${Math.max(4, (m.closeByMonth[k] / maxClose) * 120)}px` }} />
                <span className="text-[10px] text-slate-400">{monthLabel(k)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top trip + berangkat */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Top Trip · Nilai Kontrak</p>
          <div className="space-y-2">
            {m.topTrips.length === 0 && <p className="text-sm text-slate-400">Belum ada data.</p>}
            {m.topTrips.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg hover:bg-slate-50 px-2 py-1.5">
                <span className="text-sm text-slate-700 truncate">{t.kode}<span className="text-slate-400"> · {t.seat} pax</span></span>
                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{fmtShort(t.value)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Trip Berangkat ≤ 30 Hari</p>
          <div className="space-y-2">
            {m.upcoming30.length === 0 && <p className="text-sm text-slate-400">Tidak ada keberangkatan dalam 30 hari.</p>}
            {m.upcoming30.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg hover:bg-slate-50 px-2 py-1.5">
                <span className="text-sm text-slate-700 truncate">{t.kode}</span>
                <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">{fmtDate(t.departure)} · H-{t.dm}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Kolom chat — paling bawah */}
      <CeoAiChat />
    </div>
  );
}
