'use client';

// Client form — only this part needs interactivity (state, submit handling)
// Data already fetched on server; form posts back to Server Action

import { useState } from 'react';
import { createCSUpdate } from './actions';

export default function CSForm({ trips }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await createCSUpdate(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
    // On success, Server Action redirects to /cs (no need to handle here)
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="Trip" required>
        <select name="trip_id" required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
          <option value="">Pilih trip...</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.kode_trip || `#${t.id}`} — {t.name} ({t.status})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tanggal" required>
        <input type="date" name="tanggal" defaultValue={today} required
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Terjual Hari Ini">
          <input type="number" name="total_terjual_hari_ini" defaultValue="0" min="0"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
        </Field>
        <Field label="Jumlah Leads">
          <input type="number" name="jumlah_leads" defaultValue="0" min="0"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
        </Field>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">Sumber Penjualan</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Instagram">
            <input type="number" name="from_instagram" defaultValue="0" min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
          </Field>
          <Field label="WhatsApp">
            <input type="number" name="from_whatsapp" defaultValue="0" min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
          </Field>
          <Field label="Offline">
            <input type="number" name="from_offline" defaultValue="0" min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
          </Field>
        </div>
      </div>

      <Field label="Sisa Seat">
        <input type="number" name="sisa_seat" defaultValue="0" min="0"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
      </Field>

      <Field label="Catatan (opsional)">
        <textarea name="catatan" rows="3"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
          placeholder="Hal penting yang perlu di-note hari ini..." />
      </Field>

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
        {pending ? 'Menyimpan...' : 'Simpan Update'}
      </button>
    </form>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700 block mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
