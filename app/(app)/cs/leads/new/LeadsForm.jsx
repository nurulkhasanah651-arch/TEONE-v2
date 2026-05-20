'use client';

import { useState } from 'react';
import { upsertDailyLeads } from '@/lib/actions/leads';

export default function LeadsForm({ initial = {} }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [ig, setIg] = useState(initial.leads_ig || 0);
  const [tiktok, setTiktok] = useState(initial.leads_tiktok || 0);
  const [wa, setWa] = useState(initial.leads_wa || 0);
  const [fb, setFb] = useState(initial.leads_fb || 0);
  const total = (+ig || 0) + (+tiktok || 0) + (+wa || 0) + (+fb || 0);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await upsertDailyLeads(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="Tanggal" required>
        <input type="date" name="tanggal" defaultValue={initial.tanggal} required className={inputCls} />
      </Field>

      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">Leads Masuk Hari Ini</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="📷 Instagram" name="leads_ig" value={ig} onChange={setIg} />
          <NumberInput label="🎵 TikTok" name="leads_tiktok" value={tiktok} onChange={setTiktok} />
          <NumberInput label="💬 WhatsApp" name="leads_wa" value={wa} onChange={setWa} />
          <NumberInput label="📘 Facebook / Lainnya" name="leads_fb" value={fb} onChange={setFb} />
        </div>

        <div className="mt-4 p-3 rounded-lg bg-brand-50 border border-brand-200">
          <p className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">Total Leads Hari Ini</p>
          <p className="mt-1 text-3xl font-bold text-brand-700">{total}</p>
        </div>
      </div>

      <Field label="Catatan (opsional)">
        <textarea name="notes" defaultValue={initial.notes || ''} rows="2" className={inputCls + ' resize-none'} placeholder="Hal penting tentang leads hari ini..." />
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
        {pending ? 'Menyimpan...' : 'Simpan Leads'}
      </button>
    </form>
  );
}

function NumberInput({ label, name, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      <input
        type="number"
        name={name}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()}
        min="0"
        className={inputCls}
      />
    </label>
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

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
