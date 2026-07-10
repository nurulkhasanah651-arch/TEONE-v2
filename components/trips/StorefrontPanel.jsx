'use client';
import { useState, useEffect, useTransition } from 'react';
import { VISA_TEMPLATES } from '@/lib/shop/visa-templates';
import { useRouter } from 'next/navigation';
import { updateTripPublicContent, uploadStorefrontImage, listStorefrontTemplates, getStorefrontTemplate, applyTemplateToTrip } from '@/lib/actions/shop-admin';
import { ROOM_KEYS } from '@/lib/utils/price-breakdown';
import { compressImage } from '@/lib/utils/compress-image';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function StorefrontPanel({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [published, setPublished] = useState(!!trip.is_published);
  const [syaratVisa, setSyaratVisa] = useState(trip.syarat_visa || '');
  const [flashSale, setFlashSale] = useState(!!trip.is_flash_sale);
  const [bestSeller, setBestSeller] = useState(!!trip.is_best_seller);
  const [cover, setCover] = useState(trip.cover_image_url || '');
  const [gallery, setGallery] = useState(Array.isArray(trip.gallery_images) ? trip.gallery_images : []);
  const [uploading, setUploading] = useState(null); // 'cover' | 'gallery' | 'day-<i>'
  const [highlights, setHighlights] = useState(trip.highlights || '');
  const [description, setDescription] = useState(trip.description || '');
  const [included, setIncluded] = useState(trip.included || '');
  const [excluded, setExcluded] = useState(trip.excluded || '');
  const [syaratKetentuan, setSyaratKetentuan] = useState(trip.syarat_ketentuan || '');
  const [templates, setTemplates] = useState([]);
  const [applying, setApplying] = useState(false);

  const [itin, setItin] = useState(
    Array.isArray(trip.itinerary) && trip.itinerary.length
      ? trip.itinerary.map((d) => ({ title: d.title || '', detail: d.detail || '', image: d.image || '' }))
      : [{ title: '', detail: '', image: '' }]
  );

  // Skema cicilan KHUSUS tampilan web (trip.web_payment_schedule) — TERPISAH dari payment checklist finance.
  const _ws0 = Array.isArray(trip.web_payment_schedule) ? trip.web_payment_schedule : [];
  const [insts, setInsts] = useState(() => {
    const a = _ws0.filter((r) => r && r.type && r.type !== 'Pelunasan').map((r) => ({ amount: r.amount || '', due: r.due || '', note: r.note || '' }));
    return a.length ? a : [{ amount: '', due: '', note: '' }];
  });
  const [pelDue, setPelDue] = useState((_ws0.find((r) => r && r.type === 'Pelunasan') || {}).due || '');
  const [pelNote, setPelNote] = useState((_ws0.find((r) => r && r.type === 'Pelunasan') || {}).note || '');

  const [bd, setBd] = useState((trip.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {});
  const [dpAmount, setDpAmount] = useState(trip.dp_amount || '');
  const [tplApplied, setTplApplied] = useState(false);
  const roomPrices = ROOM_KEYS.map((r) => ({ ...r, price: Number(bd[r.key]) || 0 })).filter((r) => r.price > 0);
  const EXTRA_LABELS = { tips: 'Tips', city_tax: 'City Tax', domestic_baggage: 'Bagasi Domestik', domestic_flight: 'Tiket Domestik', harga_jual_base: 'Base', visa: 'Visa', asuransi: 'Asuransi', perlengkapan: 'Perlengkapan' };
  const extraRows = Object.keys(EXTRA_LABELS).map((k) => ({ k, label: EXTRA_LABELS[k], val: Number(bd[k]) || 0 })).filter((x) => x.val > 0);

  async function uploadOne(file) {
    // Kompres/resize di browser dulu (atasi foto HP besar gagal upload — limit ~4.5MB Vercel)
    const compressed = await compressImage(file, { maxDim: 1920, quality: 0.78 });
    const fd = new FormData();
    fd.set('file', compressed || file);
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

  useEffect(() => {
    listStorefrontTemplates(trip.id).then((r) => { if (r?.templates) setTemplates(r.templates); }).catch(() => {});
  }, []);

  async function applyTemplate(sourceId) {
    if (!sourceId) return;
    if (!confirm('Terapkan template ini? SEMUA konten trip ini (foto, itinerary, deskripsi, highlight, termasuk/tidak, visa, S&K, HARGA per tipe + city tax/tips dll, DP, skema cicilan) akan DITIMPA dari trip sumber dan LANGSUNG TERSIMPAN. Slug, nama, tanggal trip ini tetap.')) return;
    setApplying(true); setMsg(null);
    try {
      const r = await applyTemplateToTrip(trip.id, sourceId);
      if (r?.error) { setMsg({ t: 'e', x: r.error }); setApplying(false); return; }
      setMsg({ t: 'ok', x: 'Template diterapkan & tersimpan (termasuk harga). Memuat ulang halaman…' });
      setTimeout(() => { window.location.reload(); }, 700);
    } catch (e) { setMsg({ t: 'e', x: e?.message || 'gagal' }); setApplying(false); }
  }

  function submit(e) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.target);
    fd.set('is_published', published ? '1' : '0');
    fd.set('is_flash_sale', flashSale ? '1' : '0');
    fd.set('is_best_seller', bestSeller ? '1' : '0');
    fd.set('_name', trip.name || '');
    fd.set('cover_image_url', cover || '');
    fd.set('gallery_images', JSON.stringify(gallery));
    fd.set('itinerary_json', JSON.stringify(itin));
    startTransition(async () => {
      const r = await updateTripPublicContent(trip.id, fd);
      if (r?.error) { setMsg({ t: 'e', x: r.error }); return; }
      if (tplApplied) {
        setMsg({ t: 'ok', x: 'Tersimpan. Memuat ulang halaman supaya harga tampil di Master Trip…' });
        setTimeout(() => { window.location.reload(); }, 700);
        return;
      }
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={flashSale} onChange={(e) => setFlashSale(e.target.checked)} className="w-4 h-4 accent-rose-600" />
          <span className="text-sm font-bold text-rose-700">⚡ Flash Sale</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={bestSeller} onChange={(e) => setBestSeller(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm font-bold text-amber-700">⭐ Best Seller</span>
        </label>
        <button type="button" onClick={() => window.open(`/trip/${trip.slug || trip.id}/pdf`, '_blank')}
          className="ml-auto px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-800">📄 Download PDF</button>
      </div>
      <form onSubmit={submit} className="p-5 space-y-4">

        <div className="rounded-lg bg-emerald-50 border-2 border-emerald-300 p-3">
          <label className="block">
            <span className="text-sm font-extrabold text-emerald-800">📝 Judul Trip (tampil di web)</span>
            <span className="block text-[11px] text-emerald-700 mb-1">Judul besar yang dilihat customer — boleh beda dari nama Master Trip. Kosongkan = pakai nama master.</span>
            <input name="public_title" defaultValue={trip.public_title || ''} placeholder={trip.name || 'mis: West Europe Special Zermatt Swiss'} className={inp + ' bg-white'} />
          </label>
        </div>

        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
          <span className="text-xs font-bold text-indigo-800">⚡ Pakai Template dari Trip Lain</span>
          <p className="text-[11px] text-indigo-600 mb-1">Pilih paket yang sudah ada (mis. West Europe) → itinerary, foto, deskripsi, highlight, termasuk/tidak, visa & S&K terisi otomatis. Tinggal edit lalu Simpan. (Harga & DP tetap dari trip ini.)</p>
          <select value="" disabled={applying} onChange={(e) => { applyTemplate(e.target.value); e.target.value = ''; }} className={inp + ' bg-white'}>
            <option value="">{applying ? 'Menerapkan…' : '— Pilih trip sebagai template —'}</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.kode_trip ? ` (${t.kode_trip})` : ''}</option>)}
          </select>
        </div>

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
              <p className="text-[11px] text-slate-400 mt-1">JPG/PNG/WebP — foto besar otomatis dikompres.</p>
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
            <input name="dp_amount" value={dpAmount} onChange={(e) => setDpAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="3500000" className={inp} /></label>
        </div>

        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
          <p className="text-xs font-bold text-indigo-700">🗓 Skema Cicilan (diisi CS) — tampil ke customer di web</p>
          <p className="text-[11px] text-indigo-600 mb-2">DP pakai field DP di atas. Tambah termin sesuai kebutuhan (maks 7). <b>Pelunasan otomatis = sisa tagihan</b>, cukup isi tanggalnya.
            Tanggal boleh dikosongkan kalau syaratnya bukan tanggal — tulis saja di kolom keterangan (mis. <i>&ldquo;dibayar setelah trip full seat&rdquo;</i>).</p>
          <div className="space-y-2">
            {insts.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-12 sm:col-span-3 text-xs font-semibold text-slate-600">Payment {i + 1}</span>
                <input className="col-span-6 sm:col-span-4 px-2 py-1.5 border border-slate-300 rounded text-sm" placeholder="Nominal (Rp)" inputMode="numeric"
                  value={r.amount} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setInsts((s) => s.map((x, j) => j === i ? { ...x, amount: v } : x)); }} />
                <input type="date" className="col-span-5 sm:col-span-4 px-2 py-1.5 border border-slate-300 rounded text-sm"
                  value={r.due || ''} onChange={(e) => { const v = e.target.value; setInsts((s) => s.map((x, j) => j === i ? { ...x, due: v } : x)); }} />
                <button type="button" title="Hapus termin" onClick={() => setInsts((s) => s.filter((_, j) => j !== i))}
                  className="col-span-1 text-red-500 hover:text-red-700 text-sm font-bold">✕</button>
                <input className="col-span-12 sm:col-start-4 sm:col-span-8 px-2 py-1.5 border border-slate-300 rounded text-sm"
                  placeholder="Keterangan (opsional) — mis. dibayar setelah trip full seat"
                  value={r.note || ''} onChange={(e) => { const v = e.target.value; setInsts((s) => s.map((x, j) => j === i ? { ...x, note: v } : x)); }} />
              </div>
            ))}
          </div>
          {insts.length < 7 && (
            <button type="button" onClick={() => setInsts((s) => [...s, { amount: '', due: '', note: '' }])}
              className="mt-2 text-xs font-bold text-indigo-700 hover:underline">+ Tambah Payment</button>
          )}
          <div className="mt-3 grid grid-cols-12 gap-2 items-center border-t border-indigo-200 pt-2">
            <span className="col-span-12 sm:col-span-3 text-xs font-semibold text-slate-600">Pelunasan</span>
            <span className="col-span-6 sm:col-span-4 text-[11px] text-slate-500 italic">menyesuaikan sisa tagihan</span>
            <input type="date" className="col-span-5 sm:col-span-4 px-2 py-1.5 border border-slate-300 rounded text-sm"
              value={pelDue} onChange={(e) => setPelDue(e.target.value)} />
            <input className="col-span-12 sm:col-start-4 sm:col-span-8 px-2 py-1.5 border border-slate-300 rounded text-sm"
              placeholder="Keterangan (opsional) — mis. paling lambat H-30 keberangkatan"
              value={pelNote} onChange={(e) => setPelNote(e.target.value)} />
          </div>
          <input type="hidden" name="payment_schedule_json"
            value={JSON.stringify([
              ...insts.map((r, i) => ({ type: 'P' + (i + 1), amount: Number(r.amount) || 0, due: r.due || '', note: (r.note || '').trim() })),
              { type: 'Pelunasan', amount: 0, due: pelDue || '', note: (pelNote || '').trim() },
            ])} />
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-700">💰 Harga per tipe kamar (dari Master Trip / template)</p>
          <input type="hidden" name="price_breakdown_json" value={JSON.stringify(bd)} />
          {extraRows.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-1">Biaya wajib: {extraRows.map((x) => `${x.label} ${fmtRp(x.val)}`).join(' · ')}</p>
          )}
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
          <input name="highlights" value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder="Menara Eiffel · Seine Cruise · Keukenhof" className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Deskripsi</span>
          <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">3 Alasan pilih kami <span className="font-normal text-slate-400">(khusus tampilan Khasanah — 1 alasan per baris, maks 3)</span></span>
          <textarea name="web_reasons" defaultValue={trip.web_reasons || ''} rows={3} placeholder={"Pembimbing berpengalaman & amanah\nHotel dekat Masjidil Haram\nKuota terbatas, pelayanan lebih personal"} className={inp} /></label>

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
            <textarea name="included" value={included} onChange={(e) => setIncluded(e.target.value)} rows={3} className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Tidak Termasuk (1 per baris)</span>
            <textarea name="excluded" value={excluded} onChange={(e) => setExcluded(e.target.value)} rows={3} className={inp} /></label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">📋 Syarat &amp; Ketentuan</span><span className="block text-[10px] text-slate-400 mb-1">Kosongkan untuk pakai S&amp;K standar Traveling Eropa otomatis.</span>
            <textarea name="syarat_ketentuan" value={syaratKetentuan} onChange={(e) => setSyaratKetentuan(e.target.value)} rows={4} placeholder={'Pembayaran DP mengunci seat\nPelunasan H-45 sebelum keberangkatan\nDP tidak dapat dikembalikan'} className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">🛂 Syarat Visa</span>
            <span className="block text-[10px] text-slate-400 mb-1">Pilih template sesuai destinasi → terisi otomatis (masih bisa diedit). Kosongkan jika tanpa visa.</span>
            <select value="" onChange={(e) => { const t = VISA_TEMPLATES.find((v) => v.key === e.target.value); if (t) setSyaratVisa(t.text); e.target.value=''; }} className={inp + ' mb-1.5 bg-white'}>
              <option value="">— Pilih template syarat visa —</option>
              {VISA_TEMPLATES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
            <textarea name="syarat_visa" value={syaratVisa} onChange={(e) => setSyaratVisa(e.target.value)} rows={6} placeholder={'Pilih template di atas, atau ketik manual...'} className={inp} /></label>
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
