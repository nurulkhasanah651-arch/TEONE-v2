'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAdsEntry, deleteAdsEntry } from '@/lib/actions/ads';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';

const PLATFORMS = [
  { value: 'meta',   label: '📱 Meta (FB/IG)' },
  { value: 'google', label: '🔍 Google' },
  { value: 'tiktok', label: '🎵 TikTok' },
  { value: 'other',  label: '🌐 Lainnya' },
];

export default function AdsManager({ entries = [], trips = [] }) {
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleAdd(formData) {
    startTransition(async () => {
      const r = await createAdsEntry(formData);
      if (r?.error) { alert(r.error); return; }
      setShowForm(false);
      router.refresh();
    });
  }

  function handleDelete(id) {
    if (!confirm('Hapus entry ini?')) return;
    startTransition(async () => {
      const r = await deleteAdsEntry(id);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-brand-700">📊 Riwayat Spend Iklan</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded">
          {showForm ? '× Tutup' : '+ Tambah Spend'}
        </button>
      </div>

      {showForm && (
        <form action={handleAdd} className="p-4 bg-amber-50 border-b border-amber-200 space-y-3">
          <h3 className="text-sm font-bold text-amber-800">+ Input Spend Iklan</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input type="date" name="date" defaultValue={new Date().toISOString().slice(0,10)} required className={inputCls} />
            <select name="platform" required className={inputCls}>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input type="number" name="spend" required min="0" placeholder="Spend (IDR)" className={inputCls} />
            <input type="number" name="leads" min="0" defaultValue="0" placeholder="Leads dapat" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <input type="text" name="campaign_name" placeholder="Nama campaign (opsional)" className={inputCls} />
            <input type="number" name="impressions" min="0" placeholder="Impressions" className={inputCls} />
            <input type="number" name="clicks" min="0" placeholder="Clicks" className={inputCls} />
          </div>
          <select name="trip_id" className={inputCls}>
            <option value="">— Trip terkait (opsional, kalau campaign specific) —</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip || `#${t.id}`} — {t.name}</option>)}
          </select>
          <input type="text" name="notes" placeholder="Catatan (opsional)" className={inputCls} />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Batal</button>
            <button type="submit" disabled={pending} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded disabled:opacity-50">
              {pending ? 'Menyimpan...' : 'Simpan Entry'}
            </button>
          </div>
        </form>
      )}

      {entries.length === 0 ? (
        <p className="p-8 text-sm text-slate-500 text-center">Belum ada entry spend iklan. Klik "+ Tambah Spend" untuk mulai tracking.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Platform</th>
                <th className="px-3 py-2 text-left">Campaign</th>
                <th className="px-3 py-2 text-right">Spend</th>
                <th className="px-3 py-2 text-right">Leads</th>
                <th className="px-3 py-2 text-right">CPL</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => {
                const p = PLATFORMS.find((pl) => pl.value === e.platform);
                const cpl = e.leads > 0 ? Number(e.spend) / e.leads : 0;
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs">{fmtDate(e.date)}</td>
                    <td className="px-3 py-2 text-xs">{p?.label || e.platform}</td>
                    <td className="px-3 py-2 text-xs">{e.campaign_name || <em className="text-slate-400">—</em>}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700">{fmtRupiah(e.spend)}</td>
                    <td className="px-3 py-2 text-right">{e.leads || 0}</td>
                    <td className="px-3 py-2 text-right text-xs">{cpl > 0 ? fmtRupiah(cpl) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => handleDelete(e.id)} disabled={pending} className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 font-semibold">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none bg-white';
