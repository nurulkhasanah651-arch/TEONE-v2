'use client';

// Link ke file privat: ambil signed URL saat diklik lalu buka. Aman utk bucket privat.
import { useState } from 'react';
import { getSignedFileUrl } from '@/lib/actions/signed-file';

export default function SignedFileLink({ url, className = '', children }) {
  const [loading, setLoading] = useState(false);
  async function handle(e) {
    e.preventDefault();
    if (!url) return;
    // Buka tab SINKRON dulu (dalam gesture klik) supaya tak diblok popup-blocker mobile,
    // baru arahkan ke signed URL setelah didapat. Fallback: navigasi tab saat ini.
    let w = null;
    try { w = window.open('', '_blank'); } catch { w = null; }
    setLoading(true);
    try {
      const r = await getSignedFileUrl(url);
      if (r?.error || !r?.url) {
        if (w) { try { w.close(); } catch {} }
        alert('Gagal membuka file: ' + (r?.error || 'tidak ditemukan'));
        return;
      }
      if (w) { try { w.location.href = r.url; } catch { window.location.href = r.url; } }
      else { window.location.href = r.url; }
    } catch (err) {
      if (w) { try { w.close(); } catch {} }
      alert('Gagal membuka file: ' + (err?.message || err));
    } finally { setLoading(false); }
  }
  return (
    <a href="#" onClick={handle} className={className}>
      {loading ? '⏳…' : children}
    </a>
  );
}
