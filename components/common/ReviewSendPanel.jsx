'use client';

// Panel kirim review manual (di tab Review) — pilih trip lalu blast, tanpa nunggu notif H+4.
import { useState } from 'react';
import { sendReviewBlast } from '@/lib/actions/reviews';

export default function ReviewSendPanel({ trips = [] }) {
  const [tripId, setTripId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const selected = trips.find((t) => String(t.id) === String(tripId));

  async function send() {
    setBusy(true); setMsg('');
    try {
      const r = await sendReviewBlast(tripId);
      if (r?.ok) setMsg(`✓ Review terkirim ke ${r.contacts} kontak (${r.sent} berhasil${r.failed ? `, ${r.failed} gagal` : ''}).`);
      else setMsg(r?.error || 'Gagal kirim.');
    } catch { setMsg('Gagal kirim.'); }
    finally { setBusy(false); setConfirm(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
      <p className="font-bold text-slate-900 mb-0.5">📤 Kirim Review Manual</p>
      <p className="text-xs text-slate-500 mb-3">Pilih trip lalu kirim link review ke semua peserta — tanpa menunggu notif H+4 di dashboard.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={tripId}
          onChange={(e) => { setTripId(e.target.value); setMsg(''); setConfirm(false); }}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">— Pilih trip —</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.kode_trip ? `[${t.kode_trip}] ` : ''}{t.name} · {t.pax} pax{t.return_date ? ` · pulang ${String(t.return_date).slice(0, 10)}` : ''}{t.review_blast_sent_at ? ' · sudah dikirim' : ''}
            </option>
          ))}
        </select>
        {!confirm ? (
          <button onClick={() => { if (!tripId) { setMsg('Pilih trip dulu.'); return; } setConfirm(true); }} className="text-sm font-bold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap">Kirim Review</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={send} disabled={busy} className="text-sm font-bold px-4 py-2 rounded-lg bg-blue-600 disabled:opacity-60 text-white whitespace-nowrap">{busy ? 'Mengirim...' : `Ya, kirim ke ${selected?.pax || 0} pax`}</button>
            <button onClick={() => setConfirm(false)} className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600">Batal</button>
          </div>
        )}
      </div>
      {selected?.review_blast_sent_at && !msg ? <p className="text-[11px] text-amber-600 mt-2">⚠ Trip ini sudah pernah dikirim review. Mengirim lagi akan kirim ulang ke semua peserta.</p> : null}
      {msg ? <p className="text-sm mt-2 text-slate-700 font-medium">{msg}</p> : null}
    </div>
  );
}
