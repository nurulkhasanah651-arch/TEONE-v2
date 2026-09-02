'use client';
// Modal kirim WA penugasan TL secara MANUAL: tampilkan template + tombol yang membuka
// WhatsApp yang sedang login di perangkat (web/app) via wa.me, pesan sudah terisi otomatis.
// Siapa pun (yang buka halaman) bisa mengirim dari WA-nya sendiri.
import { useState } from 'react';

export default function WaSendModal({ open, phone, template, waUrl, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  function copy() {
    try { navigator.clipboard.writeText(template || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800 text-sm">📲 Kirim WA Penugasan TL</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-1">×</button>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">
          Tujuan: <b>{phone || '-'}</b>. Klik tombol di bawah — WhatsApp yang sedang login (web/app) akan terbuka dengan pesan sudah terisi, tinggal tekan <b>Send</b>.
        </p>
        <textarea readOnly value={template || ''} className="w-full h-44 text-xs border border-slate-300 rounded-lg p-2 font-mono resize-none mb-2 bg-slate-50" />
        <div className="flex items-center gap-2">
          <a
            href={waUrl || '#'}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="flex-1 text-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold"
          >
            📲 Kirim via WhatsApp
          </a>
          <button onClick={copy} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold whitespace-nowrap">
            {copied ? '✓ Tersalin' : 'Salin teks'}
          </button>
        </div>
      </div>
    </div>
  );
}
