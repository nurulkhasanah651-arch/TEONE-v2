'use client';

// Link ke file privat: ambil signed URL saat diklik lalu buka. Aman utk bucket privat.
import { useState } from 'react';
import { getSignedFileUrl } from '@/lib/actions/signed-file';

export default function SignedFileLink({ url, className = '', children }) {
  const [loading, setLoading] = useState(false);
  async function handle(e) {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    try {
      const r = await getSignedFileUrl(url);
      if (r?.error) { alert('Gagal membuka file: ' + r.error); return; }
      if (r?.url) window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert('Gagal membuka file: ' + (err?.message || err));
    } finally { setLoading(false); }
  }
  return (
    <a href={url || '#'} onClick={handle} className={className}>
      {loading ? '⏳…' : children}
    </a>
  );
}
