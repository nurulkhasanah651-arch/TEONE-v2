'use client';

import Link from 'next/link';
import { fmtDate, fmtRupiah, daysUntil } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import { priorityScore, priorityLabel } from '@/lib/utils/trip-priority';

export default function TripsListView({ trips = [] }) {
  // Sort by priority score desc
  const sorted = [...trips].sort((a, b) => priorityScore(b) - priorityScore(a));

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-card">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-lg font-bold text-slate-700">Belum ada trip</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-bold text-brand-700">📋 List Trip (sorted by Priority Push Selling)</h3>
        <p className="text-xs text-slate-500 mt-0.5">URGENT/Push di atas, completed/cancelled di bawah</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Priority</th>
              <th className="px-3 py-2 text-left">Trip</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Seat</th>
              <th className="px-3 py-2 text-right">Fill %</th>
              <th className="px-3 py-2 text-left">Berangkat</th>
              <th className="px-3 py-2 text-left">Deadline</th>
              <th className="px-3 py-2 text-right">Revenue Proyeksi</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((t, idx) => {
              const s = statusCfg(t.status);
              const score = priorityScore(t);
              const prio = priorityLabel(score);
              const days = daysUntil(t.departure);
              const daysDeadline = daysUntil(t.deadline_close);
              const fillRate = t.quota > 0 ? Math.round((t.sold || 0) / t.quota * 100) : 0;
              const revenue = (t.price || 0) * (t.sold || 0);

              const fillColor =
                fillRate >= 100 ? 'text-green-700' :
                fillRate >= 80 ? 'text-blue-700' :
                fillRate >= 50 ? 'text-amber-700' :
                'text-red-700';

              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${prio.color}`}>
                      {prio.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/trips/${t.id}`} className="font-semibold text-brand-700 hover:underline text-sm">
                      {t.kode_trip || `#${t.id}`}
                    </Link>
                    <p className="text-[11px] text-slate-500">{t.name}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <span className="font-bold">{t.sold || 0}</span>
                    <span className="text-slate-400">/{t.quota || 0}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs font-bold ${fillColor}`}>{fillRate}%</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.departure ? (
                      <>
                        <p className="text-slate-700">{fmtDate(t.departure)}</p>
                        {days != null && days >= 0 && (
                          <p className={`text-[10px] font-bold ${days <= 14 ? 'text-red-700' : days <= 30 ? 'text-amber-700' : 'text-slate-500'}`}>
                            {days}h lagi
                          </p>
                        )}
                      </>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {t.deadline_close ? (
                      <>
                        <p className="text-slate-700">{fmtDate(t.deadline_close)}</p>
                        {daysDeadline != null && (
                          <p className={`text-[10px] font-bold ${daysDeadline < 0 ? 'text-red-700' : daysDeadline <= 14 ? 'text-amber-700' : 'text-slate-500'}`}>
                            {daysDeadline < 0 ? `lewat ${Math.abs(daysDeadline)}h` : `${daysDeadline}h`}
                          </p>
                        )}
                      </>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-green-700">
                    {fmtRupiah(revenue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/trips/${t.id}`} className="text-xs text-brand-600 hover:underline font-semibold">Buka →</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
