'use client';
// Daftar trip Open Selling untuk portal TL & Mitra — dengan search + filter/group per bulan.
import { useState, useMemo } from 'react';
import { fmtDate, fmtRupiah } from '@/lib/utils/format';
import CopyWaTemplateButton from '@/components/trips/CopyWaTemplateButton';

const BRAND = {
  teone: { label: 'TEONE', cls: 'bg-sky-100 text-sky-700' },
  khasanah: { label: 'Khasanah', cls: 'bg-emerald-100 text-emerald-700' },
};
const MON = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function ym(d) { const s = String(d || ''); return s.length >= 7 ? s.slice(0, 7) : ''; }
function monthLabel(k) { if (!k || k === 'zzzz') return 'Tanpa tanggal'; const [y, m] = k.split('-'); return `${MON[Number(m) - 1]} ${y}`; }

export default function OpenSellingBrowser({ trips = [] }) {
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('all');

  const months = useMemo(
    () => [...new Set((trips || []).map((t) => ym(t.departure)).filter(Boolean))].sort(),
    [trips],
  );

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (trips || []).filter((t) => {
      if (month !== 'all' && ym(t.departure) !== month) return false;
      if (!kw) return true;
      const hay = `${t.name || ''} ${t.kode_trip || ''} ${t.destination || ''}`.toLowerCase();
      return hay.includes(kw);
    });
  }, [trips, q, month]);

  const groups = useMemo(() => {
    const map = {};
    for (const t of filtered) { const k = ym(t.departure) || 'zzzz'; (map[k] = map[k] || []).push(t); }
    return Object.keys(map).sort().map((k) => ({ key: k, label: monthLabel(k), items: map[k] }));
  }, [filtered]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Cari nama trip / kode / destinasi..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="all">Semua bulan ({(trips || []).length})</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-500">Tidak ada trip yang cocok dengan pencarian / bulan.</div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">📅 {g.label}</span>
                <span className="text-xs font-normal text-slate-400">{g.items.length} trip</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {g.items.map((t) => {
                  const b = BRAND[t.brand] || { label: t.brand || '', cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <div key={`${t.brand}-${t.id}`} className="bg-white border border-slate-200 rounded-xl p-5 shadow-card flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${b.cls}`}>{b.label}</span>
                            <p className="text-xs font-mono text-brand-600">{t.kode_trip}</p>
                          </div>
                          <h3 className="text-lg font-bold text-slate-800 mt-0.5">{t.name}</h3>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold shrink-0">OPEN SELLING</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-2">📅 {fmtDate(t.departure)}</p>
                      <p className="text-lg font-bold text-brand-700 mt-1">{fmtRupiah(t.price)}<span className="text-xs font-normal text-slate-500">/pax</span></p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-sm font-bold ${t.seat_left <= 5 ? 'text-red-600' : 'text-green-700'}`}>Sisa {t.seat_left} seat</span>
                        <span className="text-xs text-slate-400">dari {t.quota}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a href={t.webUrl} target="_blank" rel="noreferrer" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">🌐 Lihat Web Trip</a>
                        <CopyWaTemplateButton tripId={t.id} brand={t.brand} />
                        {t.pdf && <a href={t.pdf} target="_blank" rel="noreferrer" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg">📄 Itinerary PDF</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
