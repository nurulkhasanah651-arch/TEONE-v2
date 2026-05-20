'use client';

import { useState } from 'react';
import { updateCSUpdate } from '@/lib/actions/cs';

export default function EditCSForm({ update }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const u = update;

  const action = updateCSUpdate.bind(null, u.id);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <input type="hidden" name="trip_id" value={u.trip_id} />

      <Field label="Tanggal" required>
        <input type="date" name="tanggal" defaultValue={u.tanggal} required className={inputCls} />
      </Field>

      <Section title="Closing per Sumber">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NumberField label="📷 Instagram" name="from_instagram" initial={u.from_instagram} />
          <NumberField label="💬 WhatsApp"  name="from_whatsapp"  initial={u.from_whatsapp} />
          <NumberField label="🏪 Offline"    name="from_offline"   initial={u.from_offline} />
          <NumberField label="🎓 Alumni"     name="closing_alumni" initial={u.closing_alumni} />
          <NumberField label="🤝 Mitra"      name="closing_mitra"  initial={u.closing_mitra} />
        </div>
      </Section>

      <Field label="Total Leads (untuk trip ini)">
        <input type="number" name="jumlah_leads" defaultValue={u.jumlah_leads || 0} min="0" className={inputCls} />
      </Field>

      <Field label="Catatan">
        <textarea name="notes" defaultValue={u.notes || ''} rows="3" className={inputCls + ' resize-none'} />
      </Field>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card transition-colors"
      >
        {pending ? 'Menyimpan...' : 'Update CS'}
      </button>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
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

function NumberField({ label, name, initial }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={initial || 0}
        onFocus={(e) => e.target.select()}
        min="0"
        className={inputCls}
      />
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
