'use client';

// Kartu dashboard: trip yang sudah pulang H+4 & belum dikirim review.
// Self-contained: fetch sendiri via server action. Kalau kosong -> render null (tak ganggu dashboard).
import { useEffect, useState } from 'react';
import { getReviewPendingTrips, sendReviewBlast } from '@/lib/actions/reviews';

export default function ReviewPendingCard() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const r = await getReviewPendingTrips(); if (alive && r?.ok) setTrips(r.trips || []); } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  async function send(id) {
    setBusyId(id); setMsg((m) => ({ ...m, [id]: '' }));
    try {
      const r = await sendReviewBlast(id);
      if (r?.ok) { setMsg((m) => ({ ...m, [id]: `✓ Terkirim ke ${r.contacts} kontak` })); setTimeout(() => setTrips((t) => t.filter((x) => x.id !== id)), 1500); }
      else setMsg((m) => ({ ...m, [id]: r?.error || 'Gagal' }));
    } catch { setMsg((m) => ({ ...m, [id]: 'Gagal kirim' })); }
    finally { setBusyId(null); }
  }

  if (loading || trips.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-card p-5">
      <p className="font-bold text-amber-900">📮 Kirim Review Trip ({trips.length})</p>
      <p className="text-xs text-amber-700 mb-3">Trip berikut sudah pulang (H+4). Kirim link review ke peserta lewat WA.</p>
      <div className="space-y-2">
        {trips.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-amber-100">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{t.name}{t.kode_trip ? ` (${t.kode_trip})` : ''}</p>
              <p className="text-[11px] text-slate-500">Pulang: {(t.return_date || '').slice(0, 10)}{t.pic ? ` · PIC: ${t.pic}` : ''}</p>
            </div>
            <div className="text-right shrink-0">
              <button onClick={() => send(t.id)} disabled={busyId === t.id} className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white whitespace-nowrap">{busyId === t.id ? 'Mengirim...' : 'Kirim Review'}</button>
              {msg[t.id] ? <p className="text-[11px] text-slate-500 mt-1">{msg[t.id]}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
