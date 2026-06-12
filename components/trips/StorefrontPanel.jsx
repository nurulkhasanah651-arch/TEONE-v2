'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTripPublicContent } from '@/lib/actions/shop-admin';

export default function StorefrontPanel({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [published, setPublished] = useState(!!trip.is_published);

  const itinText = Array.isArray(trip.itinerary)
    ? trip.itinerary.map((d) => `${d.title || ''}${d.detail ? ' :: ' + d.detail : ''}`).join('\n')
    : '';

  function submit(e) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.target);
    fd.set('is_published', published ? '1' : '0');
    fd.set('_name', trip.name || '');
    startTransition(async () => {
      const r = await updateTripPublicContent(trip.id, fd);
      if (r?.error) { setMsg({ t: 'e', x: r.error }); return; }
      setMsg({ t: 'ok', x: 'Konten jualan tersimpan' + (r.slug ? ` · /trip/${r.slug}` : '') });
      router.refresh();
    });
  }

  const inp = 'w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm';
  return (
    <div className="bg-white rounded-xl border-2 border-emerald-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-emerald-800">🛒 Jualan Online (Storefront)</h2>
          <p className="text-xs text-emerald-700">Tampilkan trip ini di website publik (travelingeropa.com) + checkout online.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="w-4 h-4" />
          <span className="text-sm font-bold text-emerald-800">{published ? 'Tampil di web' : 'Belum tampil'}</span>
        </label>
      </div>
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Slug URL (otomatis dari nama kalau kosong)</span>
            <input name="slug" defaultValue={trip.slug || ''} placeholder="west-europe-open-trip" className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Link Foto Cover (URL)</span>
            <input name="cover_image_url" defaultValue={trip.cover_image_url || ''} placeholder="https://..." className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Harga Publik (Rp)</span>
            <input name="public_price" defaultValue={trip.public_price || ''} placeholder="19900000" className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">DP (Rp)</span>
            <input name="dp_amount" defaultValue={trip.dp_amount || ''} placeholder="3500000" className={inp} /></label>
        </div>
        <label className="block"><span className="text-xs font-bold text-slate-600">Highlight (singkat)</span>
          <input name="highlights" defaultValue={trip.highlights || ''} placeholder="Menara Eiffel · Seine Cruise · Keukenhof" className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Deskripsi</span>
          <textarea name="description" defaultValue={trip.description || ''} rows={3} className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Itinerary (1 baris = 1 hari, format: <b>Judul :: Detail</b>)</span>
          <textarea name="itinerary" defaultValue={itinText} rows={4} placeholder={'Tiba di Paris :: City tour Menara Eiffel\nAmsterdam :: Keukenhof & Zaanse Schans'} className={inp + ' font-mono text-xs'} /></label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Termasuk (1 per baris)</span>
            <textarea name="included" defaultValue={trip.included || ''} rows={3} className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Tidak Termasuk (1 per baris)</span>
            <textarea name="excluded" defaultValue={trip.excluded || ''} rows={3} className={inp} /></label>
        </div>
        {msg && <div className={`px-3 py-2 rounded text-sm ${msg.t === 'e' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.x}</div>}
        <div className="flex justify-end gap-2">
          {trip.slug && published && <a href={`/trip/${trip.slug}`} target="_blank" className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">↗ Lihat di web</a>}
          <button type="submit" disabled={pending} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">{pending ? 'Menyimpan…' : 'Simpan Konten Jualan'}</button>
        </div>
      </form>
    </div>
  );
}
