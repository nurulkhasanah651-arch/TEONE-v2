'use client';

// <img> dari file privat: resolve signed URL saat dirender. Aman utk bucket privat.
import { useEffect, useState } from 'react';
import { getSignedFileUrl } from '@/lib/actions/signed-file';

export default function SignedImage({ url, alt = '', className = '' }) {
  const [src, setSrc] = useState('');
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!url) return;
      const r = await getSignedFileUrl(url);
      if (!alive) return;
      if (r?.url) setSrc(r.url); else setErr(true);
    })();
    return () => { alive = false; };
  }, [url]);
  if (err) return <span className="text-[10px] text-red-600">Gagal memuat gambar</span>;
  if (!src) return <span className="text-[10px] text-slate-400">⏳ memuat…</span>;
  return <img src={src} alt={alt} className={className} />;
}
