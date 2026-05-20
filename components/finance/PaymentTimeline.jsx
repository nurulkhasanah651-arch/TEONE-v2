'use client';

// Per-participant payment timeline — list payments + add new payment inline

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPayment, deletePayment } from '@/lib/actions/payments';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { PAYMENT_TYPES, typeColorClasses } from '@/lib/utils/payment-types';

export default function PaymentTimeline({ passenger, tripId, payments = [] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('DP');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const c = passenger.customers || {};
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const expectedPrice = passenger.price_paid || 0;
  const balance = expectedPrice - totalPaid;
  const isFullyPaid = balance <= 0 && expectedPrice > 0;

  async function handleAdd(formData) {
    setError('');
    startTransition(async () => {
      const result = await addPayment(passenger.id, tripId, formData);
      if (result?.error) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  async function handleDelete(pid, label) {
    if (!confirm(`Hapus ${label}?`)) return;
    startTransition(async () => {
      const result = await deletePayment(pid, tripId);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="font-bold text-brand-700">{c.name || '—'}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {c.phone && `📞 ${c.phone} · `}
            {passenger.room_type && `🛏 ${passenger.room_type} · `}
            Harga: {fmtRupiah(expectedPrice)}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold ${isFullyPaid ? 'text-green-700' : balance > 0 ? 'text-amber-700' : 'text-blue-700'}`}>
            {fmtRupiah(totalPaid)}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-wider">
            {expectedPrice > 0 ? (
              isFullyPaid ? (
                <span className="text-green-700">✓ LUNAS</span>
              ) : balance > 0 ? (
                <span className="text-amber-700">Sisa: {fmtRupiah(balance)}</span>
              ) : (
                <span className="text-blue-700">Lebih bayar: {fmtRupiah(-balance)}</span>
              )
            ) : (
              <span className="text-slate-400">Harga belum di-set</span>
            )}
          </p>
        </div>
      </div>

      {/* Payments list */}
      {payments.length === 0 ? (
        <p className="text-sm text-slate-500 italic py-2">Belum ada pembayaran tercatat.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {payments.map((p) => {
            const cls = typeColorClasses(p.type);
            return (
              <div key={p.id} className={`flex items-center justify-between gap-3 p-2 rounded ${cls.bg} ${cls.border} border`}>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-bold ${cls.text}`}>
                    {p.label && p.type === 'Custom' ? p.label : p.type}
                  </span>
                  {p.notes && <span className="ml-2 text-[11px] text-slate-600 italic">· {p.notes}</span>}
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {p.paid_at && `Dibayar ${fmtDate(p.paid_at)}`}
                    {p.due_at && ` · Due ${fmtDate(p.due_at)}`}
                  </p>
                </div>
                <span className={`text-sm font-bold ${cls.text}`}>{fmtRupiah(p.amount)}</span>
                <button
                  onClick={() => handleDelete(p.id, `${p.type}${p.amount ? ' ' + fmtRupiah(p.amount) : ''}`)}
                  disabled={pending}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors disabled:opacity-50"
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add payment */}
      {!open ? (
        <button
          onClick={() => { setOpen(true); setError(''); }}
          className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded-lg transition-colors"
        >
          + Tambah Payment
        </button>
      ) : (
        <form action={handleAdd} className="border-t border-slate-200 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type" required>
              <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={miniInput}>
                {PAYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Jumlah (IDR)" required>
              <input type="number" name="amount" min="0" required onFocus={(e) => e.target.select()} className={miniInput} />
            </Field>
            {type === 'Custom' && (
              <Field label="Label Custom" className="col-span-2">
                <input name="label" className={miniInput} placeholder="Contoh: Tambahan Optional, Late Fee, dll" />
              </Field>
            )}
            <Field label="Tanggal Bayar">
              <input type="date" name="paid_at" className={miniInput} />
            </Field>
            <Field label="Due Date (opsional)">
              <input type="date" name="due_at" className={miniInput} />
            </Field>
            <Field label="Catatan" className="col-span-2">
              <input name="notes" className={miniInput} placeholder="(opsional)" />
            </Field>
          </div>

          {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-700">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors">
              {pending ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded transition-colors">
              Batal
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const miniInput = 'w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
