'use client';
import { useEffect, useState, useTransition } from 'react';
import { getCampaignTripMappings, setCampaignTrip } from '@/lib/actions/ads';

function rp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function CampaignTripLinker() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [, startTransition] = useTransition();

  async function load() {
    setLoading(true); setErr('');
    const r = await getCampaignTripMappings();
    if (r?.ok) setData(r); else setErr(r?.error || 'Gagal memuat');
    setLoading(false);
  }
  useEffect(() => { if (open && !data) load(); }, [open]);

  function pick(campaign, tripId) {
    setSavingKey(campaign);
    startTransition(async () => {
      const r = await setCampaignTrip(campaign, tripId);
      if (r?.ok) {
        setData((d) => ({
          ...d,
          campaigns: d.campaigns.map((c) => c.campaign_name === campaign
            ? { ...c, trip_id: tripId || null, trip_label: tripId ? (d.trips.find((t) => t.id === tripId)?.label || tripId) : null, linked: Boolean(tripId), manual: true }
            : c),
        }));
      } else { setErr(r?.error || 'Gagal menyimpan'); }
      setSavingKey('');
    });
  }

  const campaigns = data?.campaigns || [];
  const trips = data?.trips || [];
  const unlinked = campaigns.filter((c) => !c.linked).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-left">
        <div>
          <h2 className="font-bold text-brand-700">🔗 Hubungkan Campaign Meta ↔ Trip</h2>
          <p className="text-xs text-slate-500 mt-0.5">Kode di nama campaign (mis. <b>TE - 536 …</b>) otomatis nyambung ke trip. Yang tak terdeteksi bisa dipilih manual di sini.</p>
        </div>
        <span className="text-sm text-brand-600 font-semibold shrink-0 ml-3">{open ? 'Tutup ▲' : `Buka ▼${unlinked ? ` · ${unlinked} belum` : ''}`}</span>
      </button>

      {open && (
        <div className="p-4">
          {loading && <p className="text-sm text-slate-500 py-6 text-center">Memuat…</p>}
          {err && <p className="text-sm text-rose-600 mb-2">⚠ {err}</p>}
          {!loading && data && (
            <>
              <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
                <span>{campaigns.length} campaign · <b className="text-amber-700">{unlinked}</b> belum ke-link</span>
                <button onClick={load} className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 font-semibold">↻ Muat ulang</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Campaign</th>
                      <th className="px-3 py-2 text-right">Spend</th>
                      <th className="px-3 py-2 text-left">Trip</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {campaigns.map((c) => (
                      <tr key={c.campaign_name} className={c.linked ? '' : 'bg-amber-50/40'}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-800 text-xs">{c.campaign_name}</div>
                          {c.detected_code && <span className="text-[10px] text-slate-400">kode terdeteksi: {c.detected_code}</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{rp(c.spend)}</td>
                        <td className="px-3 py-2">
                          <select
                            value={c.trip_id || ''}
                            disabled={savingKey === c.campaign_name}
                            onChange={(e) => pick(c.campaign_name, e.target.value)}
                            className="w-full max-w-[280px] px-2 py-1.5 border border-slate-300 rounded text-xs disabled:opacity-50">
                            <option value="">— tanpa trip (umum) —</option>
                            {trips.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {savingKey === c.campaign_name
                            ? <span className="text-[10px] text-slate-400">menyimpan…</span>
                            : c.linked
                              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{c.manual ? '✓ manual' : '✓ auto'}</span>
                              : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">belum</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Pilihan manual tersimpan permanen — tetap dipakai walau data ads di-sync ulang dari Meta. Perubahan langsung tampil di tabel Per-Trip Performance.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
