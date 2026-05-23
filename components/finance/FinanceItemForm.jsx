'use client';

// Round 85: FinanceItemForm — INPUT TOTAL ONLY (DP via request payment, no input awal)

import { useState } from 'react';
import { createFinanceItem } from '@/lib/actions/finance';
import { HPP_CATEGORIES, INCOME_CATEGORIES } from '@/lib/utils/finance-constants';

function fmtRupiah(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseRupiah(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}

export default function FinanceItemForm({ tripId, type }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const cats = type === 'hpp' ? HPP_CATEGORIES : INCOME_CATEGORIES;
  const firstCategory = Object.keys(cats)[0];
  const [category, setCategory] = useState(firstCategory);

  const [totalAmount, setTotalAmount] = useState('');
  const totalNum = parseInt(totalAmount) || 0;

  const action = createFinanceItem.bind(null, tripId);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    formData.set('total_amount', String(totalNum));
    formData.set('dp_paid', '0'); // selalu 0 saat create — DP via request payment
    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setOpen(false);
      setPending(false);
      setTotalAmount('');
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-sm font-semibold rounded-lg transition-colors"
      >
        + Tambah Item {type === 'hpp' ? 'HPP' : 'Income'}
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3 border border-brand-200 rounded-xl p-4 bg-brand-50/30">
      <input type="hidden" name="type" value={type} />

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">
          Tambah Item {type === 'hpp' ? 'HPP' : 'Income'}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">Batal</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Kategori" required>
          <select name="category" required value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {Object.keys(cats).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Component" required>
          <select name="component" required className={inputCls}>
            {(cats[category] || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        {type === 'hpp' && (
          <Field label="Vendor / Maskapai" className="md:col-span-2">
            <input name="vendor_name" className={inputCls} placeholder="Nama vendor/maskapai/hotel" />
          </Field>
        )}

        <Field label="Total Harga (Rp)" required hint="Status awal: Belum Dibayar. DP & Pelunasan via Request Payment di item.">
          <input
            type="text"
            inputMode="numeric"
            value={fmtRupiah(totalAmount)}
            onChange={(e) => setTotalAmount(parseRupiah(e.target.value))}
            placeholder="5.000.000"
            className={inputCls}
          />
        </Field>

        <Field label="Notes">
          <input name="notes" className={inputCls} placeholder="Catatan (opsional)" />
        </Field>
      </div>

      {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending || !totalAmount} className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
        {pending ? 'Menyimpan...' : 'Simpan Item'}
      </button>
    </form>
  );
}

function Field({ label, required, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-slate-500 block mt-0.5">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
