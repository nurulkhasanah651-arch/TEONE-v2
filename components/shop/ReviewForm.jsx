'use client';

import { useState } from 'react';
import { submitReview } from '@/lib/actions/reviews';

const SOURCES = ['Instagram', 'TikTok', 'Google', 'Rekomendasi teman/saudara', 'Lainnya'];

function Stars({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-3xl leading-none transition ${n <= value ? 'text-yellow-400' : 'text-slate-300 hover:text-yellow-300'}`}
          aria-label={`${n} bintang`}
        >★</button>
      ))}
    </div>
  );
}

function RatingBlock({ title, subtitle, value, onRate, note, onNote }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <p className="font-bold text-slate-900">{title}</p>
      {subtitle ? <p className="text-xs text-slate-500 mb-2">{subtitle}</p> : <div className="mb-2" />}
      <Stars value={value} onChange={onRate} />
      <textarea
        value={note}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Catatan (opsional)"
        rows={2}
        className="mt-2 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </div>
  );
}

export default function ReviewForm({ token, tripName, kodeTrip, picName, tlName, participantName }) {
  const [cs, setCs] = useState(0);
  const [csNote, setCsNote] = useState('');
  const [pic, setPic] = useState(0);
  const [picNote, setPicNote] = useState('');
  const [tl, setTl] = useState(0);
  const [tlNote, setTlNote] = useState('');
  const [additional, setAdditional] = useState('');
  const [sources, setSources] = useState([]);
  const [sourceOther, setSourceOther] = useState('');
  const [nextTrip, setNextTrip] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const toggleSource = (s) => setSources((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);

  async function handleSubmit() {
    setErr('');
    if (!cs || !pic || !tl) { setErr('Mohon beri bintang untuk Customer Service, PIC, dan Tour Leader.'); return; }
    setBusy(true);
    try {
      const res = await submitReview(token, {
        cs_rating: cs, cs_note: csNote,
        pic_rating: pic, pic_note: picNote,
        tl_rating: tl, tl_note: tlNote,
        additional_note: additional,
        source_channels: sources,
        source_other: sourceOther,
        next_trip_interest: nextTrip,
      });
      if (res?.ok) { setDone(true); }
      else if (res?.error === 'already') { setDone(true); }
      else { setErr(res?.error || 'Gagal mengirim review. Coba lagi.'); }
    } catch (e) {
      setErr('Terjadi kesalahan. Coba lagi.');
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl shadow p-8 text-center">
        <p className="text-5xl mb-3">🙏</p>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Terima kasih banyak!</h1>
        <p className="text-sm text-slate-600">Masukan Kaka sangat berarti buat kami untuk terus meningkatkan pelayanan. Sampai jumpa di trip berikutnya 💙</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <h1 className="text-lg sm:text-xl font-bold">Review Trip 💙</h1>
        <p className="text-sm text-blue-100 mt-0.5">{tripName}{kodeTrip ? ` (${kodeTrip})` : ''}</p>
        {participantName ? <p className="text-xs text-blue-200 mt-1">Halo, {participantName}!</p> : null}
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600">Bagaimana pengalaman trip kemarin? Beri penilaian jujur ya, semua masukan kami baca 🙌</p>

        <RatingBlock title="⭐ Customer Service" subtitle="Pelayanan admin/CS sebelum & selama trip" value={cs} onRate={setCs} note={csNote} onNote={setCsNote} />
        <RatingBlock title={`⭐ PIC Trip${picName ? ` — ${picName}` : ''}`} subtitle="Penanggung jawab trip" value={pic} onRate={setPic} note={picNote} onNote={setPicNote} />
        <RatingBlock title={`⭐ Tour Leader${tlName ? ` — ${tlName}` : ''}`} subtitle="Pendamping selama perjalanan" value={tl} onRate={setTl} note={tlNote} onNote={setTlNote} />

        <div>
          <label className="font-bold text-slate-900 text-sm">Catatan tambahan</label>
          <textarea value={additional} onChange={(e) => setAdditional(e.target.value)} rows={3} placeholder="Kesan, pesan, saran, atau hal lain yang ingin disampaikan..." className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>

        <div>
          <label className="font-bold text-slate-900 text-sm">Tahu kami dari mana?</label>
          <div className="mt-2 space-y-1.5">
            {SOURCES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={sources.includes(s)} onChange={() => toggleSource(s)} className="w-4 h-4 rounded" />
                {s}
              </label>
            ))}
            {sources.includes('Lainnya') && (
              <input value={sourceOther} onChange={(e) => setSourceOther(e.target.value)} placeholder="Sebutkan..." className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
            )}
          </div>
        </div>

        <div>
          <label className="font-bold text-slate-900 text-sm">Next trip yang pengen diikuti?</label>
          <input value={nextTrip} onChange={(e) => setNextTrip(e.target.value)} placeholder="Contoh: West Europe, Turki, Japan..." className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>

        {err && <p className="text-sm text-red-600 font-medium">{err}</p>}

        <button onClick={handleSubmit} disabled={busy} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold">
          {busy ? 'Mengirim...' : 'Kirim Review'}
        </button>
      </div>
    </div>
  );
}
