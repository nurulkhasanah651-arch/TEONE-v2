'use client';

// Kelola Etalase: foto header slider + region (judul/ikon/foto/keyword).
import { useState, useRef, useTransition } from 'react';
import { uploadStorefrontImage } from '@/lib/actions/shop-admin';
import { saveHeroImages, saveRegions, savePrivateImages, saveTermsDefault, saveLogo, saveAboutImage } from '@/lib/actions/storefront-settings';

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-lg ${
      msg.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
      {msg.text}
    </div>
  );
}

// Kompres/kecilkan gambar di browser sebelum upload (hindari batas ~4.5MB Vercel).
// SVG dibiarkan. PNG transparan tetap PNG (jaga transparansi logo), foto besar -> JPEG.
async function compressImage(file) {
  try {
    if (!/^image\//.test(file.type)) return file;
    if (file.type === 'image/svg+xml') return file;
    const bmp = await createImageBitmap(file);
    const maxDim = 1920;
    const overDim = Math.max(bmp.width, bmp.height) > 2000;
    const big = file.size > 2.5 * 1024 * 1024;
    if (!overDim && !big) { bmp.close && bmp.close(); return file; }
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const isPng = file.type === 'image/png';
    const type = isPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res) => canvas.toBlob(res, type, isPng ? undefined : 0.82));
    if (!blob) return file;
    const ext = isPng ? 'png' : 'jpg';
    const base = (file.name || 'foto').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.${ext}`, { type });
  } catch { return file; }
}

async function doUpload(file) {
  const f = await compressImage(file);
  const fd = new FormData();
  fd.append('file', f);
  fd.append('tripId', 'etalase');
  const r = await uploadStorefrontImage(fd);
  return r;
}

export default function EtalaseManager({ initialHero, initialRegions, initialPrivate, initialTerms, termsSeed, initialLogo, initialAbout }) {
  const [hero, setHero] = useState(Array.isArray(initialHero) ? initialHero : []);
  const [priv, setPriv] = useState(Array.isArray(initialPrivate) ? initialPrivate : []);
  const [terms, setTerms] = useState((initialTerms && initialTerms.trim()) ? initialTerms : (termsSeed || ''));
  const [regions, setRegions] = useState(Array.isArray(initialRegions) && initialRegions.length ? initialRegions : []);
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const heroInput = useRef(null);
  const privInput = useRef(null);
  const logoInput = useRef(null);
  const [logo, setLogo] = useState((initialLogo || '').trim());
  const aboutInput = useRef(null);
  const [about, setAbout] = useState((initialAbout || '').trim());

  function toast(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleLogoFile(files) {
    const file = files && files[0];
    if (!file || !/^image\//.test(file.type)) return;
    setBusy(true);
    const r = await doUpload(file);
    if (r?.url) {
      setLogo(r.url);
      const sv = await saveLogo(r.url);
      if (sv?.error) toast(sv.error, 'error'); else toast('✓ Logo tersimpan');
    } else if (r?.error) toast(r.error, 'error');
    setBusy(false);
    if (logoInput.current) logoInput.current.value = '';
  }
  async function removeLogo() {
    setLogo('');
    startTransition(async () => { await saveLogo(''); toast('Logo dihapus'); });
  }
  async function handleAboutFile(files) {
    const file = files && files[0];
    if (!file || !/^image\//.test(file.type)) return;
    setBusy(true);
    const r = await doUpload(file);
    if (r?.url) { setAbout(r.url); const sv = await saveAboutImage(r.url); if (sv?.error) toast(sv.error, 'error'); else toast('✓ Foto Tentang tersimpan'); }
    else if (r?.error) toast(r.error, 'error');
    setBusy(false);
    if (aboutInput.current) aboutInput.current.value = '';
  }
  async function removeAbout() {
    setAbout('');
    startTransition(async () => { await saveAboutImage(''); toast('Foto Tentang dihapus'); });
  }

  // ---------- HERO ----------
  async function handleHeroFiles(files) {
    if (!files || !files.length) return;
    setBusy(true);
    const added = [];
    for (const f of Array.from(files).slice(0, 12)) {
      if (!/^image\//.test(f.type)) continue;
      const r = await doUpload(f);
      if (r?.url) added.push(r.url);
      else if (r?.error) toast(r.error, 'error');
    }
    if (added.length) {
      const next = [...hero, ...added].slice(0, 12);
      setHero(next);
      const sv = await saveHeroImages(next);
      if (sv?.error) toast(sv.error, 'error'); else toast(`✓ ${added.length} foto header ditambahkan`);
    }
    setBusy(false);
    if (heroInput.current) heroInput.current.value = '';
  }

  function moveHero(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= hero.length) return;
    const next = hero.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setHero(next);
    startTransition(async () => { await saveHeroImages(next); });
  }
  function removeHero(i) {
    const next = hero.filter((_, idx) => idx !== i);
    setHero(next);
    startTransition(async () => { const r = await saveHeroImages(next); if (!r?.error) toast('Foto header dihapus'); });
  }

  // ---------- PRIVATE TRIP HEADER ----------
  async function handlePrivFiles(files) {
    if (!files || !files.length) return;
    setBusy(true);
    const added = [];
    for (const f of Array.from(files).slice(0, 8)) {
      if (!/^image\//.test(f.type)) continue;
      const r = await doUpload(f);
      if (r?.url) added.push(r.url);
      else if (r?.error) toast(r.error, 'error');
    }
    if (added.length) {
      const next = [...priv, ...added].slice(0, 8);
      setPriv(next);
      const sv = await savePrivateImages(next);
      if (sv?.error) toast(sv.error, 'error'); else toast(`✓ ${added.length} foto private trip ditambahkan`);
    }
    setBusy(false);
    if (privInput.current) privInput.current.value = '';
  }
  function movePriv(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= priv.length) return;
    const next = priv.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setPriv(next);
    startTransition(async () => { await savePrivateImages(next); });
  }
  function removePriv(i) {
    const next = priv.filter((_, idx) => idx !== i);
    setPriv(next);
    startTransition(async () => { const r = await savePrivateImages(next); if (!r?.error) toast('Foto private trip dihapus'); });
  }

  // ---------- REGIONS ----------
  function updateRegion(i, patch) {
    setRegions((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addRegion() {
    setRegions((prev) => [...prev, { key: '', label: '', icon: '🌍', image: '', kw: [] }]);
  }
  function removeRegion(i) {
    setRegions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveRegion(i, dir) {
    const j = i + dir;
    setRegions((prev) => {
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  async function uploadRegionImg(i, file) {
    if (!file || !/^image\//.test(file.type)) return;
    setBusy(true);
    const r = await doUpload(file);
    if (r?.url) {
      const next = regions.map((rg, idx) => idx === i ? { ...rg, image: r.url } : rg);
      setRegions(next);
      // langsung simpan ke DB supaya foto region tidak hilang saat reload
      const payload = next.map((rg) => ({ ...rg, kw: typeof rg.kw === 'string' ? rg.kw : (Array.isArray(rg.kw) ? rg.kw.join(', ') : '') }));
      const sv = await saveRegions(payload);
      if (sv?.error) toast(sv.error, 'error'); else toast('✓ Foto region tersimpan');
    } else if (r?.error) toast(r.error, 'error');
    setBusy(false);
  }
  function saveAllRegions() {
    startTransition(async () => {
      const payload = regions.map((r) => ({
        ...r,
        kw: typeof r.kw === 'string' ? r.kw : (Array.isArray(r.kw) ? r.kw.join(', ') : ''),
      }));
      const sv = await saveRegions(payload);
      if (sv?.error) toast(sv.error, 'error'); else toast(`✓ ${sv.count} region disimpan`);
    });
  }

  function saveTerms() {
    startTransition(async () => {
      const sv = await saveTermsDefault(terms);
      if (sv?.error) toast(sv.error, 'error'); else toast('✓ Syarat & Ketentuan disimpan');
    });
  }
  function resetTermsToStandard() {
    setTerms(termsSeed || '');
  }

  return (
    <div className="space-y-8">
      <Toast msg={msg} />

      {/* ====== LOGO ====== */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">🏷️ Logo Brand</h2>
          {busy && <span className="text-xs text-slate-400">⏳ memproses...</span>}
        </div>
        <p className="text-xs text-slate-500 mb-4">Logo tampil di header & footer web etalase. Disarankan PNG transparan atau SVG.</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-40 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
            {logo ? <img src={logo} alt="logo" className="max-w-full max-h-full object-contain" /> : <span className="text-slate-400 text-xs">belum ada logo</span>}
          </div>
          <div className="flex gap-2">
            <input ref={logoInput} type="file" accept="image/*" className="hidden" id="logo-upload" onChange={(e) => handleLogoFile(e.target.files)} />
            <label htmlFor="logo-upload" className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer ${busy ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>📤 Upload Logo</label>
            {logo && <button type="button" onClick={removeLogo} className="px-3 py-2 rounded-lg text-sm font-bold border border-red-300 text-red-600 hover:bg-red-50">Hapus</button>}
          </div>
        </div>
      </section>

      {/* ====== TENTANG ====== */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">📷 Foto Section “Tentang”</h2>
          {busy && <span className="text-xs text-slate-400">⏳ memproses...</span>}
        </div>
        <p className="text-xs text-slate-500 mb-4">Foto di samping tulisan “Tentang Traveling Eropa Group” di homepage. Disarankan landscape (4:3).</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-44 h-32 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
            {about ? <img src={about} alt="tentang" className="w-full h-full object-cover" /> : <span className="text-slate-400 text-xs">belum ada foto</span>}
          </div>
          <div className="flex gap-2">
            <input ref={aboutInput} type="file" accept="image/*" className="hidden" id="about-upload" onChange={(e) => handleAboutFile(e.target.files)} />
            <label htmlFor="about-upload" className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer ${busy ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>📤 Upload Foto</label>
            {about && <button type="button" onClick={removeAbout} className="px-3 py-2 rounded-lg text-sm font-bold border border-red-300 text-red-600 hover:bg-red-50">Hapus</button>}
          </div>
        </div>
      </section>

      {/* ====== HEADER SLIDER ====== */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">📸 Foto Header (Slider)</h2>
          {busy && <span className="text-xs text-slate-400">⏳ memproses...</span>}
        </div>
        <p className="text-xs text-slate-500 mb-4">Foto besar bergantian di atas homepage. Disarankan landscape (lebar), kualitas tinggi. Maks 12 foto.</p>

        {hero.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">
            Belum ada foto header. Upload untuk mengganti foto bawaan.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {hero.map((url, i) => (
              <div key={url + i} className="relative group rounded-xl overflow-hidden aspect-video border border-slate-200">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">#{i + 1}</div>
                <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveHero(i, -1)} disabled={i === 0} className="w-6 h-6 rounded bg-white/90 text-slate-700 text-xs disabled:opacity-30">←</button>
                    <button type="button" onClick={() => moveHero(i, 1)} disabled={i === hero.length - 1} className="w-6 h-6 rounded bg-white/90 text-slate-700 text-xs disabled:opacity-30">→</button>
                  </div>
                  <button type="button" onClick={() => removeHero(i)} className="w-6 h-6 rounded bg-red-500 text-white text-xs">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input ref={heroInput} type="file" accept="image/*" multiple className="hidden" id="hero-upload"
          onChange={(e) => handleHeroFiles(e.target.files)} />
        <label htmlFor="hero-upload" className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer ${busy ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
          📤 Upload Foto Header
        </label>
      </section>

      {/* ====== PRIVATE TRIP HEADER ====== */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">✈ Foto Header “Request Private Trip”</h2>
          {busy && <span className="text-xs text-slate-400">⏳ memproses...</span>}
        </div>
        <p className="text-xs text-slate-500 mb-4">Foto latar di bagian atas halaman Request Private Trip (nuansa biru). Bisa lebih dari 1 (bergantian). Disarankan landscape.</p>

        {priv.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">
            Belum ada foto. Tanpa foto, header tampil gradient biru polos.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {priv.map((url, i) => (
              <div key={url + i} className="relative group rounded-xl overflow-hidden aspect-video border border-slate-200">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">#{i + 1}</div>
                <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => movePriv(i, -1)} disabled={i === 0} className="w-6 h-6 rounded bg-white/90 text-slate-700 text-xs disabled:opacity-30">←</button>
                    <button type="button" onClick={() => movePriv(i, 1)} disabled={i === priv.length - 1} className="w-6 h-6 rounded bg-white/90 text-slate-700 text-xs disabled:opacity-30">→</button>
                  </div>
                  <button type="button" onClick={() => removePriv(i)} className="w-6 h-6 rounded bg-red-500 text-white text-xs">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input ref={privInput} type="file" accept="image/*" multiple className="hidden" id="priv-upload"
          onChange={(e) => handlePrivFiles(e.target.files)} />
        <label htmlFor="priv-upload" className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer ${busy ? 'bg-slate-200 text-slate-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          📤 Upload Foto Private Trip
        </label>
      </section>

      {/* ====== REGIONS ====== */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-900">🗺 Region (Judul + Foto)</h2>
          <button type="button" onClick={addRegion} className="text-sm font-bold text-emerald-600 hover:text-emerald-700">+ Tambah Region</button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Kategori destinasi di homepage. <b>Keyword</b> dipakai untuk mengelompokkan trip otomatis (pisahkan dengan koma, mis: <i>korea, jepang, asia</i>).</p>

        <div className="space-y-3">
          {regions.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-slate-400 text-sm">
              Belum ada region. Klik “+ Tambah Region”.
            </div>
          )}
          {regions.map((r, i) => {
            const kwStr = typeof r.kw === 'string' ? r.kw : (Array.isArray(r.kw) ? r.kw.join(', ') : '');
            return (
              <div key={i} className="rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row gap-3">
                {/* foto */}
                <div className="sm:w-32 shrink-0">
                  <div className="relative rounded-lg overflow-hidden aspect-[3/4] bg-slate-100 border border-slate-200">
                    {r.image
                      ? <img src={r.image} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl">{r.icon || '🌍'}</div>}
                  </div>
                  <input type="file" accept="image/*" className="hidden" id={`region-img-${i}`}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRegionImg(i, f); e.target.value = ''; }} />
                  <label htmlFor={`region-img-${i}`} className="mt-1.5 block text-center text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded py-1 cursor-pointer">
                    {r.image ? '↻ Ganti Foto' : '📤 Upload Foto'}
                  </label>
                </div>
                {/* fields */}
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input value={r.icon || ''} onChange={(e) => updateRegion(i, { icon: e.target.value })} placeholder="🌍" maxLength={4}
                      className="w-14 px-2 py-1.5 border border-slate-300 rounded text-center text-lg" />
                    <input value={r.label || ''} onChange={(e) => updateRegion(i, { label: e.target.value })} placeholder="Nama region (mis: Asia)"
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm font-semibold" />
                  </div>
                  <input value={kwStr} onChange={(e) => updateRegion(i, { kw: e.target.value })} placeholder="Keyword: korea, jepang, asia, vietnam"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs" />
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => moveRegion(i, -1)} disabled={i === 0} className="px-2 py-1 text-xs rounded bg-slate-100 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => moveRegion(i, 1)} disabled={i === regions.length - 1} className="px-2 py-1 text-xs rounded bg-slate-100 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => removeRegion(i)} className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100">🗑 Hapus</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={saveAllRegions} disabled={pending}
          className="mt-4 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold">
          {pending ? '⏳ Menyimpan...' : '💾 Simpan Semua Region'}
        </button>
      </section>

      {/* ====== SYARAT & KETENTUAN DEFAULT ====== */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-slate-900">📋 Syarat &amp; Ketentuan (Default Web)</h2>
          <button type="button" onClick={resetTermsToStandard} className="text-xs font-semibold text-slate-500 hover:text-slate-700">↺ Kembalikan ke teks standar</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">Teks ini otomatis tampil di halaman detail trip bila S&amp;K khusus per trip dikosongkan. Edit sekali di sini, berlaku untuk semua trip. Satu poin per baris; baris diakhiri titik dua (:) atau HURUF BESAR jadi judul section.</p>
        <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={16}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono leading-relaxed focus:ring-1 focus:ring-emerald-500 outline-none"
          placeholder="PEMESANAN & PELUNASAN:" />
        <button type="button" onClick={saveTerms} disabled={pending}
          className="mt-3 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold">
          {pending ? '⏳ Menyimpan...' : '💾 Simpan Syarat & Ketentuan'}
        </button>
      </section>
    </div>
  );
}
