// Round 163: Quotation New — support ?from_template=ID
// Path: app/(app)/quotations/new/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createQuotation } from '@/lib/actions/quotations';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  { value: 'europe',        label: '🗼 Eropa' },
  { value: 'asia',          label: '🗾 Asia (Jepang, Korea, dll)' },
  { value: 'umroh',         label: '🕋 Umroh & Religi' },
  { value: 'domestic',      label: '🏝 Domestik Indonesia' },
  { value: 'international', label: '✈ Internasional Lain' },
];

export default async function NewQuotationPage({ searchParams }) {
  const sp = await searchParams;
  const fromTemplateId = sp?.from_template || '';

  let templateInfo = null;
  if (fromTemplateId) {
    const supabase = createClient();
    const { data } = await supabase
      .from('trip_quotations')
      .select('id, template_name, title, category, duration_days, destinations')
      .eq('id', fromTemplateId)
      .eq('is_template', true)
      .maybeSingle();
    templateInfo = data;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/quotations" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke Penawaran</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">+ Penawaran Baru</h1>
        <p className="mt-1 text-slate-600">
          {templateInfo
            ? <>Bikin dari template: <strong>{templateInfo.template_name}</strong>. Edit info di bawah.</>
            : 'Step 1: Isi info dasar. Step 2: AI auto-generate itinerary & deskripsi.'}
        </p>
      </div>

      {templateInfo && (
        <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-4">
          <p className="font-bold text-purple-800 text-sm mb-1">📚 Template Source</p>
          <p className="text-xs text-purple-700">
            <strong>{templateInfo.template_name}</strong> · {templateInfo.duration_days} hari · {templateInfo.destinations || '-'}
          </p>
          <p className="text-[11px] text-purple-600 mt-1">
            Semua data template akan di-copy. Isi judul + tanggal baru di form di bawah.
          </p>
        </div>
      )}

      <form action={createQuotation} className="bg-white rounded-xl border border-slate-200 shadow-card p-6 space-y-4">
        {fromTemplateId && <input type="hidden" name="from_template_id" value={fromTemplateId} />}

        <Field label="Judul Penawaran" required>
          <input type="text" name="title" required defaultValue={templateInfo ? `${templateInfo.title} ${new Date().getFullYear()}` : ''} placeholder="SCENIC AUTUMN CANADA" className={inputCls} />
        </Field>

        <Field label="Destinasi">
          <input type="text" name="destinations" defaultValue={templateInfo?.destinations || ''} placeholder="Paris, Roma, Lucerne, Milan, Venice" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategori" required>
            <select name="category" defaultValue={templateInfo?.category || 'europe'} required className={inputCls}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Durasi (hari)" required>
            <input type="number" name="duration_days" min="1" max="60" defaultValue={templateInfo?.duration_days || 9} required className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tgl Keberangkatan">
            <input type="date" name="departure_date" className={inputCls} />
          </Field>
          <Field label="Tgl Kepulangan">
            <input type="date" name="return_date" className={inputCls} />
          </Field>
        </div>

        <Field label="Estimasi Peserta">
          <input type="number" name="pax_count" min="0" defaultValue="0" className={inputCls} />
        </Field>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          {templateInfo
            ? <>💡 <strong>Setelah simpan:</strong> Semua data template akan di-copy, kamu tinggal edit detail spesifik (tanggal, harga, dll)</>
            : <>💡 <strong>Setelah simpan:</strong> Klik tombol <b>"✨ AI Generate"</b> untuk auto-bikin itinerary, highlights, inclusions, dan deskripsi marketing.</>}
        </div>

        <div className="flex gap-3 justify-end pt-2 border-t border-slate-200">
          <Link href="/quotations" className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Batal</Link>
          <button type="submit" className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded shadow-card">
            Lanjut ke Edit →
          </button>
        </div>
      </form>

      <div className="text-center">
        <Link href="/quotations/templates" className="text-xs text-brand-600 hover:underline font-semibold">
          📚 Atau pilih dari Template Library →
        </Link>
      </div>
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
