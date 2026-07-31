'use client';

// Tombol salin nomor rekening di invoice (mempermudah transaksi).
import { useState } from 'react';

export default function CopyRekButton({ value = '', label = '📋 Salin No. Rek' }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const v = String(value).replace(/\s/g, '');
    try {
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('Nomor rekening: ' + value);
    }
  }
  return (
    <button type="button" onClick={copy}
      className={`mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border no-print ${copied ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-blue-300 text-blue-700 hover:bg-blue-50'}`}>
      {copied ? '✓ Tersalin' : label}
    </button>
  );
}
