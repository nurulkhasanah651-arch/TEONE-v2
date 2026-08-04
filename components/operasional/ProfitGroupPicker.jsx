'use client';

// Pemilih group/trip untuk Estimate Profit — dikelompokkan per bulan (terdekat dulu),
// profit tiap trip + checklist "minta offering vendor" + link web/itinerary utk vendor.
// Path: components/operasional/ProfitGroupPicker.jsx
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { setOfferingVendor } from '@/lib/actions/profit-estimate';

const rupiah = (n) => 'Rp ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID');

function nowMonthKey() {
  try { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; } catch { return '0000-00'; }
}

export default function ProfitGroupPicker({ groups = [] }) {
  const [q, setQ] = useState('');
  const [off, setOff] = useState({});        // override status offering per trip id (optimistic)
  const [, start] = useTransition();
  const s = q.trim().toLowerCase();
  const list = s ? groups.filter((g) => `${g.kode} ${g.name}`.toLowerCase().includes(s)) : groups;

  const isRequested = (g) => (off[g.id] !== undefined ? off[g.id] : !!g.offeringRequested);
  function toggleOffering(g) {
    const next = !isRequested(g);
    setOff((m) => ({ ...m, [g.id]: next }));   // optimistic
    start(async () => {
      const r = await setOfferingVendor(g.id, next);
      if (r?.error) { setOff((m) => ({ ...m, [g.id]: !next })); alert('Gagal simpan: ' + r.error); }
    });
  }

  const months = useMemo(() => {
    const byKey = {};
    for (const g of list) {
      if (!byKey[g.monthKey]) byKey[g.monthKey] = { key: g.monthKey, label: g.monthLabel, trips: [] };
      byKey[g.monthKey].trips.push(g);
    }
    const nowKey = nowMonthKey();
    const arr = Object.values(byKey).map((m) => {
      const trips = [...m.trips].sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')));
      const totalProfit = trips.reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
      const withExpense = trips.filter((t) => t.hasExpense).length;
      return { ...m, trips, totalProfit, withExpense };
    });
    // Bulan mendatang (>= bln ini) ascending → terdekat dulu; bulan lampau di bawah (terbaru dulu).
    arr.sort((a, b) => {
      const af = a.key >= nowKey, bf = b.key >= nowKey;
      if (af && bf) return a.key.localeCompare(b.key);
      if (!af && !bf) return b.key.localeCompare(a.key);
      return af ? -1 : 1;
    });
    return arr;
  }, [list, off]);

  return (
    <div className="space-y-4">
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cari group (kode / nama trip)…"
        className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />

      {months.map((m) => (
        <div key={m.key} className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-bold text-brand-700">{m.label}</span>
              <span className="text-xs text-slate-400">· {m.trips.length} trip{m.withExpense > 0 ? ` · ${m.withExpense} sudah isi expense` : ''}</span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] uppercase tracking-wide text-slate-400 leading-none">Total Margin Bulan Ini</span>
              <span className={`text-sm font-bold ${m.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupiah(m.totalProfit)}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {m.trips.map((g) => {
              const req = isRequested(g);
              // Sudah minta offering vendor TAPI proyeksi (expense/HPP) belum di-update sejak itu
              // -> ingatkan ops utk update. Hilang begitu estimate disimpan setelah offering.
              const justToggledOn = off[g.id] === true && !g.offeringRequested;
              let needsUpdate = false;
              if (req) {
                if (!g.savedAt) needsUpdate = true;
                else if (justToggledOn) needsUpdate = true;
                else if (g.offeringAt && new Date(g.savedAt) < new Date(g.offeringAt)) needsUpdate = true;
              }
              return (
                <div key={g.id} className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-sm transition">
                  <Link href={`/operasional/profit-estimate?trip=${encodeURIComponent(g.id)}`} className="flex flex-col p-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-brand-700 text-sm">{g.kode}</span>
                      <span className="text-[11px] text-slate-400">{g.departureFmt}</span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1 line-clamp-2 min-h-[2rem]">{g.name}</p>
                    <div className={`mt-2 rounded-lg px-2.5 py-2 border ${Number(g.profit) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 leading-none">{g.hasExpense ? 'Profit (Margin)' : 'Margin (income − expense)'}</p>
                      <p className={`text-base font-extrabold leading-tight ${Number(g.profit) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupiah(g.profit)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Income {rupiah(g.income)} · Exp {rupiah(g.expense)}</p>
                      {!g.hasExpense && <p className="text-[10px] text-amber-600 mt-0.5">⚠ belum ada expense — klik untuk lengkapi</p>}
                    </div>
                    {Array.isArray(g.vendors) && g.vendors.length > 1 && (
                      <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[9px] uppercase tracking-wide text-slate-400 leading-none mb-1">Perbandingan Vendor</p>
                        {g.vendors.map((v, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px] leading-tight gap-2">
                            <span className="text-slate-600 truncate">{v.name}{i === 0 ? ' ⭐' : ''}</span>
                            <span className={`font-bold whitespace-nowrap ${Number(v.margin) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{rupiah(v.margin)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {g.hasEstimate && g.savedAtFmt && (
                      <p className="text-[10px] text-slate-400 mt-1">🕒 update {g.savedAtFmt}{g.savedBy ? ` · ${g.savedBy}` : ''}</p>
                    )}
                  </Link>

                  {/* Offering vendor + link web/itinerary (di luar Link biar bisa diklik sendiri) */}
                  <div className="px-3 pb-3 pt-1 space-y-1.5">
                    {req ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1.5">
                          <span className="text-[11px] font-bold text-emerald-700">✅ Offering vendor sudah diminta</span>
                          <button type="button" onClick={() => toggleOffering(g)} className="text-[10px] text-slate-500 hover:underline">batal</button>
                        </div>
                        {needsUpdate && (
                          <Link href={`/operasional/profit-estimate?trip=${encodeURIComponent(g.id)}`}
                            className="block w-full text-center rounded-md bg-amber-100 hover:bg-amber-200 border border-amber-400 px-2 py-1.5 text-[11px] font-extrabold text-amber-800 animate-pulse">
                            ⚠ UPDATE PROYEKSI INCOME
                          </Link>
                        )}
                      </div>
                    ) : (
                      <button type="button" onClick={() => toggleOffering(g)}
                        className="w-full rounded-md bg-red-50 hover:bg-red-100 border border-red-300 px-2 py-1.5 text-[11px] font-extrabold text-red-700 flex items-center justify-center gap-1">
                        🔴 MINTA OFFERING VENDOR! <span className="text-[9px] font-semibold text-red-500">(klik jika sudah)</span>
                      </button>
                    )}
                    <a href={g.webUrl} target="_blank" rel="noreferrer"
                      className="block w-full text-center rounded-md bg-slate-100 hover:bg-brand-100 px-2 py-1.5 text-[11px] font-semibold text-slate-700">
                      🌐 Web / Itinerary (kirim ke vendor)
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {months.length === 0 && <p className="text-sm text-slate-400">Tidak ada group cocok.</p>}
    </div>
  );
}
