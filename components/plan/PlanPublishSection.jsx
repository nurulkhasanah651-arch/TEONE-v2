'use client';

// Section "Trip Siap Publish" di Plan Trip.
// Daftar trip berstatus prepare to sell (belum dipublish) + jadwal publish + tombol Sudah Publish.
// Publish -> status jadi Open Selling di Master Trip.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { publishTrip, setTripSchedulePublish } from '@/app/(app)/plan/trip-actions';
import CopyWaTemplateButton from '@/components/trips/CopyWaTemplateButton';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

export default function PlanPublishSection({ trips = [], canEdit = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  async function doPublish(id) {
    setBusy(id);
    const r = await publishTrip(id);
    setBusy(null);
    setConfirmId(null);
    if (r?.error) alert('Gagal publish: ' + r.error);
    else router.refresh();
  }

  async function saveSchedule(id, val) {
    const r = await setTripSchedulePublish(id, val);
    if (r?.error) alert('Gagal simpan jadwal: ' + r.error);
    else router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="font-bold text-amber-800">📋 Trip Siap Publish <span className="text-amber-600">({trips.length})</span></p>
          <p className="text-xs text-amber-700/80">Trip berstatus <b>Prepare to Sell</b>. Isi jadwal publish, lalu klik “Sudah Publish” → status jadi Open Selling di Master Trip.</p>
        </div>
      </div>

      {trips.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">Tidak ada trip yang menunggu publish. 🎉</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2 font-semibold">Trip</th>
                <th className="px-4 py-2 font-semibold">Berangkat</th>
                <th className="px-4 py-2 font-semibold">Peserta</th>
                <th className="px-4 py-2 font-semibold">Schedule Publish</th>
                <th className="px-4 py-2 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
                      <Link href={`/trips/${t.id}`} className="text-sm font-semibold text-slate-800 hover:text-brand-700 hover:underline">{t.name}</Link>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{t.destination || '—'} · kuota {t.quota || 0} · {fmtRupiah(t.price)}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{t.departure || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{t._soldReal ?? 0}</td>
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      defaultValue={t.publish_date ? String(t.publish_date).slice(0, 10) : ''}
                      onBlur={(e) => { if (canEdit && (e.target.value || '') !== (t.publish_date ? String(t.publish_date).slice(0, 10) : '')) saveSchedule(t.id, e.target.value); }}
                      disabled={!canEdit}
                      className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <div className="flex items-center gap-3 mt-1.5">
                      <a href={`/trip/${t.id}/pdf`} target="_blank" rel="noreferrer"
                        className="text-[11px] font-semibold text-blue-600 hover:underline">📄 PDF Publish</a>
                      <CopyWaTemplateButton tripId={t.id} className="text-[11px] font-semibold text-green-700 hover:underline" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!canEdit ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : confirmId === t.id ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-slate-500">Yakin?</span>
                        <button type="button" onClick={() => doPublish(t.id)} disabled={busy === t.id}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded disabled:opacity-60">
                          {busy === t.id ? '…' : 'Ya, publish'}
                        </button>
                        <button type="button" onClick={() => setConfirmId(null)} disabled={busy === t.id}
                          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Batal</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(t.id)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">
                        ✅ Sudah Publish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
