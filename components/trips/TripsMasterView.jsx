'use client';

// Round 79: Trips Master — restored List Priority + Calendar sub-views di tab Active
// Top tabs: Active / Monthly Recap / Yearly Recap / History
// Active tab sub-views: 🎴 Card / 📋 List Priority / 📅 Calendar

import { useState, useMemo } from 'react';
import Link from 'next/link';
import TripCard from './TripCard';

// Defensive imports — kalau file ga ada, fallback null
let TripsListView = null;
try { TripsListView = require('./TripsListView').default; } catch {}

let TripsCalendarView = null;
try { TripsCalendarView = require('./TripsCalendarView').default; } catch {}

function fmtMonthLabel(key) {
  if (!key || key === 'unknown') return '— Tidak ada tanggal —';
  const [y, m] = key.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function getMonthKey(dateStr) {
  if (!dateStr) return 'unknown';
  return String(dateStr).slice(0, 7);
}
function getYearKey(dateStr) {
  if (!dateStr) return 'unknown';
  return String(dateStr).slice(0, 4);
}

function fmtRupiah(n) {
  const v = Number(n) || 0;
  return 'Rp ' + v.toLocaleString('id-ID');
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function tripToRow(t, paxCount = 0) {
  return [
    t.kode_trip || `#${t.id}`,
    t.name || '',
    t.destination || '',
    t.ticket || '',
    t.status || '',
    t.departure || '',
    t.arrival || '',
    t.deadline_close || '',
    t.publish_date || '',
    t.closed_at || '',
    t.quota || 0,
    t.sold || 0,
    t.seat_left || 0,
    paxCount,
    t.pic || '',
    t.tl_name || '',
    t.pnr || '',
    t.route || '',
    Number(t.price) || 0,
    t.notes || '',
  ];
}

const CSV_HEADERS = [
  'Kode', 'Nama Trip', 'Destinasi', 'Tipe Tiket', 'Status',
  'Departure', 'Arrival', 'Deadline Booking', 'Publish', 'Closed At',
  'Quota', 'Sold', 'Seat Left', 'Peserta',
  'PIC', 'Tour Leader', 'PNR', 'Route', 'Harga (DBL)', 'Notes',
];

export default function TripsMasterView({ trips = [], paxByTrip = {} }) {
  const safe = Array.isArray(trips) ? trips : [];
  const [view, setView] = useState('active'); // active | monthly | yearly | history
  const [monthFilter, setMonthFilter] = useState(''); // YYYY-MM filter untuk card view
  const [activeSubView, setActiveSubView] = useState('card'); // card | list | calendar

  // SPLIT trips: active vs history
  const activeTrips = useMemo(() => {
    return safe.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  }, [safe]);

  const historyTrips = useMemo(() => {
    return safe.filter((t) => t.status === 'completed' || t.status === 'cancelled');
  }, [safe]);

  // Card view dengan filter bulan
  const filteredActive = useMemo(() => {
    if (!monthFilter) return activeTrips;
    return activeTrips.filter((t) => getMonthKey(t.departure) === monthFilter);
  }, [activeTrips, monthFilter]);

  // Available months untuk dropdown filter
  const availableMonths = useMemo(() => {
    const set = new Set();
    for (const t of activeTrips) {
      const k = getMonthKey(t.departure);
      if (k !== 'unknown') set.add(k);
    }
    return Array.from(set).sort();
  }, [activeTrips]);

  // Monthly aggregate (semua trips kecuali cancelled)
  const monthlyGroups = useMemo(() => {
    const map = {};
    for (const t of safe) {
      if (t.status === 'cancelled') continue;
      const k = getMonthKey(t.departure);
      if (!map[k]) map[k] = { key: k, trips: [], total_quota: 0, total_sold: 0, total_seat_left: 0, total_revenue: 0 };
      map[k].trips.push(t);
      map[k].total_quota += t.quota || 0;
      map[k].total_sold += t.sold || 0;
      map[k].total_seat_left += t.seat_left || 0;
      map[k].total_revenue += (Number(t.price) || 0) * (t.sold || 0);
    }
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [safe]);

  // Yearly aggregate
  const yearlyGroups = useMemo(() => {
    const map = {};
    for (const t of safe) {
      if (t.status === 'cancelled') continue;
      const k = getYearKey(t.departure);
      if (!map[k]) map[k] = { key: k, trips: [], total_quota: 0, total_sold: 0, total_seat_left: 0, total_revenue: 0 };
      map[k].trips.push(t);
      map[k].total_quota += t.quota || 0;
      map[k].total_sold += t.sold || 0;
      map[k].total_seat_left += t.seat_left || 0;
      map[k].total_revenue += (Number(t.price) || 0) * (t.sold || 0);
    }
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [safe]);

  function handleDownload() {
    let filename = '';
    let rows = [CSV_HEADERS];

    let source = [];
    if (view === 'active') {
      source = filteredActive;
      filename = monthFilter ? `master_trip_active_${monthFilter}.csv` : 'master_trip_active.csv';
    } else if (view === 'monthly') {
      filename = 'master_trip_rekap_bulanan.csv';
      // Special: flat list semua trip dengan kolom Month
      rows = [['Bulan', ...CSV_HEADERS]];
      for (const g of monthlyGroups) {
        for (const t of g.trips) {
          const pax = (paxByTrip[t.id] || []).length;
          rows.push([fmtMonthLabel(g.key), ...tripToRow(t, pax)]);
        }
      }
      downloadCSV(filename, rows);
      return;
    } else if (view === 'yearly') {
      filename = 'master_trip_rekap_tahunan.csv';
      rows = [['Tahun', ...CSV_HEADERS]];
      for (const g of yearlyGroups) {
        for (const t of g.trips) {
          const pax = (paxByTrip[t.id] || []).length;
          rows.push([g.key, ...tripToRow(t, pax)]);
        }
      }
      downloadCSV(filename, rows);
      return;
    } else {
      source = historyTrips;
      filename = 'master_trip_history_completed.csv';
    }

    for (const t of source) {
      const pax = (paxByTrip[t.id] || []).length;
      rows.push(tripToRow(t, pax));
    }
    downloadCSV(filename, rows);
  }

  return (
    <div className="space-y-4">
      {/* View tabs + Download */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 flex-wrap">
          <Tab active={view === 'active'} onClick={() => setView('active')}>🎴 Active ({activeTrips.length})</Tab>
          <Tab active={view === 'monthly'} onClick={() => setView('monthly')}>📅 Rekap Bulanan</Tab>
          <Tab active={view === 'yearly'} onClick={() => setView('yearly')}>📊 Rekap Tahunan</Tab>
          <Tab active={view === 'history'} onClick={() => setView('history')}>🗄 History ({historyTrips.length})</Tab>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
        >
          ⬇ Download Excel ({view})
        </button>
      </div>

      {/* ACTIVE VIEW — Sub-view switcher (Card/List/Calendar) + month filter */}
      {view === 'active' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Sub-view tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              <SubTab active={activeSubView === 'card'} onClick={() => setActiveSubView('card')}>🎴 Card</SubTab>
              {TripsListView && (
                <SubTab active={activeSubView === 'list'} onClick={() => setActiveSubView('list')}>📋 List Priority</SubTab>
              )}
              {TripsCalendarView && (
                <SubTab active={activeSubView === 'calendar'} onClick={() => setActiveSubView('calendar')}>📅 Calendar</SubTab>
              )}
            </div>

            {/* Filter bulan — cuma muncul untuk Card view */}
            {activeSubView === 'card' && (
              <>
                <span className="text-xs font-semibold text-slate-600">Filter Bulan:</span>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="">— Semua bulan —</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{fmtMonthLabel(m)}</option>
                  ))}
                </select>
                {monthFilter && (
                  <button
                    type="button"
                    onClick={() => setMonthFilter('')}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Reset
                  </button>
                )}
                <span className="text-xs text-slate-500">({filteredActive.length} trip)</span>
              </>
            )}
          </div>

          {/* CARD VIEW */}
          {activeSubView === 'card' && (
            filteredActive.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-lg font-bold text-slate-700">
                  {monthFilter ? 'Tidak ada trip di bulan ini' : 'Belum ada trip active'}
                </p>
                <Link href="/trips/new" className="mt-3 inline-block text-sm text-brand-600 hover:underline font-semibold">+ Buat Trip Baru</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredActive.map((t) => <TripCard key={t.id} trip={t} />)}
              </div>
            )
          )}

          {/* LIST PRIORITY VIEW */}
          {activeSubView === 'list' && TripsListView && (
            <TripsListView trips={activeTrips} />
          )}

          {/* CALENDAR VIEW */}
          {activeSubView === 'calendar' && TripsCalendarView && (
            <TripsCalendarView trips={activeTrips} />
          )}
        </>
      )}

      {/* MONTHLY RECAP */}
      {view === 'monthly' && (
        <MonthlyView groups={monthlyGroups} paxByTrip={paxByTrip} />
      )}

      {/* YEARLY RECAP */}
      {view === 'yearly' && (
        <YearlyView groups={yearlyGroups} paxByTrip={paxByTrip} />
      )}

      {/* HISTORY */}
      {view === 'history' && (
        <HistoryView trips={historyTrips} paxByTrip={paxByTrip} />
      )}
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
    >
      {children}
    </button>
  );
}

function SubTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${active ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  );
}

function MonthlyView({ groups, paxByTrip }) {
  if (!groups || groups.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Belum ada data trip.</p>;
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const pax = g.trips.reduce((s, t) => s + (paxByTrip[t.id] || []).length, 0);
        return (
          <div key={g.key} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-5 py-3 bg-brand-50 border-b border-brand-200 flex items-center justify-between flex-wrap gap-2">
              <p className="font-bold text-brand-700">📅 {fmtMonthLabel(g.key)}</p>
              <div className="flex gap-3 text-xs flex-wrap">
                <Stat label="Trip" value={g.trips.length} />
                <Stat label="Quota" value={g.total_quota} />
                <Stat label="Sold" value={g.total_sold} />
                <Stat label="Seat Left" value={g.total_seat_left} />
                <Stat label="Peserta" value={pax} />
                <Stat label="Revenue (DBL × sold)" value={fmtRupiah(g.total_revenue)} />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {g.trips.map((t) => <TripRow key={t.id} trip={t} pax={(paxByTrip[t.id] || []).length} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YearlyView({ groups, paxByTrip }) {
  if (!groups || groups.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Belum ada data trip.</p>;
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const pax = g.trips.reduce((s, t) => s + (paxByTrip[t.id] || []).length, 0);
        return (
          <div key={g.key} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-5 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between flex-wrap gap-2">
              <p className="font-bold text-green-700">📊 Tahun {g.key === 'unknown' ? '—' : g.key}</p>
              <div className="flex gap-3 text-xs flex-wrap">
                <Stat label="Trip" value={g.trips.length} />
                <Stat label="Quota" value={g.total_quota} />
                <Stat label="Sold" value={g.total_sold} />
                <Stat label="Seat Left" value={g.total_seat_left} />
                <Stat label="Peserta" value={pax} />
                <Stat label="Revenue (DBL × sold)" value={fmtRupiah(g.total_revenue)} />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {g.trips.map((t) => <TripRow key={t.id} trip={t} pax={(paxByTrip[t.id] || []).length} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryView({ trips, paxByTrip }) {
  if (!trips || trips.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-4xl mb-3">🗄</p>
        <p className="text-lg font-bold text-slate-700">Belum ada trip selesai</p>
        <p className="mt-1 text-sm text-slate-500">Trip dengan status "Completed" atau "Cancelled" muncul di sini.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
        <p className="font-bold text-slate-700">🗄 History — {trips.length} trip selesai/dibatalkan</p>
      </div>
      <div className="divide-y divide-slate-100">
        {trips.map((t) => <TripRow key={t.id} trip={t} pax={(paxByTrip[t.id] || []).length} showStatus />)}
      </div>
    </div>
  );
}

function TripRow({ trip, pax, showStatus = false }) {
  const t = trip;
  return (
    <Link href={`/trips/${t.id}`} className="block px-5 py-3 hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
            {showStatus && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {t.status === 'completed' ? '✓ Completed' : '✕ Cancelled'}
              </span>
            )}
            {t.ticket && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">{t.ticket}</span>}
          </div>
          <p className="mt-0.5 text-sm font-bold text-slate-800">{t.name}</p>
          <p className="text-xs text-slate-500">{t.departure || '—'} · {t.destination || '—'} · {pax} peserta</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p><span className="font-semibold">{t.sold || 0}</span> / {t.quota || 0} sold</p>
          <p className="text-amber-700 font-semibold">Sisa: {t.seat_left ?? 0}</p>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }) {
  return (
    <span className="text-xs">
      <span className="text-slate-500">{label}:</span> <span className="font-bold text-slate-800">{value}</span>
    </span>
  );
}
