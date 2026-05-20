'use client';

// Group Payment Template — set nominal per milestone once for the whole group

import { useState } from 'react';
import { updatePaymentTemplate } from '@/lib/actions/payments';
import { fmtRupiah } from '@/lib/utils/format';

const MILESTONES = [
  { key: 'DP',        label: 'DP',         color: 'amber' },
  { key: 'P1',        label: 'Payment 1',  color: 'blue' },
  { key: 'P2',        label: 'Payment 2',  color: 'blue' },
  { key: 'P3',        label: 'Payment 3',  color: 'blue' },
  { key: 'Pelunasan', label: 'Pelunasan',  color: 'green' },
  { key: 'Visa',      label: 'Visa',       color: 'purple' },
  { key: 'Asuransi',  label: 'Asuransi',   color: 'indigo' },
];

export default function PaymentTemplateForm({ tripId, template = {} }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState(() => {
    const v = {};
    for (const m of MILESTONES) v[m.key] = template[m.key] || 0;
    return v;
  });

  const total = MILESTONES.reduce((s, m) => s + (+values[m.key] || 0), 0);
  const action = updatePaymentTemplate.bind(null, tripId);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setOpen(false);
      setPending(false);
    }
  }

  const isEmpty = total === 0;

  // Summary view (collapsed)
  if (!open) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">Group Payment Template</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nominal sekali set untuk seluruh peserta. Klik checkbox di tabel untuk apply.
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
            ✎ {isEmpty ? 'Set Template' : 'Edit Template'}
          </button>
        </div>

        {isEmpty ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-semibold">⚠ Belum set template payment</p>
            <p className="text-xs mt-1">Klik "Set Template" untuk masukkan nominal DP/P1/P2/P3/Pelunasan group ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {MILESTONES.map((m) => (
              <div key={m.key} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{m.label}</p>
                <p className="mt-0.5 text-sm font-bold text-brand-700">{fmtRupiah(values[m.key] || 0)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total per Peserta</span>
          <span className="text-lg font-bold text-brand-700">{fmtRupiah(total)}</span>
        </div>
      </div>
    );
  }

  // Edit form (expanded)
  return (
    <form action={handleSubmit} className="bg-white rounded-xl border border-brand-300 shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-brand-700">Edit Group Payment Template</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">Batal</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {MILESTONES.map((m) => (
          <label key={m.key} className="block">
            <span className="text-xs font-semibold text-slate-700 block mb-1">{m.label}</span>
            <div className="relative">
              <span className="absolute left-2 top-1.5 text-xs text-slate-400">Rp</span>
              <input
                type="number"
                name={`tpl_${m.key}`}
                value={values[m.key] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [m.key]: parseInt(e.target.value) || 0 }))}
                onFocus={(e) => e.target.select()}
                min="0"
                placeholder="0"
                className="w-full pl-7 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
              />
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-between">
        <span className="text-xs font-bold text-brand-700 uppercase tracking-wider">Total / Peserta</span>
        <span className="text-xl font-bold text-brand-700">{fmtRupiah(total)}</span>
      </div>

      {error && <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <button type="submit" disabled={pending} className="w-full mt-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
        {pending ? 'Menyimpan...' : 'Simpan Template'}
      </button>
    </form>
  );
}
