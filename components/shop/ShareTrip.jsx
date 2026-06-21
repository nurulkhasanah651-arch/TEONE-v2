'use client';
import { useState } from 'react';

export default function ShareTrip({ title }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const getUrl = () => (typeof window !== 'undefined' ? window.location.href : '');

  function shareWA() {
    const u = getUrl();
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n\nInfo paket & booking:\n${u}`)}`, '_blank');
    setOpen(false);
  }
  function copyLink() {
    const u = getUrl();
    const done = () => { setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(u).then(done).catch(() => window.prompt('Salin link:', u));
    else window.prompt('Salin link:', u);
  }

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} aria-label="Bagikan"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50">
        <span aria-hidden>🔗</span> Bagikan
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5">
            <button onClick={shareWA} className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-sm font-semibold text-emerald-700">💬 Share ke WhatsApp</button>
            <button onClick={copyLink} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm font-semibold text-slate-700">{copied ? '✓ Link tersalin' : '🔗 Copy Link'}</button>
          </div>
        </>
      )}
    </div>
  );
}
