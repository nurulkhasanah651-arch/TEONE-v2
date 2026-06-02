'use client';

// R194b: Payment Checklist Table dengan filter Bulan + Status + Search
// Path: components/finance/PaymentChecklistTable.jsx

import { useState, useMemo } from 'react';
import Link from 'next/link';

function fmtRupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

function getMonthKey(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  } catch { return ''; }
}

function getMonthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

const STATUS_BADGE = {
  'open selling': { label: 'Open Selling', bg: 'bg-blue-100', text: 'text-blue-800' },
  'closed': { label: 'Closed', bg: 'bg-slate-100', text: 'text-slate-700' },
  'completed': { label: 'Completed', bg: 'bg-green-100', text: 'text-green-800' },
  'cancelled': { label: 'Cancelled', bg: 'bg-red-100', text: 'text-red-700' },
  'prepare to sell': { label: 'Prepare to Sell', bg: 'bg-amber-100', text: 'text-amber-800' },
};

function statusBadge(status) {
  return STATUS_BADGE[status] || { label: status || '—', bg: 'bg-slate-100', text: 'text-slate-700' };
}

export default function PaymentChecklistTable({ trips = [] }) {
  const [monthFilter, setMonthFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchText, setSearchText] = useState('');

  const availableMonths = useMemo(() => {
    const set = new Set();
    for (const t of trips) {
      const key = getMonthKey(t.departure);
      if (key) set.add(key);
    }
    return Array.from(set).sort().reverse();
  }, [trips]);

  const availableStatus = useMemo(() => {
    const set = new Set();
    for (const t of trips) {
      if (t.status) set.add(t.status);
    }
    return Array.from(set).sort();
  }, [trips]);

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      // Month filter
      if (monthFilter !== 'all') {
        const key = getMonthKey(t.departure);
        if (key !== monthFilter) return false;
      }
      // Status filter
      if (statusFilter === 'all_paid') {
        const allPaid = t.expected > 0 && t.paid >= t.expected;
        if (!allPaid) return false;
      } else if (statusFilter === 'has_unpaid') {
        const hasUnpaid = t.expected > t.paid;
        if (!hasUnpaid) return false;
      } else if (statusFilter !== 'all') {
        if (t.status !== statusFilter) return false;
      }
      // Search
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const name = (t.name || '').toLowerCase();
        const kode = (t.kode_trip || '').toLowerCase();
        if (!name.includes(q) && !kode.includes(q)) return false;
      }
      return true;
    });
  }, [trips, monthFilter, statusFilter, searchText]);

  // Summary
  const summary = useMemo(() => {
    let expected = 0, paid = 0, pax = 0, lunas = 0;
    for (const t of filteredTrips) {
      expected += t.expected || 0;
      paid += t.paid || 0;
      pax += t.paxCount || 0;
      lunas += t.lunasCount || 0;
    }
    return { expected, paid, pax, lunas, sisa: expected - paid };
  }, [filteredTrips]);

  return (
    <div className="space-y-4">
      {/* FILTER BAR */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase block mb-1">📅 Bulan Keberangkatan</label>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-semibold bg-white focus:border-brand-500 outline-none"
            >
              <option value="all">Semua Bulan</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>{getMonthLabel(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase block mb-1">📊 Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-semibold bg-white focus:border-brand-500 outline-none"
            >
              <option value="all">Semua Trip</option>
              <option value="has_unpaid">⚠ Masih Ada Tagihan</option>
              <option value="all_paid">✅ Lunas Semua</option>
              <optgroup label="Status Trip">
                {availableStatus.map((s) => {
                  const b = statusBadge(s);
                  return <option key={s} value={s}>{b.label}</option>;
                })}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase block mb-1">🔍 Cari Trip</label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Nama / kode trip..."
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm bg-white focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        {/* Summary live */}
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Trip</p>
            <p className="font-bold text-brand-700">{filteredTrips.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Pax</p>
            <p className="font-bold text-slate-700">{summary.pax} <span className="text-xs text-green-700">({summary.lunas} lunas)</span></p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Expected</p>
            <p className="font-bold text-amber-700">{fmtRupiah(summary.expected)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Paid</p>
            <p className="font-bold text-green-700">{fmtRupiah(summary.paid)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Sisa</p>
            <p className="font-bold text-red-700">{fmtRupiah(summary.sisa)}</p>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-brand-700">Trip & Status Pembayaran Group</h2>
          <p className="text-xs text-slate-500">{filteredTrips.length} trip ditampilkan</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-2.5">Trip</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Peserta</th>
                <th className="px-3 py-2.5 text-right">Expected</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Lunas</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTrips.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                  {trips.length === 0 ? 'Belum ada trip.' : 'Tidak ada trip yg cocok filter — coba ubah filter.'}
                </td></tr>
              ) : filteredTrips.map((t) => {
                const s = statusBadge(t.status);
                const progress = t.expected > 0 ? Math.round((t.paid / t.expected) * 100) : 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-brand-700">{t.kode_trip || `#${t.id}`}</p>
                      <p className="text-xs text-slate-500">{t.name}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(t.departure)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">{t.paxCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{fmtRupiah(t.expected)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-bold text-green-700">{fmtRupiah(t.paid)}</p>
                      <p className="text-[10px] text-slate-500">{progress}%</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-xs font-bold ${t.lunasCount === t.paxCount && t.paxCount > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                        {t.lunasCount} / {t.paxCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/finance/payments/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                        Detail →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
