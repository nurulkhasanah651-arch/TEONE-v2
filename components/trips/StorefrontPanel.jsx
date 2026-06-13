'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTripPublicContent, uploadStorefrontImage } from '@/lib/actions/shop-admin';
import { ROOM_KEYS } from '@/lib/utils/price-breakdown';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function StorefrontPanel({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [published, setPublished] = useState(!!trip.is_published);
  const [cover, setCover] = useState(trip.cover_image_url || '');
  const [gallery, setGallery] = useState(Array.isArray(trip.gallery_images) ? trip.gallery_images : []);
  const [uploading, setUploading] = useState(null); // 'cover' | 'gallery' | 'day-<i>'

  const [itin, setItin] = useState(
    Array.isArray(trip.itinerary) && trip.itinerary.length
      ? trip.itinerary.map((d) => ({ title: d.title || '', detail: d.detail || '', image: d.image || '' }))
      : [{ title: '', detail: '', image: '' }]
  );

  const bd = (trip.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};
  const roomPrices = ROOM_KEYS.map((r) => ({ ...r, price: Number(bd[r.key]) || 0 })).filter((r) => r.price > 0);

  async function uploadOne(file) {
    const fd = new FormData();
    fd.set('file', file);
    fd.set('tripId', String(trip.id));
    return uploadStorefrontImage(fd);
  }

  async function doUpload(file, kind) {
    if (!file) return;
    setUploading(kind); setMsg(null);
    const r = await uploadOne(file);
    setUploading(null);
    if (r?.error) { setMsg({ t: 'e', x: r.error }); return; }
    if (r?.url) {
      if (kind === 'cover') setCover(r.url);
      else setGallery((g) => [...g, r.url]);
    }
  }

  // ---- Itinerary helpers ----
  function setDay(i, field, val) { setItin((a) => a.map((d, j) => j === i ? { ...d, [field]: val } : d)); }
  function addDay() { setItin((a) => [...a, { title: '', detail: '', image: '' }]); }
  function removeDay(i) { setItin((a) => a.length > 1 ? a.filter((_, j) => j !== i) : a); }
  async function uploadDay(i, file) {
    if (!file) return;
    setUploading('day-' + i); setMsg(null);
    const r = await uploadOne(file);
    setUploading(null);
    if (r?.error) { setMsg({ t: 'e', x: r.error }); return; }
    if (r?.url) setDay(i, 'image', r.url);
  }

  function submit(e) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.target);
    fd.set('is_published', published ? '1' : '0');
    fd.set('_name', trip.name || '');
    fd.set('cover_image_url', cover || '');
    fd.set('gallery_images', JSON.stringify(gallery));
    fd.set('itinerary_json', JSON.stringify(itin));
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
      <form onSubmit={submit} className="p-5 space-y-4">

        <div>
          <span className="text-xs font-bold text-slate-600">Foto Cover</span>
          <div className="mt-1 flex items-center gap-3">
            <div className="w-28 h-20 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-400 text-xs shrink-0">
              {cover ? <img src={cover} alt="cover" className="w-full h-full object-cover" /> : 'belum ada'}
            </div>
            <div className="flex-1">
              <label className="inline-block px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer">
                {uploading === 'cover' ? 'Mengunggah…' : '📷 Upload Foto Cover'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading === 'cover'}
                  onChange={(e) => { doUpload(e.target.files?.[0], 'cover'); e.target.value = ''; }} />
              </label>
              {cover && <button type="button" onClick={() => setCover('')} className="ml-2 text-xs text-red-600 hover:underline">Hapus</button>}
              <p className="text-[11px] text-slate-400 mt-1">JPG/PNG/WebP, maks 8MB.</p>
            </div>
          </div>
        </div>

        <div>
          <span className="text-xs font-bold text-slate-600">Galeri Foto (untuk slideshow di halaman trip)</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {gallery.map((url, i) => (
              <div key={i} className="relative w-20 h-16 rounded-lg overflow-hidden border border-slate-200 group">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setGallery((g) => g.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 bg-red-600 text-white w-5 h-5 rounded-full text-xs leading-none opacity-0 group-hover:opacity-100">×</button>
              </div>
            ))}
            <label className="w-20 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-emerald-400 flex items-center justify-center cursor-pointer text-slate-400 text-2xl">
              {uploading === 'gallery' ? <span className="text-xs">…</span> : '+'}
              <input type="file" accept="image/*" className="hidden" disabled={uploading === 'gallery'}
                onChange={(e) => { doUpload(e.target.files?.[0], 'gallery'); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Slug URL (otomatis dari nama kalau kosong)</span>
            <input name="slug" defaultValue={trip.slug || ''} placeholder="west-europe-open-trip" className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">DP (Rp)</span>
            <input name="dp_amount" defaultValue={trip.dp_amount || ''} placeholder="3500000" className={inp} /></label>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-700">💰 Harga per tipe kamar (otomatis dari Master Trip)</p>
          {roomPrices.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {roomPrices.map((r) => (
                <span key={r.key} className="text-xs bg-white border border-slate-200 rounded-full px-3 py-1 font-semibold text-slate-700">
                  {r.label}: {fmtRp(r.price)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-600 mt-1">Belum ada harga kamar di Master Trip. Isi dulu "Rincian Harga" di form trip di atas.</p>
          )}
          <label className="block mt-3"><span className="text-[11px] font-bold text-slate-500">Harga tampil "mulai dari" (opsional — kosongkan untuk pakai harga kamar termurah)</span>
            <input name="public_price" defaultValue={trip.public_price || ''} placeholder="otomatis dari kamar termurah" className={inp} /></label>
        </div>

        <label className="block"><span className="text-xs font-bold text-slate-600">Highlight (singkat)</span>
          <input name="highlights" defaultValue={trip.highlights || ''} placeholder="Menara Eiffel · Seine Cruise · Keukenhof" className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Deskripsi</span>
          <textarea name="description" defaultValue={trip.description || ''} rows={3} className={inp} /></label>

        {/* ITINERARY per hari + foto */}
        <div>
          <span className="text-xs font-bold text-slate-600">Itinerary per Hari (judul, detail, foto)</span>
          <div className="mt-1 space-y-3">
            {itin.map((d, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 bg-slate-900 text-white rounded-full px-2.5 py-0.5">Hari {i + 1}</span>
                  <button type="button" onClick={() => removeDay(i)} className="text-xs text-red-600 hover:underline">Hapus hari</button>
                </div>
                <div className="flex gap-3">
                  <div className="shrink-0">
                    <div className="w-24 h-20 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center text-slate-300 text-xs">
                      {d.image ? <img src={d.image} alt="" className="w-full h-full object-cover" /> : 'foto'}
                    </div>
                    <label className="mt-1 block text-center text-[11px] font-bold text-emerald-700 cursor-pointer hover:underline">
                      {uploading === 'day-' + i ? 'Unggah…' : (d.image ? 'Ganti foto' : '📷 Upload')}
                      <input type="file" accept="image/*" className="hidden" disabled={uploading === 'day-' + i}
                        onChange={(e) => { uploadDay(i, e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {d.image && <button type="button" onClick={() => setDay(i, 'image', '')} className="block w-full text-center text-[11px] text-red-500 hover:underline">hapus foto</button>}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input value={d.title} onChange={(e) => setDay(i, 'title', e.target.value)} placeholder="Judul hari (mis: Tiba di Paris)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <textarea value={d.detail} onChange={(e) => setDay(i, 'detail', e.target.value)} rows={2} placeholder="Detail kegiatan hari ini" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addDay} className="mt-2 px-3 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50">+ Tambah Hari</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Termasuk (1 per baris)</span>
            <textarea name="included" defaultValue={trip.included || ''} rows={3} className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Tidak Termasuk (1 per baris)</span>
            <textarea name="excluded" defaultValue={trip.excluded || ''} rows={3} className={inp} /></label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">📋 Syarat &amp; Ketentuan</span>
            <textarea name="syarat_ketentuan" defaultValue={trip.syarat_ketentuan || ''} rows={4} placeholder={'Pembayaran DP mengunci seat\nPelunasan H-45 sebelum keberangkatan\nDP tidak dapat dikembalikan'} className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">🛂 Syarat Visa</span>
            <textarea name="syarat_visa" defaultValue={trip.syarat_visa || ''} rows={4} placeholder={'Paspor masa berlaku min. 6 bulan\nFoto 4x6 latar putih\nRekening koran 3 bulan terakhir'} className={inp} /></label>
        </div>
        <p className="text-[11px] text-slate-400 -mt-2">Di web, dua bagian ini tampil sebagai tombol yang bisa diklik (buka-tutup) supaya halaman tidak panjang. 1 poin per baris.</p>

        {msg && <div className={`px-3 py-2 rounded text-sm ${msg.t === 'e' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.x}</div>}
        <div className="flex justify-end gap-2">
          {trip.slug && published && <a href={`/trip/${trip.slug}`} target="_blank" className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">↗ Lihat di web</a>}
          <button type="submit" disabled={pending} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">{pending ? 'Menyimpan…' : 'Simpan Konten Jualan'}</button>
        </div>
      </form>
    </div>
  );
}
