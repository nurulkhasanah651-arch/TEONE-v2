'use client';

// Blast TL — pilih TL (default semua, gabungan TEONE + Khasanah), tulis pesan,
// kirim dari SATU nomor: CS TravelingEropa.
// Path: components/tl-blast/TlBlastClient.jsx

import { useMemo, useState, useTransition } from 'react';
import { sendTlBlast } from '@/lib/actions/tl-blast';

export default function TlBlastClient({ tls = [], sender = 'CS TravelingEropa' }) {
  const allIds = useMemo(() => tls.map((t) => String(t.id)), [tls]);
  const [selected, setSelected] = useState(() => new Set(allIds));
  const [q, setQ] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const shown = tls.filter((t) =>
    !q.trim() || t.name.toLowerCase().includes(q.toLowerCase()) || t.phone.includes(q.replace(/\D/g, ''))
  );
  const allShownSelected = shown.length > 0 && shown.every((t) => selected.has(String(t.id)));

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); const k = String(id); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function toggleAllShown() {
    setSelected((s) => {
      const n = new Set(s);
      if (allShownSelected) shown.forEach((t) => n.delete(String(t.id)));
      else shown.forEach((t) => n.add(String(t.id)));
      return n;
    });
  }

  function submit(e) {
    e?.preventDefault();
    setErr(''); setResult(null);
    if (!message.trim()) { setErr('Tulis dulu pesannya.'); return; }
    if (selected.size === 0) { setErr('Pilih minimal 1 TL.'); return; }
    if (!confirm(`Kirim blast ke ${selected.size} TL dari nomor ${sender}?`)) return;
    start(async () => {
      const r = await sendTlBlast(message, Array.from(selected));
      if (r?.error) { setErr(r.error); return; }
      setResult(r);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* KIRI: pesan */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">Pesan informasi</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={9}
            maxLength={4000}
            placeholder={"Contoh:\nHalo {{nama}}, ada info penting untuk semua Tour Leader...\n\nMohon dibaca ya. Terima kasih 🙏"}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Variabel opsional: <code className="bg-slate-100 px-1 rounded">{'{{nama}}'}</code> = nama depan TL,
            {' '}<code className="bg-slate-100 px-1 rounded">{'{{phone}}'}</code> = no HP.
          </p>
          <div className="mt-2 text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            📤 Pengirim: <b>nomor {sender}</b> (tetap, satu nomor untuk semua). Terkirim ke <b>{selected.size}</b> TL terpilih (TEONE + Khasanah digabung). Riwayat tercatat di History WA.
          </div>

          {err && <p className="mt-2 text-sm text-rose-600">⚠ {err}</p>}
          {result && (
            <div className="mt-2 text-sm bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-emerald-800">
              ✅ Selesai — terkirim <b>{result.sent}</b> / {result.total}
              {result.failed > 0 && <span className="text-rose-700"> · gagal {result.failed}</span>}
              {result.failedNames?.length > 0 && <span className="block text-[11px] text-rose-700 mt-0.5">Gagal: {result.failedNames.join(', ')}</span>}
            </div>
          )}

          <button
            onClick={submit}
            disabled={pending}
            className="mt-3 w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-60"
          >
            {pending ? 'Mengirim…' : `📣 Kirim ke ${selected.size} TL`}
          </button>
        </div>
      </div>

      {/* KANAN: daftar TL */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-bold text-brand-700">Tour Leader ({tls.length})</h2>
            <p className="text-[11px] text-slate-500">TEONE + Khasanah digabung · terpilih {selected.size}</p>
          </div>
          <button onClick={toggleAllShown} className="text-xs font-semibold px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700">
            {allShownSelected ? 'Kosongkan' : 'Pilih semua'}
          </button>
        </div>
        <div className="px-4 py-2 border-b border-slate-100">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama / no HP…"
            className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Tidak ada TL.</p>
          ) : shown.map((t) => {
            const on = selected.has(String(t.id));
            return (
              <label key={t.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                    <span className="truncate">{t.name}</span>
                    {t.brandLabel ? (
                      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${t.brand === 'khasanah' ? 'bg-teal-100 text-teal-700' : 'bg-indigo-100 text-indigo-700'}`}>{t.brandLabel}</span>
                    ) : null}
                    {t.subtype ? <span className="text-[10px] text-slate-400 font-normal shrink-0">· {t.subtype}</span> : null}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">{t.phone}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
