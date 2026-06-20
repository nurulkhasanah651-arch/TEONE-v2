'use client';
import { useState } from 'react';

export default function ShareTrip({ title }) {
  const [copied, setCopied] = useState(false);
  const getUrl = () => (typeof window !== 'undefined' ? window.location.href : '');

  function shareWA() {
    const u = getUrl();
    const text = `${title}\n\nInfo paket & booking:\n${u}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
  function copyLink() {
    const u = getUrl();
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(u).then(done).catch(() => { window.prompt('Salin link:', u); });
    else window.prompt('Salin link:', u);
  }
  function nativeShare() {
    if (navigator.share) navigator.share({ title, url: getUrl() }).catch(() => {});
    else copyLink();
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-slate-500 mb-1.5">Bagikan paket ini</p>
      <div className="flex gap-2">
        <button onClick={shareWA} className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold">💬 WhatsApp</button>
        <button onClick={copyLink} className="flex-1 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50">{copied ? '✓ Tersalin' : '🔗 Copy Link'}</button>
        <button onClick={nativeShare} title="Bagikan…" className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50">↗</button>
      </div>
    </div>
  );
}
