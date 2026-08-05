'use client';

// Pemilih trip untuk Itinerary Only. Path: components/operasional/ItineraryTripPicker.jsx
import { useState } from 'react';
import Link from 'next/link';

function fmt(d) { if (!d) return '—'; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }

export default function ItineraryTripPicker({ trips = [] }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = s ? trips.filter((t) => `${t.kode} ${t.name}`.toLowerCase().includes(s)) : trips;

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari trip (kode / nama)…"
        className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {list.map((t) => (
          <Link key={t.id} href={`/operasional/itinerary?trip=${encodeURIComponent(t.id)}`}
            className="block bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm hover:bg-slate-50 transition">
            <div className="flex items-center justify-between">
              <span className="font-bold text-brand-700 text-sm">{t.kode || `#${t.id}`}</span>
              {t.hasDoc ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ ada itinerary</span>
                : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">belum</span>}
            </div>
            <p className="text-xs text-slate-700 mt-1 line-clamp-2 min-h-[2rem]">{t.name}</p>
            {Array.isArray(t.ticketTypes) && t.ticketTypes.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {t.ticketTypes.map((tt) => (
                  <span key={tt} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">✈ {tt}</span>
                ))}
                {t.ticketIssued && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">🎫 tiket terbit</span>}
              </div>
            ) : (
              <div className="mt-1"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">belum ada tiket</span></div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">{fmt(t.departure)}{t.pax ? ` · ${t.pax} pax` : ''}{t.pic ? ` · ${t.pic}` : ''}</p>
          </Link>
        ))}
      </div>
      {list.length === 0 && <p className="text-sm text-slate-400">Tidak ada trip cocok.</p>}
    </div>
  );
}
