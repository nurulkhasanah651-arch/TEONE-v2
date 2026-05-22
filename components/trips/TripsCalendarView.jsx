'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';

const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_LABELS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export default function TripsCalendarView({ trips = [] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }
  function goToday() {
    setYear(today.getFullYear()); setMonth(today.getMonth());
  }

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map trips by departure date (YYYY-MM-DD)
  const tripsByDate = {};
  for (const t of trips) {
    if (!t.departure) continue;
    if (!t.departure.startsWith(monthStr)) continue;
    if (!tripsByDate[t.departure]) tripsByDate[t.departure] = [];
    tripsByDate[t.departure].push(t);
  }
  // Also map arrivals
  const arrivalsByDate = {};
  for (const t of trips) {
    if (!t.arrival) continue;
    if (!t.arrival.startsWith(monthStr)) continue;
    if (!arrivalsByDate[t.arrival]) arrivalsByDate[t.arrival] = [];
    arrivalsByDate[t.arrival].push(t);
  }

  // Build cells
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
    cells.push({
      day: d,
      date: dateStr,
      departures: tripsByDate[dateStr] || [],
      arrivals: arrivalsByDate[dateStr] || [],
      isToday: dateStr === today.toISOString().slice(0, 10),
    });
  }
  // Padding trailing
  while (cells.length % 7 !== 0) cells.push(null);

  // Trip list for this month (departure or arrival in this month)
  const tripsThisMonth = trips.filter((t) => {
    return (t.departure && t.departure.startsWith(monthStr)) ||
           (t.arrival && t.arrival.startsWith(monthStr));
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-brand-700">📅 Calendar {MONTH_LABELS[month]} {year}</h3>
          <div className="flex gap-1">
            <button onClick={prevMonth} className="px-3 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700">← Prev</button>
            <button onClick={goToday} className="px-3 py-1 text-xs font-semibold rounded bg-brand-500 hover:bg-brand-600 text-white">Today</button>
            <button onClick={nextMonth} className="px-3 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700">Next →</button>
          </div>
        </div>

        <div className="p-2">
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-red-600' : 'text-slate-600'}`}>{w}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              if (!c) return <div key={i} className="min-h-20 bg-slate-50/40 rounded" />;
              const events = [
                ...c.departures.map((t) => ({ trip: t, type: 'dep' })),
                ...c.arrivals.map((t) => ({ trip: t, type: 'arr' })),
              ];
              return (
                <div
                  key={i}
                  className={`min-h-20 rounded border ${c.isToday ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'} bg-white p-1`}
                >
                  <p className={`text-xs font-bold ${c.isToday ? 'text-brand-700' : 'text-slate-600'}`}>{c.day}</p>
                  <div className="mt-1 space-y-0.5">
                    {events.slice(0, 3).map((ev, idx) => {
                      const s = statusCfg(ev.trip.status);
                      const colorByStatus =
                        ev.trip.status === 'open selling' ? 'bg-blue-500' :
                        ev.trip.status === 'closed selling' ? 'bg-amber-500' :
                        ev.trip.status === 'ongoing' ? 'bg-green-500' :
                        ev.trip.status === 'completed' ? 'bg-slate-400' :
                        ev.trip.status === 'cancelled' ? 'bg-red-500' :
                        'bg-purple-500';
                      const label = ev.type === 'dep' ? '🛫' : '🛬';
                      return (
                        <Link
                          key={idx}
                          href={`/trips/${ev.trip.id}`}
                          className={`block text-[10px] font-semibold text-white px-1 py-0.5 rounded ${colorByStatus} hover:opacity-80 truncate`}
                          title={`${ev.type === 'dep' ? 'Berangkat' : 'Pulang'}: ${ev.trip.kode_trip || ev.trip.id} - ${ev.trip.name}`}
                        >
                          {label} {ev.trip.kode_trip || ev.trip.id}
                        </Link>
                      );
                    })}
                    {events.length > 3 && (
                      <p className="text-[9px] text-slate-500 italic">+{events.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-5 py-2 border-t border-slate-200 bg-slate-50 flex items-center gap-3 flex-wrap text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500"></span>Open Selling</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500"></span>Closed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500"></span>Ongoing</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-400"></span>Completed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span>Cancelled</span>
          <span className="ml-auto text-slate-500">🛫 = berangkat · 🛬 = pulang</span>
        </div>
      </div>

      {/* Trip list this month */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-brand-700">📋 Trip di {MONTH_LABELS[month]} {year} ({tripsThisMonth.length})</h3>
        </div>
        {tripsThisMonth.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Tidak ada trip di bulan ini.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {tripsThisMonth.map((t) => {
              const s = statusCfg(t.status);
              return (
                <Link key={t.id} href={`/trips/${t.id}`} className="block px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        🛫 {fmtDate(t.departure)} → 🛬 {fmtDate(t.arrival)} · {t.sold || 0}/{t.quota || 0} pax
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
