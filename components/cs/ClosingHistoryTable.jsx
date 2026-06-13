'use client';

// Round 78: Closing per Trip
// - Daily view: 30 hari terakhir (sebulan rolling)
// - Setelah ganti bulan → data auto masuk ke rekap bulanan
// - Download daily include detail PESERTA CLOSING (nama, email, phone, trip, tanggal join)

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { deleteCSUpdate } from '@/lib/actions/cs';
import { fmtDate } from '@/lib/utils/format';

function fmtDateID(s) {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
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
  return String(dateStr).slice(0, 7);
}
function fmtMonthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function organic(u) {
  return (u.from_instagram || 0) + (u.from_whatsapp || 0) + (u.from_offline || 0)
    + (u.closing_alumni || 0) + (u.closing_mitra || 0) + (u.from_website || 0);
}
function ads(u) {
  return (u.from_ads_meta || 0) + (u.from_ads_google || 0) + (u.from_ads_tiktok || 0);
}
function totalClosing(u) {
  return organic(u) + ads(u);
}

function emptyAggregate() {
  return {
    closing_organic: 0, closing_ads: 0,
    from_instagram: 0, from_whatsapp: 0, from_offline: 0, closing_alumni: 0, closing_mitra: 0, from_website: 0,
    from_ads_meta: 0, from_ads_google: 0, from_ads_tiktok: 0,
    total: 0, trips_count: 0,
  };
}

