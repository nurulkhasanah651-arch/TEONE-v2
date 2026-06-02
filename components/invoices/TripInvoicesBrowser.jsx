'use client';

// Round 194: Trip Invoices Browser — compact list, klik trip → expand detail invoice
// Plus filter bulanan + status
// Path: components/invoices/TripInvoicesBrowser.jsx

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
  draft:     { label: 'Draft',         color: 'bg-slate-100 text-slate-700' },
  sent:      { label: 'Sent',          color: 'bg-amber-100 text-amber-800' },
  paid:      { label: '✅ Paid',       color: 'bg-green-100 text-green-800' },
  overdue:   { label: '⚠ Overdue',     color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500' },
};

export default function TripInvoicesBrowser({ groups = [] }) {
  const [monthFilter, setMonthFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [expandedTripId, setExpandedTripId] = useState(null);

  // Available months dari trip.departure
  const availableMonths = useMemo(() => {
    const set = new Set();
    for (const g of groups) {
      const key = getMonthKey(g.trip?.departure);
      if (key) set.add(key);
    }
    return Array.from(set).sort().reverse();
  }, [groups]);

  // Filter trips
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      // Month filter
      if (monthFilter !== 'all') {
        const key = getMonthKey(g.trip?.departure);
        if (key !== monthFilter) return false;
      }
      // Status filter (kalo all_paid, hide trips yg semua udah paid)
      if (statusFilter === 'has_unpaid') {
        const hasUnpaid = g.stats.total > g.stats.paid;
        if (!hasUnpaid) return false;
      } else if (statusFilter === 'all_paid') {
        const allPaid = g.stats.total > 0 && g.stats.total === g.stats.paid;
        if (!allPaid) return false;
      }
      // Search by trip name / kode
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const name = (g.trip?.name || '').toLowerCase();
        const kode = (g.trip?.kode_trip || '').toLowerCase();
        if (!name.includes(q) && !kode.includes(q)) return false;
      }
      return true;
    });
  }, [groups, monthFilter, statusFilter, searchText]);

  // Summary untuk filtered groups
  const summary = useMemo(() => {
    let totalInvoices = 0, paidInvoices = 0, totalAmount = 0, paidAmount = 0;
    for (const g of filteredGroups) {
      totalInvoices += g.stats.total;
      paidInvoices += g.stats.paid;
      totalAmount += g.stats.totalAmount;
      paidAmount += g.stats.paidAmount;
    }
    return { totalInvoices, paidInvoices, totalAmount, paidAmount, sisa: totalAmount - paidAmount };
  }, [filteredGroups]);

  function toggleExpand(tripId) {
    setExpandedTripId((cur) => (cur === tripId ? null : tripId));
  }

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
              <option value="all">Semua</option>
              <option value="has_unpaid">Masih Ada Tagihan</option>
              <option value="all_paid">Lunas Semua</option>
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

        {/* Summary */}
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Trip Ditampilkan</p>
            <p className="font-bold text-brand-700">{filteredGroups.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Total Invoice</p>
            <p className="font-bold text-slate-700">{summary.totalInvoices} <span className="text-xs text-green-700">({summary.paidInvoices} paid)</span></p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Total Tagihan</p>
            <p className="font-bold text-amber-700">{fmtRupiah(summary.totalAmount)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Sisa Tagihan</p>
            <p className="font-bold text-red-700">{fmtRupiah(summary.sisa)}</p>
          </div>
        </div>
      </div>

      {/* TRIP LIST (compact, collapsible) */}
      {filteredGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm">Tidak ada trip yang cocok dengan filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((g) => {
            const tripId = g.trip.id;
            const isExpanded = expandedTripId === tripId;
            const progressPct = g.stats.totalAmount > 0
              ? Math.round((g.stats.paidAmount / g.stats.totalAmount) * 100)
              : 0;
            const sisa = g.stats.totalAmount - g.stats.paidAmount;

            return (
              <div key={tripId} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                {/* TRIP HEADER (clickable) */}
                <button
                  onClick={() => toggleExpand(tripId)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-brand-50 text-brand-700">
                      {g.trip.kode_trip || `#${tripId}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 truncate">{g.trip.name || 'Trip'}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-slate-500">
                        <span>📅 {fmtDate(g.trip.departure)}</span>
                        <span>👥 {g.pesertaCount} peserta</span>
                        <span>📋 {g.stats.total} invoice</span>
                        {g.stats.paid > 0 && <span className="text-green-700 font-semibold">✓ {g.stats.paid} paid</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Sisa</p>
                      <p className={`font-bold text-sm ${sisa > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {fmtRupiah(sisa)}
                      </p>
                    </div>
                    <div className="w-14">
                      <p className="text-[10px] text-slate-500 text-center font-bold">{progressPct}%</p>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${progressPct === 100 ? 'bg-green-500' : 'bg-brand-500'}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-slate-400 text-lg">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* EXPANDED DETAIL */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/30 p-4 space-y-3">
                    {/* Quick action */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/trips/${tripId}`}
                          className="text-xs px-3 py-1.5 rounded bg-brand-100 text-brand-800 font-bold hover:bg-brand-200"
                        >
                          → Trip Detail
                        </Link>
                        <Link
                          href={`/finance/payments/${tripId}`}
                          className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-800 font-bold hover:bg-blue-200"
                        >
                          → Generate Invoice (Payment Checklist)
                        </Link>
                      </div>
                      <div className="text-xs text-slate-600">
                        Total: <b>{fmtRupiah(g.stats.totalAmount)}</b> · Paid: <b className="text-green-700">{fmtRupiah(g.stats.paidAmount)}</b> · Sisa: <b className="text-red-700">{fmtRupiah(sisa)}</b>
                      </div>
                    </div>

                    {/* Invoice list */}
                    {g.invoices.length === 0 ? (
                      <p className="text-sm text-slate-500 italic text-center py-3">Belum ada invoice untuk trip ini</p>
                    ) : (
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                            <tr>
                              <th className="px-3 py-2 text-left">Invoice No</th>
                              <th className="px-3 py-2 text-left">Peserta</th>
                              <th className="px-3 py-2 text-left">Milestone</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2 text-left">Due / Paid</th>
                              <th className="px-3 py-2 text-center">Status</th>
                              <th className="px-3 py-2 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {g.invoices.map((inv) => {
                              const s = STATUS_BADGE[inv.status] || STATUS_BADGE.draft;
                              return (
                                <tr key={inv.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-mono text-xs font-bold text-brand-700">
                                    {inv.invoice_no || `#${inv.id}`}
                                  </td>
                                  <td className="px-3 py-2 text-xs">{inv.customer_name || '—'}</td>
                                  <td className="px-3 py-2 text-xs">{inv.milestone || '—'}</td>
                                  <td className="px-3 py-2 text-right text-xs font-bold">{fmtRupiah(inv.amount)}</td>
                                  <td className="px-3 py-2 text-xs">
                                    {inv.status === 'paid' && inv.paid_at ? (
                                      <span className="text-green-700">Paid: {fmtDate(inv.paid_at)}</span>
                                    ) : inv.due_date ? (
                                      <span className="text-amber-700">Due: {fmtDate(inv.due_date)}</span>
                                    ) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${s.color}`}>{s.label}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <Link
                                      href={`/invoices/${inv.id}`}
                                      className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-semibold"
                                    >
                                      Detail →
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
