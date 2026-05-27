'use client';

// Round 130: TL Expense Form — auto-route ke petty cash atau reimbursement
// Path: components/tl/TLExpenseForm.jsx

import { useState, useTransition } from 'react';
import { addTLExpense } from '@/lib/actions/tlexpense';

const CATEGORIES = ['Transport', 'Meal', 'Accommodation', 'Tips', 'Communication', 'Emergency', 'Souvenir', 'Other'];

function parseNum(s) { return Number(String(s || '').replace(/[^0-9]/g, '')) || 0; }
function formatNum(n) { return n ? Number(n).toLocaleString('id-ID') : ''; }
function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }

export default function TLExpenseForm({
  tripId,
  pettyCash,         // { allocated_amount, spent_amount }
  userEmail = '',
  userName = '',
  userRole = 'tour_leader',
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
  const [result, setResult] = useState(null);

  const allocated = Number(pettyCash?.allocated_amount || 0);
  const spent = Number(pettyCash?.spent_amount || 0);
  const remaining = Math.max(allocated - spent, 0);
  const expenseAmt = parseNum(amount);

  // Live preview routing
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

  function handleSubmit() {
    setError('');
    setResult(null);
    if (!description.trim()) { setError('Deskripsi wajib'); return; }
    if (expenseAmt <= 0) { setError('Nominal wajib > 0'); return; }

    startTransition(async () => {
      const r = await addTLExpense({
        tripId,
        category,
        description: description.trim(),
        amount: expenseAmt,
        receiptUrl: receiptUrl.trim(),
        spentAt,
        notes: notes.trim(),
        userEmail,
        userName,
        userRole,
      });
      if (r?.error) { setError(r.error); return; }
      setResult(r);
      // Reset form
      setDescription('');
      setAmount('');
      setReceiptUrl('');
      setNotes('');
    });
  }

  if (!open && !result) {
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
        </h3>
        <button
          onClick={() => { setOpen(false); setResult(null); setError(''); }}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Tutup
        </button>
      </div>

      {/* Petty cash summary */}
      <div className="px-5 py-2 bg-purple-50/50 border-b border-purple-100 text-xs flex items-center justify-between flex-wrap gap-2">
        <span className="text-purple-700">
          💵 Petty Cash Remaining: <b>{fmtRupiah(remaining)}</b>
          {allocated > 0 && (
            <span className="text-slate-500"> · dari {fmtRupiah(allocated)} (spent {fmtRupiah(spent)})</span>
          )}
        </span>
        {remaining === 0 && allocated === 0 && (
          <span className="text-red-700 font-bold">⚠ Petty cash belum di-set</span>
        )}
      </div>

      {result?.ok && (
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-200">
          <p className="text-sm font-bold text-blue-800">{result.summary?.message}</p>
          {result.reimbursementId && (
            <p className="text-xs text-blue-700 mt-1">
              Reimbursement ID: <span className="font-mono">{result.reimbursementId.slice(0, 8)}...</span> · status: pending
            </p>
          )}
        </div>
      )}

      {open && (
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
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(formatNum(parseNum(e.target.value)))}
                  className={`${inputCls} pl-10 font-mono`}
                  placeholder="500.000"
                />
              </div>
            </Field>
            <Field label="Tanggal Pengeluaran">
              <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Link Bukti (opsional)">
              <input
                type="url"
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                className={inputCls}
              />
            </Field>
            <Field label="Deskripsi" required className="md:col-span-2">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: Taksi airport ke hotel"
                className={inputCls}
              />
            </Field>
            <Field label="Catatan" className="md:col-span-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>

          {/* Live routing preview */}
          {routingPreview && (
            <div className={`p-3 rounded-lg border ${routingPreview.color}`}>
              <p className="text-xs font-bold uppercase tracking-wider">{routingPreview.label}</p>
              <p className="text-xs mt-1">{routingPreview.detail}</p>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">⚠ {error}</div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={pending}
              className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg disabled:opacity-50"
            >
              {pending ? 'Memproses...' : '💸 Catat Expense'}
            </button>
            <button
              onClick={() => { setOpen(false); setError(''); }}
              disabled={pending}
              className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}
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
