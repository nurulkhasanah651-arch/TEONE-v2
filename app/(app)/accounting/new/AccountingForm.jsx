'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { createAccountingEntry } from '@/lib/actions/accounting';

const CATEGORIES_IN = ['Payment Peserta', 'Investment', 'Loan', 'Refund', 'Komisi', 'Bunga Bank', 'Lainnya'];
const CATEGORIES_OUT = ['Vendor Trip (HPP)', 'Operasional Kantor', 'Gaji', 'Marketing', 'Sewa', 'Listrik/Air', 'Internet', 'Transport', 'Lainnya'];

export default function AccountingForm({ trips = [], accounts = [], hppItems = [] }) {
  const [type, setType] = useState('in');
  const [tripId, setTripId] = useState('');
  const [linkedHpp, setLinkedHpp] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // HPP items untuk trip yang dipilih
  const hppForTrip = useMemo(() => {
    if (!tripId) return [];
    return hppItems.filter((h) => String(h.trip_id) === String(tripId));
  }, [tripId, hppItems]);

  // Auto-fill saat HPP item dipilih (hybrid — masih bisa di-override user)
  useEffect(() => {
    if (!linkedHpp) return;
    const item = hppItems.find((h) => String(h.id) === String(linkedHpp));
    if (!item) return;
    setAmount(String(item.total_amount || ''));
    setCategory('Vendor Trip (HPP)');
    const vendor = item.vendor_name ? ` (${item.vendor_name})` : '';
    setDescription(`Bayar ${item.category} - ${item.component}${vendor}`);
  }, [linkedHpp, hppItems]);

  // Reset linked HPP kalau pindah trip atau ganti type ke 'in'
  useEffect(() => {
    setLinkedHpp('');
  }, [tripId, type]);

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
  const showHppPicker = type === 'out' && tripId && hppForTrip.length > 0;

  return (
    <form action={handleSubmit} className="space-y-5">
      <div>
        <span className="text-sm font-semibold text-slate-700 block mb-2">Tipe</span>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <input autoComplete="off" type="radio" name="type" value="in" checked={type === 'in'} onChange={() => setType('in')} className="sr-only" />
            <div className={`p-3 text-center rounded-lg border-2 font-bold transition-colors ${type === 'in' ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-green-300'}`}>⬆ Cash IN</div>
          </label>
          <label className="flex-1 cursor-pointer">
            <input autoComplete="off" type="radio" name="type" value="out" checked={type === 'out'} onChange={() => setType('out')} className="sr-only" />
            <div className={`p-3 text-center rounded-lg border-2 font-bold transition-colors ${type === 'out' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-amber-300'}`}>⬇ Cash OUT</div>
          </label>
        </div>
      </div>

      {/* Trip picker — pindah ke atas biar logic-nya jelas */}
      <Field label="Trip Terkait (opsional)" hint="Pilih trip dulu untuk muncul list HPP yang belum lunas">
        <select
          name="trip_id"
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          className={inputCls}
        >
          <option value="">— Tidak terkait trip —</option>
          {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip || `#${t.id}`} — {t.name}</option>)}
        </select>
      </Field>

      {/* HPP Picker — muncul kalau Cash OUT + Trip dipilih + ada HPP unpaid */}
      {showHppPicker && (
        <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-lg">
          <Field label="🔗 Link ke HPP Item (Finance)" hint="Pilih item HPP yang dibayar. Nominal & deskripsi auto-fill, masih bisa di-edit. Saat save, item akan auto-mark LUNAS di Finance.">
            <select
              name="linked_finance_item_id"
              value={linkedHpp}
              onChange={(e) => setLinkedHpp(e.target.value)}
              className={inputCls}
            >
              <option value="">— Manual (tidak link HPP) —</option>
              {hppForTrip.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.category} — {h.component}{h.vendor_name ? ` (${h.vendor_name})` : ''} — Rp {Number(h.total_amount || 0).toLocaleString('id-ID')}
                </option>
              ))}
            </select>
          </Field>
          {linkedHpp && (
            <p className="mt-2 text-xs text-amber-800 font-semibold">
              ✓ Item ini akan otomatis di-mark "lunas" di tab Finance saat kamu save.
            </p>
          )}
        </div>
      )}

      {type === 'out' && tripId && hppForTrip.length === 0 && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          ℹ Trip ini belum punya HPP item yang belum lunas di Finance. Cash out tetap bisa disimpan manual.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Jumlah (IDR)" required>
          <input autoComplete="off"
            type="number"
            name="amount"
            min="1"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onFocus={(e) => e.target.select()}
            className={inputCls}
            placeholder="1000000"
          />
        </Field>
        <Field label="Tanggal" required>
          <input autoComplete="off" type="date" name="date" defaultValue={today} required className={inputCls} />
        </Field>
        <Field label="Akun (Bank/Kas)" required hint={accounts.length === 0 ? <Link href="/accounting/accounts/new" className="text-brand-600 hover:underline font-semibold">Tambah akun dulu →</Link> : 'Pilih sumber/tujuan dana'}>
          <select name="account_id" required={accounts.length > 0} disabled={accounts.length === 0} className={inputCls}>
            <option value="">— Pilih akun —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="">— Pilih —</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Keterangan" required>
        <textarea autoComplete="off"
          name="description"
          required
          rows="2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls + ' resize-none'}
          placeholder="Detail transaksi..."
        />
      </Field>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending || accounts.length === 0} className={`w-full py-3 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card transition-colors ${type === 'in' ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
        {pending ? 'Menyimpan...' : accounts.length === 0 ? 'Tambah akun bank dulu' : `Tambah Cash ${type === 'in' ? 'In' : 'Out'}${linkedHpp ? ' & Mark HPP Lunas' : ''}`}
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
