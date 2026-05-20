'use client';

// CS Update row with edit link + delete button

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCSUpdate } from '@/lib/actions/cs';
import { fmtDate } from '@/lib/utils/format';

export default function CSUpdateRow({ update }) {
  const u = update;
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Hapus update CS tanggal ${fmtDate(u.tanggal)} untuk trip "${u.trips?.name || u.trip_id}"?`)) return;
    startTransition(async () => {
      const result = await deleteCSUpdate(u.id);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  return (
    <div className="px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-brand-700">
            {u.trips?.kode_trip || `#${u.trip_id}`} — {u.trips?.name || 'Unknown trip'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{fmtDate(u.tanggal)}</p>
        </div>
        <div className="flex gap-2 text-xs flex-wrap items-center">
          <span className="px-2 py-1 rounded bg-green-50 text-green-700 font-semibold">Terjual: {u.total_terjual_hari_ini || 0}</span>
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold">Leads: {u.jumlah_leads || 0}</span>
          <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 font-semibold">Sisa: {u.sisa_seat || 0}</span>
          <Link
            href={`/cs/${u.id}/edit`}
            className="px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold transition-colors"
          >
            ✎ Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors disabled:opacity-50"
          >
            🗑 Hapus
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex gap-2 text-[11px] text-slate-500 flex-wrap">
        {u.from_instagram > 0 && <span>📷 IG: {u.from_instagram}</span>}
        {u.from_whatsapp > 0 && <span>· 💬 WA: {u.from_whatsapp}</span>}
        {u.from_offline > 0 && <span>· 🏪 Offline: {u.from_offline}</span>}
        {u.closing_alumni > 0 && <span>· 🎓 Alumni: {u.closing_alumni}</span>}
        {u.closing_mitra > 0 && <span>· 🤝 Mitra: {u.closing_mitra}</span>}
        {u.notes && <span className="italic">· 📝 {u.notes}</span>}
      </div>
    </div>
  );
}
