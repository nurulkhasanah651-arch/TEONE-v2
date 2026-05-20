'use client';

// Group Payment Template — 7 standard milestones + custom items

import { useState } from 'react';
import { updatePaymentTemplate } from '@/lib/actions/payments';
import { fmtRupiah } from '@/lib/utils/format';

const STANDARD = [
  { key: 'DP',        label: 'DP' },
  { key: 'P1',        label: 'Payment 1' },
  { key: 'P2',        label: 'Payment 2' },
  { key: 'P3',        label: 'Payment 3' },
  { key: 'Pelunasan', label: 'Pelunasan' },
  { key: 'Visa',      label: 'Visa' },
  { key: 'Asuransi',  label: 'Asuransi' },
];
const STANDARD_KEYS = new Set(STANDARD.map((s) => s.key));

export default function PaymentTemplateForm({ tripId, template = {} }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Standard amounts
  const [stdValues, setStdValues] = useState(() => {
    const v = {};
    for (const m of STANDARD) v[m.key] = template[m.key] || 0;
    return v;
  });

  // Custom items — array of { key, label, amount }
  const [customItems, setCustomItems] = useState(() => {
    const items = [];
    for (const key in template) {
      if (STANDARD_KEYS.has(key)) continue;
      items.push({ key, label: key, amount: template[key] || 0 });
    }
    return items;
  });

  const total = Object.values(stdValues).reduce((s, v) => s + (+v || 0), 0)
              + customItems.reduce((s, c) => s + (+c.amount || 0), 0);

  const action = updatePaymentTemplate.bind(null, tripId);

  function addCustom() {
    const tempKey = `Custom_${Date.now()}`;
    setCustomItems((arr) => [...arr, { key: tempKey, label: '', amount: 0 }]);
  }
  function updCustom(i, key, val) {
    setCustomItems((arr) => arr.map((c, idx) => idx === i ? { ...c, [key]: val } : c));
  }
  function rmCustom(i) {
    setCustomItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    // Add custom items as form fields with keys = labels
    for (const c of customItems) {
      const lbl = (c.label || '').trim();
      if (!lbl) continue;
      // Use cleaned label as key. Avoid conflict with standard.
      const cleanKey = lbl.replace(/[^a-zA-Z0-9_]/g, '_');
      if (STANDARD_KEYS.has(cleanKey) || STANDARD_KEYS.has(lbl)) continue;
      formData.set(`tpl_${cleanKey}`, c.amount);
    }
    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setOpen(false);
      setPending(false);
    }
  }

  const allMilestones = [...STANDARD.map((s) => ({ ...s, isStd: true })), ...customItems.map((c) => ({ key: c.key, label: c.label || c.key, isStd: false, amount: c.amount }))];
  const isEmpty = total === 0;

  // Collapsed view
  if (!open) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">Group Payment Template</h3>
            <p className="text-xs text-slate-500 mt-0.5">Nominal sekali set + custom item. Klik checkbox di tabel untuk apply.</p>
          </div>
          <button onClick={() => setOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
            ✎ {isEmpty ? 'Set Template' : 'Edit Template'}
          </button>
        </div>

        {isEmpty ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-semibold">⚠ Belum set template payment</p>
            <p className="text-xs mt-1">Klik "Set Template" untuk masukkan nominal DP/P1/P2/P3/Pelunasan + custom item.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {STANDARD.map((m) => (
              <div key={m.key} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{m.label}</p>
                <p className="mt-0.5 text-sm font-bold text-brand-700">{fmtRupiah(stdValues[m.key] || 0)}</p>
              </div>
            ))}
            {customItems.map((c) => (
              <div key={c.key} className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">{c.label || '(custom)'}</p>
                <p className="mt-0.5 text-sm font-bold text-brand-700">{fmtRupiah(c.amount || 0)}</p>
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

  // Edit form
  return (
    <form action={handleSubmit} className="bg-white rounded-xl border border-brand-300 shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-brand-700">Edit Group Payment Template</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">Batal</button>
      </div>

      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Standard Milestones</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {STANDARD.map((m) => (
          <label key={m.key} className="block">
            <span className="text-xs font-semibold text-slate-700 block mb-1">{m.label}</span>
            <div className="relative">
              <span className="absolute left-2 top-1.5 text-xs text-slate-400">Rp</span>
              <input
                type="number"
                name={`tpl_${m.key}`}
                value={stdValues[m.key] || ''}
                onChange={(e) => setStdValues((v) => ({ ...v, [m.key]: parseInt(e.target.value) || 0 }))}
                onFocus={(e) => e.target.select()}
                min="0" placeholder="0"
                className="w-full pl-7 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
              />
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Custom Items</p>
        <button type="button" onClick={addCustom} className="text-xs font-semibold text-brand-600 hover:text-brand-700">+ Tambah Custom Item</button>
      </div>
      {customItems.length === 0 ? (
        <p className="text-xs text-slate-400 italic mb-4">Belum ada custom item. Klik "+ Tambah Custom Item" untuk tambah milestone non-standard (Tipping, Late Fee, dll).</p>
      ) : (
        <div className="space-y-2 mb-4">
          {customItems.map((c, i) => (
            <div key={c.key} className="flex gap-2 items-center">
              <input
                type="text" value={c.label} onChange={(e) => updCustom(i, 'label', e.target.value)}
                placeholder="Nama item (contoh: Tipping)"
                className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
              />
              <div className="relative w-40">
                <span className="absolute left-2 top-1.5 text-xs text-slate-400">Rp</span>
                <input
                  type="number" value={c.amount || ''} onChange={(e) => updCustom(i, 'amount', parseInt(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()} min="0" placeholder="0"
                  className="w-full pl-7 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                />
              </div>
              <button type="button" onClick={() => rmCustom(i)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-between">
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
