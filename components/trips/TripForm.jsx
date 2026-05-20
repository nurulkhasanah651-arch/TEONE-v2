'use client';

// Shared trip form — used by both /trips/new and /trips/[id]/edit
// Submits to a server action passed via props

import { useState } from 'react';

export default function TripForm({ initial = {}, onSubmit, submitLabel = 'Simpan Trip' }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await onSubmit(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
    // Success → server action redirects; nothing more to do here
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {/* Basic info */}
      <Section title="Info Dasar">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Kode Trip" hint="Contoh: KARANG-2026, #001">
            <input name="kode_trip" defaultValue={initial.kode_trip || ''} className={inputCls} placeholder="(opsional)" />
          </Field>
          <Field label="Nama Trip" required>
            <input name="name" defaultValue={initial.name || ''} required className={inputCls} placeholder="Contoh: KARANG 14 Hari" />
          </Field>
          <Field label="Tujuan">
            <input name="destination" defaultValue={initial.destination || ''} className={inputCls} placeholder="Eropa, Jepang, dll" />
          </Field>
          <Field label="Tipe Tiket">
            <select name="ticket" defaultValue={initial.ticket || 'FIT'} className={inputCls}>
              <option value="FIT">FIT</option>
              <option value="GROUP">GROUP</option>
              <option value="PRIVATE">PRIVATE</option>
              <option value="CHARTER">CHARTER</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Dates */}
      <Section title="Tanggal">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Keberangkatan">
            <input type="date" name="departure" defaultValue={initial.departure || ''} className={inputCls} />
          </Field>
          <Field label="Kepulangan">
            <input type="date" name="arrival" defaultValue={initial.arrival || ''} className={inputCls} />
          </Field>
          <Field label="Deadline Tutup Booking">
            <input type="date" name="deadline_close" defaultValue={initial.deadline_close || ''} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Capacity & Price */}
      <Section title="Kapasitas & Harga">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Quota (jumlah seat)">
            <input type="number" name="quota" defaultValue={initial.quota || ''} min="0" className={inputCls} placeholder="20" />
          </Field>
          <Field label="Harga per Pax (IDR)">
            <input type="number" name="price" defaultValue={initial.price || ''} min="0" className={inputCls} placeholder="50000000" />
          </Field>
        </div>
      </Section>

      {/* Status & People */}
      <Section title="Status & Tim">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Status">
            <select name="status" defaultValue={initial.status || 'prepare to sell'} className={inputCls}>
              <option value="prepare to sell">Prepare to Sell</option>
              <option value="open selling">Open Selling</option>
              <option value="closed selling">Closed Selling</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="PIC (CS Officer)">
            <input name="pic" defaultValue={initial.pic || ''} className={inputCls} placeholder="Nama PIC" />
          </Field>
          <Field label="Tour Leader" hint="Bisa diisi belakangan">
            <input name="tl_name" defaultValue={initial.tl_name || ''} className={inputCls} placeholder="Nama TL" />
          </Field>
        </div>
      </Section>

      {/* Notes */}
      <Section title="Catatan">
        <Field label="Catatan (opsional)">
          <textarea name="notes" defaultValue={initial.notes || ''} rows="3" className={inputCls + ' resize-none'} placeholder="Hal penting tentang trip ini..." />
        </Field>
      </Section>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-card transition-colors"
      >
        {pending ? 'Menyimpan...' : submitLabel}
      </button>
    </form>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none';

function Section({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">{title}</p>
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
