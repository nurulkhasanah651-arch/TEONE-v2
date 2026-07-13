'use client';

// Closing dari Chat (inbox) — daftar draft yang perlu dilengkapi jadi peserta.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeClosingDraft } from '@/lib/actions/cs.js';

function fmtDur(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const s = Math.round(sec);
  if (s < 60) return s + ' dtk';
  if (s < 3600) return Math.round(s / 60) + ' mnt';
  if (s < 86400) return (s / 3600).toFixed(1) + ' jam';
  return (s / 86400).toFixed(1) + ' hari';
}

export default function ClosingDraftsPanel({ drafts = [], avgByTrip = {} }) {
  const router = useRouter();
  const [openId, setOpenId] = useState(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  function submit(e, draftId) {
    e.preventDefault();
    setErr('');
    const fd = new FormData(e.target);
    startTransition(async () => {
      const r = await completeClosingDraft(draftId, fd);
      if (r?.error) { setErr(r.error); return; }
      setOpenId(null);
      router.refresh();
    });
  }

  if (!drafts.length) return null;

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
        <h2 className="font-bold text-amber-800">🔥 Closing dari Chat — perlu dilengkapi ({drafts.length})</h2>
        <span className="text-xs text-amber-700">Nama & no HP otomatis dari inbox. Lengkapi kamar, harga, DP → jadi peserta.</span>
      </div>
      <div className="divide-y divide-slate-100">
        {drafts.map((d) => (
          <div key={d.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{d.customer_name || d.customer_phone || 'Tanpa nama'} <span className="text-xs font-normal text-slate-500">· {d.customer_phone}</span></p>
                <p className="text-xs text-slate-500">{d.trip_label} · {d.pax_count || 1} pax · stage {d.stage}{avgByTrip[d.trip_id] != null ? ` · rata2 closing trip ini: ${fmtDur(avgByTrip[d.trip_id])}` : ''}</p>
              </div>
              <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="px-3 py-1.5 text-xs font-bold rounded bg-brand-500 hover:bg-brand-600 text-white">{openId === d.id ? 'Tutup' : 'Lengkapi'}</button>
            </div>

            {openId === d.id && (
              <form onSubmit={(e) => submit(e, d.id)} className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm bg-slate-50 p-3 rounded-lg">
                <label className="col-span-2 md:col-span-1">Nama<input name="name" defaultValue={d.customer_name || ''} className="w-full mt-0.5 px-2 py-1 border rounded text-xs" required /></label>
                <label>No HP<input name="phone" defaultValue={d.customer_phone || ''} className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label>Email<input name="email" className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label>Kamar
                  <select name="room_type" className="w-full mt-0.5 px-2 py-1 border rounded text-xs">
                    <option value="">—</option><option>Quad</option><option>Triple</option><option>Double</option><option>Single</option>
                  </select>
                </label>
                <label>Usia
                  <select name="age_type" className="w-full mt-0.5 px-2 py-1 border rounded text-xs">
                    <option value="adult">Dewasa</option><option value="child">Anak</option><option value="infant">Bayi</option>
                  </select>
                </label>
                <label>Harga (Rp)<input name="price_paid" type="number" className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label>Diskon (Rp)<input name="discount" type="number" className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label>DP (Rp)<input name="dp_amount" type="number" className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label>Tgl DP<input name="dp_date" type="date" className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label>Metode DP<input name="dp_method" placeholder="Transfer BCA…" className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label className="col-span-2">Link bukti DP / paspor (opsional)<input name="dp_proof_url" placeholder="URL foto bukti/paspor" className="w-full mt-0.5 px-2 py-1 border rounded text-xs" /></label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="include_visa" /> Urus visa</label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="include_asuransi" /> Asuransi</label>
                <div className="col-span-2 md:col-span-3 flex items-center gap-3 mt-1">
                  <button type="submit" disabled={pending} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded disabled:opacity-50">{pending ? 'Menyimpan…' : 'Simpan jadi peserta'}</button>
                  <p className="text-[11px] text-slate-500">Foto paspor & bukti bisa diupload lengkap di halaman peserta setelah tersimpan.</p>
                </div>
                {err && <p className="col-span-2 md:col-span-3 text-xs text-red-600">{err}</p>}
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
