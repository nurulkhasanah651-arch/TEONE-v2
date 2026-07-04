'use client';
import { useState } from 'react';
import { getTripWaTemplate } from '@/lib/actions/trip-wa';

export default function CopyWaTemplateButton({ tripId, className = '' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    setOpen(true); setLoading(true); setErr(''); setCopied(false);
    const r = await getTripWaTemplate(tripId);
    if (r?.ok) setText(r.text); else setErr(r?.error || 'Gagal membuat template');
    setLoading(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setErr('Tidak bisa menyalin — blok teks lalu Cmd/Ctrl+C manual.'); }
  }

  return (
    <>
      <button type="button" onClick={load}
        className={className || 'px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow-card'}>
        💬 Copy WA Template
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800">💬 Template WA — siap share</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">Bisa diedit dulu (mis. tambah harga coret "Normal", tips) sebelum disalin. Itinerary otomatis dari itinerary web per hari.</p>
            {loading ? (
              <p className="text-sm text-slate-500 py-8 text-center">Menyiapkan template…</p>
            ) : err ? (
              <p className="text-sm text-rose-600 py-4">⚠ {err}</p>
            ) : (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)}
                  className="w-full h-[46vh] border border-slate-300 rounded-xl p-3 text-[13px] font-mono leading-snug" />
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Tutup</button>
                  <button onClick={copy}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg">
                    {copied ? '✓ Tersalin!' : '📋 Salin ke Clipboard'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
