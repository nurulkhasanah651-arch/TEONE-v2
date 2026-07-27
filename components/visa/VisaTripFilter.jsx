'use client';

// Daftar trip di tab Visa — bisa dicari by trip (kode/nama) & disaring per bulan keberangkatan.
// Tiap baris menampilkan rincian status OTOMATIS per trip (kurang apa aja).
// Path: components/visa/VisaTripFilter.jsx

import { useMemo, useState } from 'react';
import Link from 'next/link';

export default function VisaTripFilter({ trips = [] }) {
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');

  const months = useMemo(() => {
    const map = new Map();
    for (const t of trips) if (t.monthKey) map.set(t.monthKey, t.monthLabel);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, label]) => ({ key, label }));
  }, [trips]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return trips.filter((t) => {
      if (month && t.monthKey !== month) return false;
      if (term && !t.searchText.includes(term)) return false;
      return true;
    });
  }, [trips, q, month]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h2 className="font-bold text-brand-700">Trip Aktif ({filtered.length}{filtered.length !== trips.length ? ` dari ${trips.length}` : ''})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Pilih trip untuk masuk checklist dokumen. Trip dgn upload baru di atas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari trip (kode / nama)…"
            className="px-3 py-1.5 border border-slate-300 rounded text-sm min-w-[200px]"
          />
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded text-sm">
            <option value="">Semua bulan</option>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {(q || month) && (
            <button onClick={() => { setQ(''); setMonth(''); }} className="text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">Reset</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-4xl mb-3">🛂</p>
          <p className="text-lg font-bold text-slate-700">{trips.length === 0 ? 'Belum ada trip aktif' : 'Tidak ada trip cocok filter'}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((t) => (
            <Link key={t.id} href={`/visa/${t.id}`} className={`block px-5 py-3 hover:bg-slate-50 transition-colors ${t.newUploadsCount > 0 ? 'bg-emerald-50/50' : ''}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode}</span>
                    {t.visaCountry && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">🌍 {t.visaCountry}</span>}
                    {t.tripBiometricFmt && <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">📅 Biometrik: {t.tripBiometricFmt}</span>}
                    {t.daysLeft != null && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold animate-pulse">⏰ {t.daysLeft}h lagi</span>
                    )}
                    {t.newUploadsCount > 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500 text-white font-bold animate-pulse">🔔 {t.newUploadsCount} doc BARU</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.departureFmt} · {t.paxCount} peserta
                    {t.totalUploads > 0 && (
                      <span className="ml-2 text-emerald-700 font-semibold">· 📤 {t.totalUploads} doc dari {t.totalPaxWithUploads} peserta</span>
                    )}
                  </p>
                  <p className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {t.chips.length > 0 ? (
                      t.chips.map((chip, i) => <span key={i} className={chip.c}>{chip.t}</span>)
                    ) : (
                      <span className="text-slate-400">Belum ada peserta / semua tuntas</span>
                    )}
                    {t.formSubmitted > 0 && <span className="text-brand-700 font-semibold">📝 Form: {t.formSubmitted}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-brand-700">{t.progress}%</p>
                  <p className="text-xs text-slate-500">{t.docsComplete} / {t.docsNeeded} docs</p>
                  <div className="mt-1 w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-400 to-green-500" style={{ width: `${t.progress}%` }} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
