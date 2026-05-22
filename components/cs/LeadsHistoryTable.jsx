'use client';

// Round 75: view switcher (daily 7d / weekly / monthly) + edit row + download CSV
// Data dipass dari /cs page (server) sebagai prop

import { useState, useMemo } from 'react';
import LeadsQuickForm from './LeadsQuickForm';

function fmtDateID(s) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

function fmtDayShort(s) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
  } catch {
    return s;
  }
}

// Get Monday of the week as YYYY-MM-DD
function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getWeekEnd(dateStr) {
  const start = new Date(getWeekStart(dateStr));
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}

function getMonthKey(dateStr) {
  return String(dateStr).slice(0, 7); // YYYY-MM
}

function fmtMonthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function emptyAggregate() {
  return {
    leads_ig: 0, leads_tiktok: 0, leads_wa: 0, leads_fb: 0,
    leads_ads_meta: 0, leads_ads_google: 0, leads_ads_tiktok: 0,
    organic: 0, ads: 0, total: 0,
  };
}

function addRow(agg, l) {
  agg.leads_ig += l.leads_ig || 0;
  agg.leads_tiktok += l.leads_tiktok || 0;
  agg.leads_wa += l.leads_wa || 0;
  agg.leads_fb += l.leads_fb || 0;
  agg.leads_ads_meta += l.leads_ads_meta || 0;
  agg.leads_ads_google += l.leads_ads_google || 0;
  agg.leads_ads_tiktok += l.leads_ads_tiktok || 0;
  agg.organic = agg.leads_ig + agg.leads_tiktok + agg.leads_wa + agg.leads_fb;
  agg.ads = agg.leads_ads_meta + agg.leads_ads_google + agg.leads_ads_tiktok;
  agg.total = agg.organic + agg.ads;
  return agg;
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',')).join('\n');

  // BOM + UTF-8 biar Excel kebuka dengan benar
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeadsHistoryTable({ allLeads = [] }) {
  const safeLeads = Array.isArray(allLeads) ? allLeads : [];
  const [view, setView] = useState('daily'); // daily | weekly | monthly
  const [editRow, setEditRow] = useState(null);

  // Daily — sorted desc, max 7 hari terakhir
  const dailyRows = useMemo(() => {
    return [...safeLeads].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '')).slice(0, 7);
  }, [safeLeads]);

  // Weekly aggregate
  const weeklyRows = useMemo(() => {
    const map = {};
    for (const l of safeLeads) {
      if (!l.tanggal) continue;
      const k = getWeekStart(l.tanggal);
      if (!map[k]) map[k] = { weekStart: k, weekEnd: getWeekEnd(l.tanggal), ...emptyAggregate() };
      addRow(map[k], l);
    }
    return Object.values(map).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [safeLeads]);

  // Monthly aggregate
  const monthlyRows = useMemo(() => {
    const map = {};
    for (const l of safeLeads) {
      if (!l.tanggal) continue;
      const k = getMonthKey(l.tanggal);
      if (!map[k]) map[k] = { monthKey: k, ...emptyAggregate() };
      addRow(map[k], l);
    }
    return Object.values(map).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [safeLeads]);

  function handleDownload() {
    const headers = ['Periode', 'IG', 'TikTok', 'WA', 'FB', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Organic', 'Ads', 'Total'];
    let rows = [headers];
    let filename = '';

    if (view === 'daily') {
      filename = `leads_harian_7hari_terakhir.csv`;
      // semua data harian (ga cuma 7) → lebih useful
      const all = [...safeLeads].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
      for (const l of all) {
        const org = (l.leads_ig || 0) + (l.leads_tiktok || 0) + (l.leads_wa || 0) + (l.leads_fb || 0);
        const ad = (l.leads_ads_meta || 0) + (l.leads_ads_google || 0) + (l.leads_ads_tiktok || 0);
        rows.push([
          l.tanggal,
          l.leads_ig || 0, l.leads_tiktok || 0, l.leads_wa || 0, l.leads_fb || 0,
          l.leads_ads_meta || 0, l.leads_ads_google || 0, l.leads_ads_tiktok || 0,
          org, ad, org + ad,
        ]);
      }
    } else if (view === 'weekly') {
      filename = `leads_rekap_mingguan.csv`;
      for (const w of weeklyRows) {
        rows.push([
          `${w.weekStart} → ${w.weekEnd}`,
          w.leads_ig, w.leads_tiktok, w.leads_wa, w.leads_fb,
          w.leads_ads_meta, w.leads_ads_google, w.leads_ads_tiktok,
          w.organic, w.ads, w.total,
        ]);
      }
    } else {
      filename = `leads_rekap_bulanan.csv`;
      for (const m of monthlyRows) {
        rows.push([
          fmtMonthLabel(m.monthKey),
          m.leads_ig, m.leads_tiktok, m.leads_wa, m.leads_fb,
          m.leads_ads_meta, m.leads_ads_google, m.leads_ads_tiktok,
          m.organic, m.ads, m.total,
        ]);
      }
    }

    downloadCSV(filename, rows);
  }

  return (
    <div className="space-y-3">
      {/* View switcher + download */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <ViewBtn active={view === 'daily'} onClick={() => setView('daily')}>📅 7 Hari Terakhir</ViewBtn>
          <ViewBtn active={view === 'weekly'} onClick={() => setView('weekly')}>📊 Rekap Mingguan</ViewBtn>
          <ViewBtn active={view === 'monthly'} onClick={() => setView('monthly')}>📈 Rekap Bulanan</ViewBtn>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
        >
          ⬇ Download Excel ({view === 'daily' ? 'semua harian' : view === 'weekly' ? 'mingguan' : 'bulanan'})
        </button>
      </div>

      {/* Edit modal — render inline */}
      {editRow && (
        <div className="border border-amber-300 rounded-xl p-1 bg-amber-50/40">
          <p className="px-3 pt-2 text-xs font-bold text-amber-700">EDIT MODE — {editRow.tanggal}</p>
          <LeadsQuickForm initial={editRow} mode="edit" onCancel={() => setEditRow(null)} />
        </div>
      )}

      {/* Table */}
      {view === 'daily' && (
        <DailyTable rows={dailyRows} onEdit={setEditRow} />
      )}
      {view === 'weekly' && (
        <WeeklyTable rows={weeklyRows} />
      )}
      {view === 'monthly' && (
        <MonthlyTable rows={monthlyRows} />
      )}
    </div>
  );
}

function ViewBtn({ active, onClick, children }) {
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

function DailyTable({ rows, onEdit }) {
  if (!rows || rows.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Belum ada data 7 hari terakhir.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
            <th className="px-2 py-2">Tanggal</th>
            <th className="px-2 py-2 text-right">IG</th>
            <th className="px-2 py-2 text-right">TikTok</th>
            <th className="px-2 py-2 text-right">WA</th>
            <th className="px-2 py-2 text-right">FB</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Meta</th>
            <th className="px-2 py-2 text-right">Google</th>
            <th className="px-2 py-2 text-right">TikTok Ads</th>
            <th className="px-2 py-2 text-right border-l border-slate-200 font-extrabold">Total</th>
            <th className="px-2 py-2 text-right">⚙</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => {
            const org = (l.leads_ig || 0) + (l.leads_tiktok || 0) + (l.leads_wa || 0) + (l.leads_fb || 0);
            const ad = (l.leads_ads_meta || 0) + (l.leads_ads_google || 0) + (l.leads_ads_tiktok || 0);
            return (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-2 py-2 font-semibold text-slate-700">{fmtDayShort(l.tanggal)}</td>
                <td className="px-2 py-2 text-right">{l.leads_ig || 0}</td>
                <td className="px-2 py-2 text-right">{l.leads_tiktok || 0}</td>
                <td className="px-2 py-2 text-right">{l.leads_wa || 0}</td>
                <td className="px-2 py-2 text-right">{l.leads_fb || 0}</td>
                <td className="px-2 py-2 text-right text-blue-700 border-l border-slate-200">{l.leads_ads_meta || 0}</td>
                <td className="px-2 py-2 text-right text-red-700">{l.leads_ads_google || 0}</td>
                <td className="px-2 py-2 text-right">{l.leads_ads_tiktok || 0}</td>
                <td className="px-2 py-2 text-right font-bold text-brand-700 border-l border-slate-200">{org + ad}</td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(l)}
                    className="text-xs px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold"
                    title="Edit"
                  >
                    ✎
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-slate-500">Cuma 7 hari terakhir ditampilkan. Data lebih lama → switch ke Rekap Mingguan/Bulanan atau download Excel.</p>
    </div>
  );
}

function WeeklyTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Belum ada data mingguan.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
            <th className="px-2 py-2">Minggu</th>
            <th className="px-2 py-2 text-right">IG</th>
            <th className="px-2 py-2 text-right">TikTok</th>
            <th className="px-2 py-2 text-right">WA</th>
            <th className="px-2 py-2 text-right">FB</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Meta</th>
            <th className="px-2 py-2 text-right">Google</th>
            <th className="px-2 py-2 text-right">TikTok Ads</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Organic</th>
            <th className="px-2 py-2 text-right">Ads</th>
            <th className="px-2 py-2 text-right font-extrabold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((w) => (
            <tr key={w.weekStart} className="hover:bg-slate-50">
              <td className="px-2 py-2 font-semibold text-slate-700">{fmtDateID(w.weekStart)} → {fmtDateID(w.weekEnd)}</td>
              <td className="px-2 py-2 text-right">{w.leads_ig}</td>
              <td className="px-2 py-2 text-right">{w.leads_tiktok}</td>
              <td className="px-2 py-2 text-right">{w.leads_wa}</td>
              <td className="px-2 py-2 text-right">{w.leads_fb}</td>
              <td className="px-2 py-2 text-right text-blue-700 border-l border-slate-200">{w.leads_ads_meta}</td>
              <td className="px-2 py-2 text-right text-red-700">{w.leads_ads_google}</td>
              <td className="px-2 py-2 text-right">{w.leads_ads_tiktok}</td>
              <td className="px-2 py-2 text-right text-green-700 border-l border-slate-200 font-semibold">{w.organic}</td>
              <td className="px-2 py-2 text-right text-orange-700 font-semibold">{w.ads}</td>
              <td className="px-2 py-2 text-right font-bold text-brand-700">{w.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Belum ada data bulanan.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
            <th className="px-2 py-2">Bulan</th>
            <th className="px-2 py-2 text-right">IG</th>
            <th className="px-2 py-2 text-right">TikTok</th>
            <th className="px-2 py-2 text-right">WA</th>
            <th className="px-2 py-2 text-right">FB</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Meta</th>
            <th className="px-2 py-2 text-right">Google</th>
            <th className="px-2 py-2 text-right">TikTok Ads</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Organic</th>
            <th className="px-2 py-2 text-right">Ads</th>
            <th className="px-2 py-2 text-right font-extrabold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((m) => (
            <tr key={m.monthKey} className="hover:bg-slate-50">
              <td className="px-2 py-2 font-semibold text-slate-700">{fmtMonthLabel(m.monthKey)}</td>
              <td className="px-2 py-2 text-right">{m.leads_ig}</td>
              <td className="px-2 py-2 text-right">{m.leads_tiktok}</td>
              <td className="px-2 py-2 text-right">{m.leads_wa}</td>
              <td className="px-2 py-2 text-right">{m.leads_fb}</td>
              <td className="px-2 py-2 text-right text-blue-700 border-l border-slate-200">{m.leads_ads_meta}</td>
              <td className="px-2 py-2 text-right text-red-700">{m.leads_ads_google}</td>
              <td className="px-2 py-2 text-right">{m.leads_ads_tiktok}</td>
              <td className="px-2 py-2 text-right text-green-700 border-l border-slate-200 font-semibold">{m.organic}</td>
              <td className="px-2 py-2 text-right text-orange-700 font-semibold">{m.ads}</td>
              <td className="px-2 py-2 text-right font-bold text-brand-700">{m.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
