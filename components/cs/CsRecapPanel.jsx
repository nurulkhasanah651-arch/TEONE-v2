'use client';

// Panel: Generate rekap harian CS + kirim ke grup WA (Fonnte)
import { useState, useTransition } from 'react';
import { buildCsRecap, sendCsRecap } from '@/lib/actions/cs-recap';

export default function CsRecapPanel({ initialGroup }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState('');
  const [group, setGroup] = useState(initialGroup || '');
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  function generate() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await buildCsRecap();
        if (r?.error) { setMsg({ type: 'error', text: r.error }); return; }
        setText(r.text);
        setOpen(true);
      } catch (e) {
        setMsg({ type: 'error', text: 'Gagal generate: ' + (e?.message || 'error') });
      }
    });
  }

  function send() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await sendCsRecap(text, group);
        if (r?.error) { setMsg({ type: 'error', text: r.error }); return; }
        setMsg({ type: 'ok', text: 'Rekap terkirim ke grup WA' });
      } catch (e) {
        setMsg({ type: 'error', text: 'Gagal kirim: ' + (e?.message || 'error') });
      }
    });
  }

  function copy() {
    try { navigator.clipboard.writeText(text); setMsg({ type: 'ok', text: 'Teks disalin' }); } catch {}
  }

  return (
    <section className="bg-white rounded-xl border-2 border-green-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-green-800">📋 Rekap Harian ke Grup WA</h2>
          <p className="text-xs text-slate-500 mt-0.5">Generate rekap trip + closingan hari ini, kirim ke grup WhatsApp.</p>
        </div>
        <button onClick={generate} disabled={pending}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded">
          {pending ? '⏳...' : '⚡ Generate Rekap'}
        </button>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-sm border-b ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {msg.text}
        </div>
      )}

      {open && (
        <div className="p-5 space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16}
            className="w-full px-3 py-2 border-2 border-slate-200 rounded text-xs font-mono focus:border-green-500 outline-none whitespace-pre" />
          <div className="flex gap-2 flex-wrap items-end">
            <label className="block flex-1 min-w-[220px]">
              <span className="text-xs font-bold text-slate-600">ID Grup WhatsApp (Fonnte)</span>
              <input autoComplete="off" value={group} onChange={(e) => setGroup(e.target.value)}
                placeholder="120363xxxxxxxxxx@g.us"
                className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded text-sm focus:border-green-500 outline-none" />
            </label>
            <button onClick={copy} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded">📋 Salin</button>
            <button onClick={send} disabled={pending || !group.trim()}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded">
              {pending ? '⏳ Mengirim…' : '📲 Kirim ke Grup'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Cara dapat ID grup: di Fonnte dashboard → device → menu Grup, atau kirim pesan apa pun ke grup lalu cek di log Fonnte (format diakhiri <b>@g.us</b>). ID grup tersimpan otomatis setelah kirim pertama.
          </p>
        </div>
      )}
    </section>
  );
}
