'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createAccountingEntry } from '@/lib/actions/accounting';

const CATEGORIES_IN = ['Investment', 'Loan', 'Refund', 'Komisi', 'Bunga Bank', 'Lainnya'];
const CATEGORIES_OUT = ['Operasional Kantor', 'Gaji', 'Marketing', 'Sewa', 'Listrik/Air', 'Internet', 'Transport', 'Lainnya'];

export default function AccountingForm({ trips = [], accounts = [] }) {
  const [type, setType] = useState('in');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await createAccountingEntry(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const cats = type === 'in' ? CATEGORIES_IN : CATEGORIES_OUT;

  return (
    <form action={handleSubmit} className="space-y-5">
      <div>
        <span className="text-sm font-semibold text-slate-700 block mb-2">Tipe</span>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <input type="radio" name="type" value="in" checked={type === 'in'} onChange={() => setType('in')} className="sr-only" />
            <div className={`p-3 text-center rounded-lg border-2 font-bold transition-colors ${type === 'in' ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-green-300'}`}>⬆ Cash IN</div>
          </label>
          <label className="flex-1 cursor-pointer">
            <input type="radio" name="type" value="out" checked={type === 'out'} onChange={() => setType('out')} className="sr-only" />
            <div className={`p-3 text-center rounded-lg border-2 font-bold transition-colors ${type === 'out' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-amber-300'}`}>⬇ Cash OUT</div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Jumlah (IDR)" required>
          <input type="number" name="amount" min="1" required onFocus={(e) => e.target.select()} className={inputCls} placeholder="1000000" />
        </Field>
        <Field label="Tanggal" required>
          <input type="date" name="date" defaultValue={today} required className={inputCls} />
        </Field>
        <Field label="Akun (Bank/Kas)" required hint={accounts.length === 0 ? <Link href="/accounting/accounts/new" className="text-brand-600 hover:underline font-semibold">Tambah akun dulu →</Link> : 'Pilih sumber/tujuan dana'}>
          <select name="account_id" required={accounts.length > 0} disabled={accounts.length === 0} className={inputCls}>
            <option value="">— Pilih akun —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" className={inputCls}>
            <option value="">— Pilih —</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Trip Terkait (opsional)" className="md:col-span-2">
          <select name="trip_id" className={inputCls}>
            <option value="">— Tidak terkait trip —</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip || `#${t.id}`} — {t.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Keterangan" required>
        <textarea name="description" required rows="2" className={inputCls + ' resize-none'} placeholder="Detail transaksi..." />
      </Field>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending || accounts.length === 0} className={`w-full py-3 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card transition-colors ${type === 'in' ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
        {pending ? 'Menyimpan...' : accounts.length === 0 ? 'Tambah akun bank dulu' : `Tambah Cash ${type === 'in' ? 'In' : 'Out'}`}
      </button>
    </form>
  );
}

function Field({ label, required, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold text-slate-700 block mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-500 block mt-1">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
