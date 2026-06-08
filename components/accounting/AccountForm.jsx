'use client';

import { useState } from 'react';

export default function AccountForm({ initial = {}, onSubmit, submitLabel = 'Simpan' }) {
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
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="Nama Akun" required>
        <input autoComplete="off" name="name" defaultValue={initial.name || ''} required className={inputCls} placeholder="Bank Mandiri Operasional" />
      </Field>

      <Field label="Tipe Akun" required>
        <select name="type" defaultValue={initial.type || 'bank'} className={inputCls}>
          <option value="bank">🏦 Bank</option>
          <option value="cash">💵 Kas</option>
          <option value="e-wallet">📱 E-Wallet</option>
          <option value="other">💰 Lainnya</option>
        </select>
      </Field>

      <Field label="No. Rekening / Identifier (opsional)">
        <input autoComplete="off" name="account_number" defaultValue={initial.account_number || ''} className={inputCls} placeholder="1234567890" />
      </Field>

      <Field label="Saldo Awal (IDR)" hint="Saldo saat akun pertama kali ditambahkan ke sistem">
        <input autoComplete="off" type="number" name="starting_balance" defaultValue={initial.starting_balance || 0} min="0" className={inputCls} />
      </Field>

      <Field label="Catatan (opsional)">
        <textarea autoComplete="off" name="notes" defaultValue={initial.notes || ''} rows="2" className={inputCls + ' resize-none'} placeholder="Catatan tentang akun ini..." />
      </Field>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card transition-colors">
        {pending ? 'Menyimpan...' : submitLabel}
      </button>
    </form>
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