function addUpdate(agg, u) {
  agg.from_instagram += u.from_instagram || 0;
  agg.from_whatsapp += u.from_whatsapp || 0;
  agg.from_offline += u.from_offline || 0;
  agg.closing_alumni += u.closing_alumni || 0;
  agg.closing_mitra += u.closing_mitra || 0;
  agg.from_website += u.from_website || 0;
  agg.from_ads_meta += u.from_ads_meta || 0;
  agg.from_ads_google += u.from_ads_google || 0;
  agg.from_ads_tiktok += u.from_ads_tiktok || 0;
  agg.closing_organic = agg.from_instagram + agg.from_whatsapp + agg.from_offline + agg.closing_alumni + agg.closing_mitra + agg.from_website;
  agg.closing_ads = agg.from_ads_meta + agg.from_ads_google + agg.from_ads_tiktok;
  agg.total = agg.closing_organic + agg.closing_ads;
  agg.trips_count += 1;
  return agg;
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

export default function ClosingHistoryTable({ allUpdates = [], participants = [] }) {
  const safe = Array.isArray(allUpdates) ? allUpdates : [];
  const pax = Array.isArray(participants) ? participants : [];
  const [view, setView] = useState('daily');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Daily — 30 hari terakhir (rolling window)
  const dailyRows = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    return safe
      .filter((u) => (u.tanggal || '') >= cutoff)
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  }, [safe]);

  // Weekly aggregate (semua data, untuk arsip)
  const weeklyRows = useMemo(() => {
    const map = {};
    for (const u of safe) {
      if (!u.tanggal) continue;
      const k = getWeekStart(u.tanggal);
      if (!map[k]) map[k] = { weekStart: k, weekEnd: getWeekEnd(u.tanggal), ...emptyAggregate() };
      addUpdate(map[k], u);
    }
    return Object.values(map).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [safe]);

  // Monthly aggregate
  const monthlyRows = useMemo(() => {
    const map = {};
    for (const u of safe) {
      if (!u.tanggal) continue;
      const k = getMonthKey(u.tanggal);
      if (!map[k]) map[k] = { monthKey: k, ...emptyAggregate() };
      addUpdate(map[k], u);
    }
    return Object.values(map).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [safe]);

  function handleDelete(u) {
    if (!confirm(`Hapus update CS tanggal ${fmtDate(u.tanggal)} untuk trip "${u.trips?.name || u.trip_id}"?`)) return;
    startTransition(async () => {
      const result = await deleteCSUpdate(u.id);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  function handleDownload() {
    let filename = '';
    let rows = [];

    if (view === 'daily') {
      filename = 'closing_harian_lengkap_dengan_peserta.csv';

      // === SECTION 1: DAILY UPDATES ===
      rows.push(['=== UPDATE HARIAN CLOSING ===']);
      rows.push(['Tanggal', 'Trip Code', 'Trip Name', 'IG', 'WA', 'Offline', 'Alumni', 'Mitra', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Organic', 'Ads', 'Total Closing', 'Sisa Seat', 'Leads', 'Notes']);
      const all = [...safe].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
      for (const u of all) {
        rows.push([
          u.tanggal,
          u.trips?.kode_trip || `#${u.trip_id}`,
          u.trips?.name || '',
          u.from_instagram || 0, u.from_whatsapp || 0, u.from_offline || 0,
          u.closing_alumni || 0, u.closing_mitra || 0,
          u.from_ads_meta || 0, u.from_ads_google || 0, u.from_ads_tiktok || 0,
          organic(u), ads(u), totalClosing(u),
          u.sisa_seat || 0, u.jumlah_leads || 0,
          u.notes || '',
        ]);
      }

      // === SECTION 2: DETAIL PESERTA CLOSING ===
      rows.push([]);
      rows.push(['=== DETAIL PESERTA CLOSING ===']);
      rows.push(['Tanggal Join', 'Trip Code', 'Trip Name', 'Nama Peserta', 'Email', 'Phone', 'Room Type', 'Age Type', 'Source', 'Notes']);
      // Sort participants by joined_at desc
      const sortedPax = [...pax].sort((a, b) => {
        const da = String(a.joined_at || a.created_at || '');
        const db = String(b.joined_at || b.created_at || '');
        return db.localeCompare(da);
      });
      for (const p of sortedPax) {
        const c = p.customers || {};
        const joinDate = String(p.joined_at || p.created_at || '').slice(0, 10);
        rows.push([
          joinDate,
          p.trips?.kode_trip || `#${p.trip_id}`,
          p.trips?.name || '',
          c.name || p.name || '',
          c.email || '',
          c.phone || '',
          p.room_type || '',
          p.age_type || 'adult',
          c.source || '',
          p.notes || '',
        ]);
      }
    } else if (view === 'weekly') {
      filename = 'closing_rekap_mingguan.csv';
      rows.push(['Minggu', 'Jumlah Update', 'IG', 'WA', 'Offline', 'Alumni', 'Mitra', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Organic', 'Ads', 'Total Closing']);
      for (const w of weeklyRows) {
        rows.push([
          `${w.weekStart} → ${w.weekEnd}`,
          w.trips_count,
          w.from_instagram, w.from_whatsapp, w.from_offline, w.closing_alumni, w.closing_mitra,
          w.from_ads_meta, w.from_ads_google, w.from_ads_tiktok,
          w.closing_organic, w.closing_ads, w.total,
        ]);
      }
    } else {
      filename = 'closing_rekap_bulanan.csv';
      rows.push(['Bulan', 'Jumlah Update', 'IG', 'WA', 'Offline', 'Alumni', 'Mitra', 'Meta Ads', 'Google Ads', 'TikTok Ads', 'Organic', 'Ads', 'Total Closing']);
      for (const m of monthlyRows) {
        rows.push([
          fmtMonthLabel(m.monthKey),
          m.trips_count,
          m.from_instagram, m.from_whatsapp, m.from_offline, m.closing_alumni, m.closing_mitra,
          m.from_ads_meta, m.from_ads_google, m.from_ads_tiktok,
          m.closing_organic, m.closing_ads, m.total,
        ]);
      }
    }

    downloadCSV(filename, rows);
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <ViewBtn active={view === 'daily'} onClick={() => setView('daily')}>📅 30 Hari Terakhir</ViewBtn>
          <ViewBtn active={view === 'weekly'} onClick={() => setView('weekly')}>📊 Rekap Mingguan</ViewBtn>
          <ViewBtn active={view === 'monthly'} onClick={() => setView('monthly')}>📈 Rekap Bulanan</ViewBtn>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
        >
          ⬇ Download Excel ({view === 'daily' ? 'harian + peserta' : view === 'weekly' ? 'mingguan' : 'bulanan'})
        </button>
      </div>

      {view === 'daily' && (
        <DailyClosingList rows={dailyRows} onDelete={handleDelete} pending={pending} />
      )}
      {view === 'weekly' && (
        <WeeklyClosingTable rows={weeklyRows} />
      )}
      {view === 'monthly' && (
        <MonthlyClosingTable rows={monthlyRows} />
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

function DailyClosingList({ rows, onDelete, pending }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-lg font-bold text-slate-700">Belum ada closing di 30 hari terakhir</p>
        <p className="mt-1 text-sm text-slate-500">Klik "Input CS Daily" untuk mulai, atau switch ke Rekap untuk data lama.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
      {rows.map((u) => (
        <div key={u.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-700">
                {u.trips?.kode_trip || `#${u.trip_id}`} — {u.trips?.name || 'Unknown trip'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{fmtDate(u.tanggal)}</p>
            </div>
            <div className="flex gap-2 text-xs flex-wrap items-center">
              <span className="px-2 py-1 rounded bg-green-50 text-green-700 font-semibold">Terjual: {totalClosing(u)}</span>
              {(u.from_website || 0) > 0 && <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-semibold">🌐 Web: {u.from_website}</span>}
              <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold">Leads: {u.jumlah_leads || 0}</span>
              <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 font-semibold">Sisa: {u.sisa_seat || 0}</span>
              <Link
                href={`/cs/${u.id}/edit`}
                className="px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold transition-colors"
              >
                ✎ Edit
              </Link>
              <button
                onClick={() => onDelete(u)}
                disabled={pending}
                className="px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors disabled:opacity-50"
              >
                🗑
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex gap-2 text-[11px] text-slate-500 flex-wrap">
            {u.from_instagram > 0 && <span>📷 IG: {u.from_instagram}</span>}
            {u.from_whatsapp > 0 && <span>· 💬 WA: {u.from_whatsapp}</span>}
            {u.from_offline > 0 && <span>· 🏪 Offline: {u.from_offline}</span>}
            {u.closing_alumni > 0 && <span>· 🎓 Alumni: {u.closing_alumni}</span>}
            {u.closing_mitra > 0 && <span>· 🤝 Mitra: {u.closing_mitra}</span>}
            {u.from_ads_meta > 0 && <span>· 🟦 Meta: {u.from_ads_meta}</span>}
            {u.from_ads_google > 0 && <span>· 🟥 Google: {u.from_ads_google}</span>}
            {u.from_ads_tiktok > 0 && <span>· ⚫ TikTok Ads: {u.from_ads_tiktok}</span>}
            {u.notes && <span className="italic">· 📝 {u.notes}</span>}
          </div>
        </div>
      ))}
      <p className="px-4 py-2 text-[10px] text-slate-500 bg-slate-50">30 hari terakhir saja. Data lama → switch ke Rekap Mingguan/Bulanan atau download Excel.</p>
    </div>
  );
}

function WeeklyClosingTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Belum ada data closing mingguan.</p>;
  }
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
            <th className="px-2 py-2">Minggu</th>
            <th className="px-2 py-2 text-center"># Update</th>
            <th className="px-2 py-2 text-right">IG</th>
            <th className="px-2 py-2 text-right">WA</th>
            <th className="px-2 py-2 text-right">Offline</th>
            <th className="px-2 py-2 text-right">Alumni</th>
            <th className="px-2 py-2 text-right">Mitra</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Meta</th>
            <th className="px-2 py-2 text-right">Google</th>
            <th className="px-2 py-2 text-right">TikTok</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Organic</th>
            <th className="px-2 py-2 text-right">Ads</th>
            <th className="px-2 py-2 text-right font-extrabold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((w) => (
            <tr key={w.weekStart} className="hover:bg-slate-50">
              <td className="px-2 py-2 font-semibold text-slate-700">{fmtDateID(w.weekStart)} → {fmtDateID(w.weekEnd)}</td>
              <td className="px-2 py-2 text-center text-slate-500">{w.trips_count}</td>
              <td className="px-2 py-2 text-right">{w.from_instagram}</td>
              <td className="px-2 py-2 text-right">{w.from_whatsapp}</td>
              <td className="px-2 py-2 text-right">{w.from_offline}</td>
              <td className="px-2 py-2 text-right">{w.closing_alumni}</td>
              <td className="px-2 py-2 text-right">{w.closing_mitra}</td>
              <td className="px-2 py-2 text-right text-blue-700 border-l border-slate-200">{w.from_ads_meta}</td>
              <td className="px-2 py-2 text-right text-red-700">{w.from_ads_google}</td>
              <td className="px-2 py-2 text-right">{w.from_ads_tiktok}</td>
              <td className="px-2 py-2 text-right text-green-700 border-l border-slate-200 font-semibold">{w.closing_organic}</td>
              <td className="px-2 py-2 text-right text-orange-700 font-semibold">{w.closing_ads}</td>
              <td className="px-2 py-2 text-right font-bold text-brand-700">{w.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyClosingTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">Belum ada data closing bulanan.</p>;
  }
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
            <th className="px-2 py-2">Bulan</th>
            <th className="px-2 py-2 text-center"># Update</th>
            <th className="px-2 py-2 text-right">IG</th>
            <th className="px-2 py-2 text-right">WA</th>
            <th className="px-2 py-2 text-right">Offline</th>
            <th className="px-2 py-2 text-right">Alumni</th>
            <th className="px-2 py-2 text-right">Mitra</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Meta</th>
            <th className="px-2 py-2 text-right">Google</th>
            <th className="px-2 py-2 text-right">TikTok</th>
            <th className="px-2 py-2 text-right border-l border-slate-200">Organic</th>
            <th className="px-2 py-2 text-right">Ads</th>
            <th className="px-2 py-2 text-right font-extrabold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((m) => (
            <tr key={m.monthKey} className="hover:bg-slate-50">
              <td className="px-2 py-2 font-semibold text-slate-700">{fmtMonthLabel(m.monthKey)}</td>
              <td className="px-2 py-2 text-center text-slate-500">{m.trips_count}</td>
              <td className="px-2 py-2 text-right">{m.from_instagram}</td>
              <td className="px-2 py-2 text-right">{m.from_whatsapp}</td>
              <td className="px-2 py-2 text-right">{m.from_offline}</td>
              <td className="px-2 py-2 text-right">{m.closing_alumni}</td>
              <td className="px-2 py-2 text-right">{m.closing_mitra}</td>
              <td className="px-2 py-2 text-right text-blue-700 border-l border-slate-200">{m.from_ads_meta}</td>
              <td className="px-2 py-2 text-right text-red-700">{m.from_ads_google}</td>
              <td className="px-2 py-2 text-right">{m.from_ads_tiktok}</td>
              <td className="px-2 py-2 text-right text-green-700 border-l border-slate-200 font-semibold">{m.closing_organic}</td>
              <td className="px-2 py-2 text-right text-orange-700 font-semibold">{m.closing_ads}</td>
              <td className="px-2 py-2 text-right font-bold text-brand-700">{m.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
