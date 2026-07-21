'use client';

// Banner "pesan WA belum terkirim / device Fonnte terputus".
// Dimuat SETELAH halaman render (client-side) supaya cek status device Fonnte
// (panggilan API eksternal) TIDAK memblokir render tiap halaman -> web terasa cepat.

import { useEffect, useState } from 'react';
import { waOutboxSummary } from '@/lib/actions/wa-outbox';

export default function WaPendingBanner() {
  const [wa, setWa] = useState(null);

  useEffect(() => {
    let alive = true;
    waOutboxSummary().then((r) => { if (alive) setWa(r || { count: 0, offlineDepts: [] }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!wa) return null;
  const show = wa.count > 0 || (wa.offlineDepts && wa.offlineDepts.length > 0);
  if (!show) return null;

  return (
    <a href="/wa-pending" className="block mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 font-bold hover:bg-red-100">
      ⚠ {wa.count > 0
        ? `${wa.count} pesan WA belum terkirim`
        : `Nomor ${wa.offlineDepts.join(', ').toUpperCase()} kemungkinan terputus dari Fonnte`}
      {wa.count > 0 && wa.offlineDepts?.length ? ` — nomor ${wa.offlineDepts.join(', ').toUpperCase()} kemungkinan terputus dari Fonnte` : ''}
      . Klik untuk lihat &amp; kelola →
    </a>
  );
}
