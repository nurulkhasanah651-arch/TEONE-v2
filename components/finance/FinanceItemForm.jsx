'use client';

// Form to add a new finance item (HPP or Income)

import { useState } from 'react';
import { createFinanceItem } from '@/lib/actions/finance';
import { HPP_CATEGORIES, INCOME_CATEGORIES, PAYMENT_STATUS_OPTS } from '@/lib/utils/finance-constants';

export default function FinanceItemForm({ tripId, type }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const cats = type === 'hpp' ? HPP_CATEGORIES : INCOME_CATEGORIES;
  const firstCategory = Object.keys(cats)[0];
  const [category, setCategory] = useState(firstCategory);
  const [basicFare, setBasicFare] = useState(0);
  const [qty, setQty] = useState(1);
  const totalAuto = (+basicFare || 0) * (+qty || 0);

  const action = createFinanceItem.bind(null, tripId);

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
      setBasicFare(0);
      setQty(1);
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
    <form action={handleSubmit} className="space-y-3">
      <input type="hidden" name="type" value={type} />

      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">
          Tambah Item {type === 'hpp' ? 'HPP' : 'Income'}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">Batal</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Category" required>
          <select name="category" required value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {Object.keys(cats).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Component" required>
          <select name="component" required className={inputCls}>
            {(cats[category] || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Basic Fare (per unit)">
          <input type="number" name="basic_fare" min="0" value={basicFare} onChange={(e) => setBasicFare(e.target.value)} onFocus={(e) => e.target.select()} className={inputCls} />
        </Field>
        <Field label="Qty">
          <input type="number" name="qty" min="0" value={qty} onChange={(e) => setQty(e.target.value)} onFocus={(e) => e.target.select()} className={inputCls} />
        </Field>
        <Field label="Total Amount" hint="Auto = fare × qty. Bisa override manual.">
          <input type="number" name="total_amount" min="0" defaultValue={totalAuto || ''} onFocus={(e) => e.target.select()} className={inputCls} placeholder={String(totalAuto)} />
        </Field>
        <Field label="Notes">
          <input name="notes" className={inputCls} placeholder="(opsional)" />
        </Field>
        {type === 'hpp' && (
          <>
            <Field label="Vendor Name">
              <input name="vendor_name" className={inputCls} placeholder="Nama vendor/maskapai/hotel" />
            </Field>
            <Field label="Payment Status">
              <select name="payment_status" defaultValue="belum bayar" className={inputCls}>
                {PAYMENT_STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </>
        )}
      </div>

      {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
        {pending ? 'Menyimpan...' : 'Simpan Item'}
      </button>
    </form>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[10px] text-slate-500 block mt-0.5">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
