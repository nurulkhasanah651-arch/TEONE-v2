'use client';

// Round 163: QuotationForm — + Image Upload + Save as Template
// Path: components/quotations/QuotationForm.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateQuotation, generateAIContent, generateVisaRequirements,
  togglePublish, deleteQuotation, duplicateQuotation, saveAsTemplate,
} from '@/lib/actions/quotations';
import ImageUploadInput from '@/components/quotations/ImageUploadInput';

function fmtIDR(v) {
  if (v == null || v === '') return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseNum(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}

const CATEGORIES = [
  { value: 'europe',        label: '🗼 Eropa' },
  { value: 'asia',          label: '🗾 Asia' },
  { value: 'umroh',         label: '🕋 Umroh' },
  { value: 'domestic',      label: '🏝 Domestik' },
  { value: 'international', label: '✈ Internasional' },
];

const DEFAULT_ROOM_TYPES = [
  { label: 'QUAD ROOM',         price: 0, note: 'per pax (sekamar 4 orang)' },
  { label: 'TRIPLE ROOM',       price: 0, note: 'per pax (sekamar 3 orang)' },
  { label: 'DOUBLE ROOM',       price: 0, note: 'per pax (sekamar 2 orang)' },
  { label: 'SINGLE ROOM',       price: 0, note: 'tidur sekamar sendiri' },
  { label: 'CHILD NO BED',      price: 0, note: 'anak 2-7 tahun, tanpa bed' },
  { label: 'INFANT',            price: 0, note: 'bayi 0-23 bulan' },
  { label: 'LAND TOUR QUAD',    price: 0, note: 'paket tour tanpa tiket pesawat PP' },
];

const DEFAULT_PAYMENT_SCHEDULE = [
  { label: 'Down Payment & Book Seat', date: 'Saat mendaftar', amount: 3500000 },
  { label: 'Cicilan 1', date: '', amount: 10000000 },
  { label: 'Cicilan 2', date: '', amount: 7000000 },
  { label: 'Cicilan 3', date: '', amount: 7000000 },
  { label: 'PELUNASAN', date: '', amount: 'PELUNASAN' },
];

export default function QuotationForm({ quotation }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aiLoading, setAiLoading] = useState(false);
  const [visaAiLoading, setVisaAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    title: quotation.title || '',
    subtitle: quotation.subtitle || '',
    tagline: quotation.tagline || '',
    destinations: quotation.destinations || '',
    duration_days: quotation.duration_days || 9,
    departure_date: quotation.departure_date || '',
    return_date: quotation.return_date || '',
    category: quotation.category || 'international',
    pax_count: quotation.pax_count || 0,
    dp_amount: quotation.dp_amount || 3500000,
    payment_term: quotation.payment_term || 'DP saat mendaftar, kemudian cicilan terjadwal sampai pelunasan H-30 sebelum keberangkatan',
    hero_image_url: quotation.hero_image_url || '',
    brand_color: quotation.brand_color || '#1e3a8a',
    agency_logo_url: quotation.agency_logo_url || '',
    description: quotation.description || '',
    notes: quotation.notes || '',
    bank_info: quotation.bank_info || 'Bank BCA 2063535001 a.n. PT. Khasanah Global Internasional',
    contact_name: quotation.contact_name || '',
    contact_wa: quotation.contact_wa || '0822-1099-1200',
    contact_email: quotation.contact_email || '',
    show_visa_requirements: quotation.show_visa_requirements !== false,
    show_terms: quotation.show_terms !== false,
  });

  const [priceOptions, setPriceOptions] = useState(quotation.price_options?.length > 0 ? quotation.price_options : DEFAULT_ROOM_TYPES);
  const [highlights, setHighlights] = useState(quotation.highlights || []);
  const [itinerary, setItinerary] = useState(quotation.itinerary || []);
  const [inclusions, setInclusions] = useState(quotation.inclusions || []);
  const [exclusions, setExclusions] = useState(quotation.exclusions || []);
  const [paymentSchedule, setPaymentSchedule] = useState(quotation.payment_schedule?.length > 0 ? quotation.payment_schedule : DEFAULT_PAYMENT_SCHEDULE);
  const [visaReqs, setVisaReqs] = useState(quotation.visa_requirements || []);

  function upd(k, v) { setForm((s) => ({ ...s, [k]: v })); }

  async function handleAIGenerate() {
    if (!form.destinations && !form.title) { setError('Isi destinasi atau judul dulu'); return; }
    setError(''); setSuccess(''); setAiLoading(true);
    const priceRange = priceOptions.filter((p) => p.price > 0).map((p) => `${p.label}: Rp ${Number(p.price).toLocaleString('id-ID')}`).join(', ');
    const result = await generateAIContent({
      title: form.title, destinations: form.destinations, duration_days: form.duration_days,
      departure_date: form.departure_date, category: form.category, pax_count: form.pax_count, price_range: priceRange,
    });
    setAiLoading(false);
    if (result?.error) { setError(result.error); return; }
    const c = result.content;
    if (c.tagline) upd('tagline', c.tagline);
    if (c.description) upd('description', c.description);
    if (c.highlights?.length) setHighlights(c.highlights);
    if (c.itinerary?.length) setItinerary(c.itinerary);
    if (c.inclusions?.length) setInclusions(c.inclusions);
    if (c.exclusions?.length) setExclusions(c.exclusions);
    if (c.visa_requirements?.length) setVisaReqs(c.visa_requirements);
    setSuccess(`✨ AI berhasil generate! ${c.itinerary?.length || 0} hari + ${c.visa_requirements?.length || 0} syarat visa.`);
  }

  async function handleAIVisaOnly() {
    if (!form.destinations) { setError('Isi destinasi dulu'); return; }
    setError(''); setSuccess(''); setVisaAiLoading(true);
    const result = await generateVisaRequirements({ destinations: form.destinations, category: form.category });
    setVisaAiLoading(false);
    if (result?.error) { setError(result.error); return; }
    if (result.visa_requirements?.length > 0) {
      setVisaReqs(result.visa_requirements);
      setSuccess(`✨ ${result.visa_requirements.length} syarat visa di-generate!`);
    } else {
      setVisaReqs([]);
      setSuccess('AI menyatakan destinasi ini FREE VISA untuk WNI');
    }
  }

  async function handleSave(formData) {
    formData.set('price_options', JSON.stringify(priceOptions));
    formData.set('highlights', JSON.stringify(highlights));
    formData.set('itinerary', JSON.stringify(itinerary));
    formData.set('inclusions', JSON.stringify(inclusions));
    formData.set('exclusions', JSON.stringify(exclusions));
    formData.set('payment_schedule', JSON.stringify(paymentSchedule));
    formData.set('visa_requirements', JSON.stringify(visaReqs));
    formData.set('hero_image_url', form.hero_image_url);
    formData.set('agency_logo_url', form.agency_logo_url);
    startTransition(async () => {
      const result = await updateQuotation(quotation.id, formData);
      if (result?.error) { setError(result.error); setSuccess(''); }
      else { setSuccess('✓ Tersimpan'); setError(''); router.refresh(); }
    });
  }

  async function handleSaveAsTemplate() {
    const name = prompt('Nama template (misal: "Eropa Klasik 9 Hari"):');
    if (!name) return;
    const desc = prompt('Deskripsi template (opsional):');
    startTransition(async () => {
      const r = await saveAsTemplate(quotation.id, name.trim(), desc?.trim() || '');
      if (r?.error) setError(r.error);
      else setSuccess(`✅ Template "${name}" berhasil di-save! Buka /quotations/templates untuk lihat.`);
    });
  }

  async function handleTogglePublish() {
    startTransition(async () => {
      const r = await togglePublish(quotation.id, !quotation.is_published);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  async function handleDelete() {
    if (!confirm('Hapus penawaran ini?')) return;
    startTransition(async () => {
      const r = await deleteQuotation(quotation.id);
      if (r?.error) setError(r.error);
      else router.push('/quotations');
    });
  }

  async function handleDuplicate() {
    startTransition(async () => { await duplicateQuotation(quotation.id); });
  }

  const publicUrl = quotation.public_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/q/${quotation.public_token}`
    : '';

  return (
    <>
      {/* Status bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs">
          {quotation.is_published
            ? <span className="px-2 py-1 rounded bg-green-100 text-green-800 font-bold">🟢 PUBLISHED</span>
            : <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 font-bold">⚪ DRAFT</span>}
          {quotation.view_count > 0 && <span className="text-slate-500">👁 {quotation.view_count} views</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={handleTogglePublish} disabled={pending} className={`px-3 py-1.5 text-xs font-semibold rounded ${quotation.is_published ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
            {quotation.is_published ? '⏸ Unpublish' : '🚀 Publish'}
          </button>
          <button type="button" onClick={handleSaveAsTemplate} disabled={pending} className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-semibold rounded">📚 Save as Template</button>
          <button type="button" onClick={handleDuplicate} disabled={pending} className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-semibold rounded">📋 Duplicate</button>
          <button type="button" onClick={handleDelete} disabled={pending} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded">🗑 Hapus</button>
        </div>
      </div>

      {quotation.is_published && publicUrl && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 text-xs">
          <p className="font-bold text-green-800 mb-1">🔗 Public Link:</p>
          <div className="flex items-center gap-2">
            <input type="text" readOnly value={publicUrl} className="flex-1 px-2 py-1 bg-white border border-green-200 rounded text-xs font-mono" onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => { navigator.clipboard.writeText(publicUrl); setSuccess('Link copied!'); }} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded">📋 Copy</button>
          </div>
        </div>
      )}

      <form action={handleSave} className="space-y-4">
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-bold text-purple-800 text-sm">✨ AI Generate Lengkap</p>
              <p className="text-[11px] text-purple-700 mt-0.5">AI bikin: tagline, description, itinerary {form.duration_days} hari, highlights, inclusions, exclusions, syarat visa</p>
            </div>
            <button type="button" onClick={handleAIGenerate} disabled={aiLoading || pending} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
              {aiLoading ? '⏳ Generating...' : '✨ AI Generate Semua'}
            </button>
          </div>
        </div>

        <Section title="📋 Info Dasar">
          <Field label="Judul" required>
            <input type="text" name="title" required value={form.title} onChange={(e) => upd('title', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Subtitle">
            <input type="text" name="subtitle" value={form.subtitle} onChange={(e) => upd('subtitle', e.target.value)} placeholder="FREE VISA CANADA (HOLDING VISA USA)" className={inputCls} />
          </Field>
          <Field label="Tagline">
            <input type="text" name="tagline" value={form.tagline} onChange={(e) => upd('tagline', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Destinasi">
            <input type="text" name="destinations" value={form.destinations} onChange={(e) => upd('destinations', e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Kategori"><select name="category" value={form.category} onChange={(e) => upd('category', e.target.value)} className={inputCls}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
            <Field label="Durasi (hari)"><input type="number" name="duration_days" min="1" max="60" value={form.duration_days} onChange={(e) => upd('duration_days', parseInt(e.target.value) || 1)} className={inputCls} /></Field>
            <Field label="Tgl Berangkat"><input type="date" name="departure_date" value={form.departure_date} onChange={(e) => upd('departure_date', e.target.value)} className={inputCls} /></Field>
            <Field label="Tgl Pulang"><input type="date" name="return_date" value={form.return_date} onChange={(e) => upd('return_date', e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Description">
            <textarea name="description" rows="4" value={form.description} onChange={(e) => upd('description', e.target.value)} className={inputCls + ' resize-y'} />
          </Field>
        </Section>

        {/* ===== VISUAL — pakai ImageUpload sekarang ===== */}
        <Section title="🎨 Visual & Branding">
          <Field label="Hero Image" hint="Upload langsung dari laptop, atau paste URL gambar publik">
            <ImageUploadInput value={form.hero_image_url} onChange={(url) => upd('hero_image_url', url)} label="Upload Hero Image" maxSizeMB={10} />
          </Field>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Brand Color">
              <input type="color" name="brand_color" value={form.brand_color} onChange={(e) => upd('brand_color', e.target.value)} className="w-full h-10 border border-slate-300 rounded cursor-pointer" />
            </Field>
            <Field label="Logo Agency">
              <ImageUploadInput value={form.agency_logo_url} onChange={(url) => upd('agency_logo_url', url)} label="Upload Logo" maxSizeMB={2} />
            </Field>
          </div>
        </Section>

        {/* ===== HARGA ===== */}
        <Section title="💵 Harga per Tipe Kamar">
          {priceOptions.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4"><span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Tipe</span>
                <input type="text" value={p.label || ''} onChange={(e) => { const next = [...priceOptions]; next[i] = { ...p, label: e.target.value }; setPriceOptions(next); }} className={miniInput} />
              </div>
              <div className="col-span-3"><span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Harga (Rp)</span>
                <input type="text" inputMode="numeric" value={fmtIDR(p.price)} onChange={(e) => { const next = [...priceOptions]; next[i] = { ...p, price: parseNum(e.target.value) }; setPriceOptions(next); }} placeholder="37.900.000" className={miniInput} />
              </div>
              <div className="col-span-4"><span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Note</span>
                <input type="text" value={p.note || ''} onChange={(e) => { const next = [...priceOptions]; next[i] = { ...p, note: e.target.value }; setPriceOptions(next); }} className={miniInput} />
              </div>
              <div className="col-span-1"><button type="button" onClick={() => setPriceOptions(priceOptions.filter((_, idx) => idx !== i))} className="w-full px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded">✕</button></div>
            </div>
          ))}
          <button type="button" onClick={() => setPriceOptions([...priceOptions, { label: '', price: 0, note: '' }])} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded">+ Tambah Opsi</button>
          <div className="mt-3"><Field label="DP (Rp)"><input type="text" inputMode="numeric" name="dp_amount" value={fmtIDR(form.dp_amount)} onChange={(e) => upd('dp_amount', parseNum(e.target.value))} className={inputCls} /></Field></div>
        </Section>

        {/* ===== CICILAN ===== */}
        <Section title="💳 Jadwal Pembayaran">
          {paymentSchedule.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4"><span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Label</span>
                <input type="text" value={p.label || ''} onChange={(e) => { const next = [...paymentSchedule]; next[i] = { ...p, label: e.target.value }; setPaymentSchedule(next); }} className={miniInput} />
              </div>
              <div className="col-span-4"><span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Tanggal</span>
                <input type="text" value={p.date || ''} onChange={(e) => { const next = [...paymentSchedule]; next[i] = { ...p, date: e.target.value }; setPaymentSchedule(next); }} className={miniInput} />
              </div>
              <div className="col-span-3"><span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Jumlah</span>
                <input type="text" value={typeof p.amount === 'number' ? fmtIDR(p.amount) : (p.amount || '')} onChange={(e) => {
                  const v = e.target.value; const numericVal = parseNum(v); const next = [...paymentSchedule];
                  if (v.toUpperCase().includes('PELUNAS') || (numericVal === '' && v)) { next[i] = { ...p, amount: v }; }
                  else { next[i] = { ...p, amount: numericVal === '' ? '' : parseInt(numericVal) }; }
                  setPaymentSchedule(next);
                }} className={miniInput} />
              </div>
              <div className="col-span-1"><button type="button" onClick={() => setPaymentSchedule(paymentSchedule.filter((_, idx) => idx !== i))} className="w-full px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded">✕</button></div>
            </div>
          ))}
          <button type="button" onClick={() => setPaymentSchedule([...paymentSchedule, { label: '', date: '', amount: 0 }])} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded">+ Tambah Cicilan</button>
          <div className="mt-3"><Field label="Bank Info"><input type="text" name="bank_info" value={form.bank_info} onChange={(e) => upd('bank_info', e.target.value)} className={inputCls} /></Field></div>
        </Section>

        {/* ===== HIGHLIGHTS ===== */}
        <Section title="⭐ Highlights">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" value={h.icon || ''} onChange={(e) => { const next = [...highlights]; next[i] = { ...h, icon: e.target.value }; setHighlights(next); }} className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-lg" />
              <input type="text" value={h.text || ''} onChange={(e) => { const next = [...highlights]; next[i] = { ...h, text: e.target.value }; setHighlights(next); }} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" />
              <button type="button" onClick={() => setHighlights(highlights.filter((_, idx) => idx !== i))} className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setHighlights([...highlights, { icon: '⭐', text: '' }])} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded">+ Tambah</button>
        </Section>

        {/* ===== ITINERARY ===== */}
        <Section title={`🗓 Itinerary (${itinerary.length} hari)`}>
          {itinerary.map((it, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <span className="px-2 py-1 bg-brand-100 text-brand-700 text-xs font-bold rounded">Hari {it.day || i + 1}</span>
                  <input type="text" value={it.title || ''} onChange={(e) => { const next = [...itinerary]; next[i] = { ...it, title: e.target.value }; setItinerary(next); }} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm font-bold" />
                </div>
                <button type="button" onClick={() => setItinerary(itinerary.filter((_, idx) => idx !== i))} className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded">✕</button>
              </div>
              <div className="pl-4 space-y-1">
                {(it.activities || []).map((act, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <span className="text-slate-400">•</span>
                    <input type="text" value={act} onChange={(e) => { const next = [...itinerary]; const acts = [...(it.activities || [])]; acts[j] = e.target.value; next[i] = { ...it, activities: acts }; setItinerary(next); }} className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs" />
                    <button type="button" onClick={() => { const next = [...itinerary]; const acts = (it.activities || []).filter((_, idx) => idx !== j); next[i] = { ...it, activities: acts }; setItinerary(next); }} className="text-xs text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => { const next = [...itinerary]; const acts = [...(it.activities || []), '']; next[i] = { ...it, activities: acts }; setItinerary(next); }} className="text-xs text-brand-600 hover:underline">+ Tambah aktivitas</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setItinerary([...itinerary, { day: itinerary.length + 1, title: '', activities: [''] }])} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded">+ Tambah Hari</button>
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="✅ Termasuk">
            {inclusions.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <input type="text" value={it} onChange={(e) => { const next = [...inclusions]; next[i] = e.target.value; setInclusions(next); }} className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs" />
                <button type="button" onClick={() => setInclusions(inclusions.filter((_, idx) => idx !== i))} className="text-xs text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setInclusions([...inclusions, ''])} className="w-full py-1.5 border-2 border-dashed border-green-300 hover:border-green-500 text-green-600 text-xs font-semibold rounded">+ Tambah</button>
          </Section>
          <Section title="❌ Tidak Termasuk">
            {exclusions.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-red-600">✗</span>
                <input type="text" value={it} onChange={(e) => { const next = [...exclusions]; next[i] = e.target.value; setExclusions(next); }} className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs" />
                <button type="button" onClick={() => setExclusions(exclusions.filter((_, idx) => idx !== i))} className="text-xs text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setExclusions([...exclusions, ''])} className="w-full py-1.5 border-2 border-dashed border-red-300 hover:border-red-500 text-red-600 text-xs font-semibold rounded">+ Tambah</button>
          </Section>
        </div>

        <Section title="🛂 Syarat Visa (AI)">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.show_visa_requirements} onChange={(e) => upd('show_visa_requirements', e.target.checked)} />
              <span>Tampilkan di preview</span>
            </label>
            <button type="button" onClick={handleAIVisaOnly} disabled={visaAiLoading || pending} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-card">
              {visaAiLoading ? '⏳' : '✨'} AI Generate Visa
            </button>
          </div>
          {visaReqs.length === 0 ? (
            <div className="text-center p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <p className="text-sm text-slate-600">Belum ada syarat visa.</p>
              <p className="text-[11px] text-slate-500 mt-1">Klik "AI Generate Visa" untuk auto-fill</p>
            </div>
          ) : visaReqs.map((it, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-slate-500 text-xs mt-1">{i + 1}.</span>
              <textarea value={it} onChange={(e) => { const next = [...visaReqs]; next[i] = e.target.value; setVisaReqs(next); }} rows="2" className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs resize-y" />
              <button type="button" onClick={() => setVisaReqs(visaReqs.filter((_, idx) => idx !== i))} className="text-xs text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded mt-1">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setVisaReqs([...visaReqs, ''])} className="w-full py-1.5 border-2 border-dashed border-blue-300 hover:border-blue-500 text-blue-600 text-xs font-semibold rounded">+ Tambah Manual</button>
        </Section>

        <Section title="📋 S&K Standard">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.show_terms} onChange={(e) => upd('show_terms', e.target.checked)} />
            <span>Tampilkan S&K 8 pasal di preview</span>
          </label>
        </Section>

        <Section title="📞 Kontak">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Nama CS"><input type="text" name="contact_name" value={form.contact_name} onChange={(e) => upd('contact_name', e.target.value)} className={inputCls} /></Field>
            <Field label="No. WhatsApp"><input type="text" name="contact_wa" value={form.contact_wa} onChange={(e) => upd('contact_wa', e.target.value)} className={inputCls} /></Field>
            <Field label="Email"><input type="email" name="contact_email" value={form.contact_email} onChange={(e) => upd('contact_email', e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Catatan"><textarea name="notes" rows="3" value={form.notes} onChange={(e) => upd('notes', e.target.value)} className={inputCls + ' resize-y'} /></Field>
        </Section>

        <input type="hidden" name="title" value={form.title} />
        <input type="hidden" name="show_visa_requirements" value={form.show_visa_requirements ? '1' : '0'} />
        <input type="hidden" name="show_terms" value={form.show_terms ? '1' : '0'} />

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 whitespace-pre-wrap">{error}</div>}
        {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

        <div className="sticky bottom-0 -mx-2 px-2 py-3 bg-white/90 backdrop-blur border-t border-slate-200 flex items-center justify-end gap-2">
          <button type="submit" disabled={pending} className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
            {pending ? '⏳ Menyimpan...' : '💾 Simpan'}
          </button>
        </div>
      </form>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[11px] text-slate-500 block mb-1.5">{hint}</span>}
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
const miniInput = 'w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
