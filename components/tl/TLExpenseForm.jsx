'use client';

// Round 132 HOTFIX: TL Expense Form — tambah tombol "+ Tambah Expense Lagi"
// Path: components/tl/TLExpenseForm.jsx

import { useState, useTransition } from 'react';
import { addTLExpense } from '@/lib/actions/tlexpense';
import FileUploadInput from './FileUploadInput';

const CATEGORIES = ['Transport', 'Meal', 'Accommodation', 'Tips', 'Communication', 'Emergency', 'Souvenir', 'Other'];

function parseNum(s) { return Number(String(s || '').replace(/[^0-9]/g, '')) || 0; }
function formatNum(n) { return n ? Number(n).toLocaleString('id-ID') : ''; }
function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }

export default function TLExpenseForm({
  brand,
  tripId, pettyCash, userEmail = '', userName = '', userRole = 'tour_leader',
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState(null);
  const [savedCount, setSavedCount] = useState(0);

  const allocated = Number(pettyCash?.allocated_amount || 0);
  const spent = Number(pettyCash?.spent_amount || 0);
  const remaining = Math.max(allocated - spent, 0);
  const expenseAmt = parseNum(amount);

  let routingPreview = null;
  if (expenseAmt > 0) {
    if (remaining >= expenseAmt) {
      routingPreview = {
        type: 'petty_full',
        label: '💵 Full dari Petty Cash',
        color: 'bg-purple-50 border-purple-200 text-purple-800',
        detail: `Petty cash ${fmtRupiah(remaining)} → ${fmtRupiah(remaining - expenseAmt)} setelah expense`,
      };
    } else if (remaining > 0) {
      routingPreview = {
        type: 'petty_partial',
        label: '⚡ Petty Cash + Reimbursement',
        color: 'bg-amber-50 border-amber-200 text-amber-800',
        detail: `Petty cash ${fmtRupiah(remaining)} dipakai habis + ${fmtRupiah(expenseAmt - remaining)} jadi reimbursement (pending approval)`,
      };
    } else {
      routingPreview = {
        type: 'reimbursement_full',
        label: '🧾 Full Reimbursement',
        color: 'bg-amber-50 border-amber-200 text-amber-800',
        detail: 'Petty cash habis/belum diset → expense full jadi reimbursement (pending approval)',
      };
    }
  }

  function resetForm() {
    setCategory(CATEGORIES[0]);
    setDescription('');
    setAmount('');
    setReceiptUrl('');
    setNotes('');
    setSpentAt(new Date().toISOString().slice(0, 10));
    setError('');
  }

  function handleSubmit() {
    setError('');
    if (!description.trim()) { setError('Deskripsi wajib'); return; }
    if (expenseAmt <= 0) { setError('Nominal wajib > 0'); return; }
    if (!receiptUrl) {
      if (!confirm('Belum upload bukti expense. Tetap submit?\n\n(Sangat disarankan upload bukti untuk validasi)')) return;
    }

    const desc = description.trim();
    const amt = expenseAmt;

    startTransition(async () => {
      const r = await addTLExpense({
        brand,
        tripId, category, description: desc,
        amount: amt, receiptUrl, spentAt,
        notes: notes.trim(), userEmail, userName, userRole,
      });
      if (r?.error) { setError(r.error); return; }
      setLastSaved({ description: desc, amount: amt, category, ...r });
      setSavedCount((c) => c + 1);
      // Auto-reset form untuk siap input expense baru
      resetForm();
    });
  }

  function handleDone() {
    setOpen(false);
    setLastSaved(null);
    setSavedCount(0);
    resetForm();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 border-2 border-dashed border-green-400 hover:border-green-600 hover:bg-green-50 text-green-700 text-sm font-bold rounded-lg transition-colors"
      >
        + Catat Expense (auto-route petty/reimbursement)
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border-2 border-green-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-green-50 border-green-200 flex items-center justify-between">
        <h3 className="font-bold text-green-800 flex items-center gap-2">
          <span>💸</span> Catat Expense TL
          {savedCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
              {savedCount} expense tersimpan
            </span>
          )}
        </h3>
        <button
          onClick={handleDone}
          className="text-xs px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold"
        >
          ✓ Selesai
        </button>
      </div>

      <div className="px-5 py-2 bg-purple-50/50 border-b border-purple-100 text-xs flex items-center justify-between flex-wrap gap-2">
        <span className="text-purple-700">
          💵 Petty Cash Remaining: <b>{fmtRupiah(remaining)}</b>
          {allocated > 0 && <span className="text-slate-500"> · dari {fmtRupiah(allocated)} (spent {fmtRupiah(spent)})</span>}
        </span>
        {remaining === 0 && allocated === 0 && <span className="text-red-700 font-bold">⚠ Petty cash belum di-set</span>}
      </div>

      {lastSaved && (
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-bold text-blue-800">✓ Tersimpan: {lastSaved.description}</p>
            <p className="text-xs text-blue-700">
              {lastSaved.category} · {fmtRupiah(lastSaved.amount)}
              {lastSaved.reimbursementId && ` · Reimbursement ID ${String(lastSaved.reimbursementId).slice(0, 8)}...`}
            </p>
          </div>
          <p className="text-[11px] text-blue-700 italic">Form sudah di-reset, siap input expense berikutnya ↓</p>
        </div>
      )}

      <div className="p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Kategori" required>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Nominal (IDR)" required>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
              <input autoComplete="off"
                type="text"
                value={amount}
                onChange={(e) => setAmount(formatNum(parseNum(e.target.value)))}
                className={`${inputCls} pl-10 font-mono`}
                placeholder="500.000"
              />
            </div>
          </Field>
          <Field label="Tanggal Pengeluaran">
            <input autoComplete="off" type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Deskripsi" required>
            <input autoComplete="off"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Taksi airport ke hotel"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
          <FileUploadInput
            tripId={tripId}
            subfolder="expense"
            value={receiptUrl}
            onChange={setReceiptUrl}
            label="📎 Upload Bukti Expense (foto/PDF/Excel)"
            maxSizeMB={20}
          />
          <p className="text-[11px] text-blue-700 mt-2">
            💡 Foto struk, screenshot transfer, atau scan invoice langsung dari device. Bisa JPG, PNG, PDF, Excel.
          </p>
        </div>

        <Field label="Catatan tambahan">
          <textarea autoComplete="off"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
            placeholder="(opsional)"
          />
        </Field>

        {routingPreview && (
          <div className={`p-3 rounded-lg border ${routingPreview.color}`}>
            <p className="text-xs font-bold uppercase tracking-wider">{routingPreview.label}</p>
            <p className="text-xs mt-1">{routingPreview.detail}</p>
          </div>
        )}

        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">⚠ {error}</div>}

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={pending}
            className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg disabled:opacity-50"
          >
            {pending ? 'Memproses...' : (savedCount > 0 ? '➕ Catat Expense Berikutnya' : '💸 Catat Expense')}
          </button>
          <button
            onClick={handleDone}
            disabled={pending}
            className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
          >
            ✓ Selesai
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-green-500 outline-none bg-white';
