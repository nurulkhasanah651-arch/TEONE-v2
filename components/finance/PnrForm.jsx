'use client';

import { useState } from 'react';

export default function PnrForm({ initial = {}, onSubmit, submitLabel = 'Simpan PNR' }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [seats, setSeats] = useState(initial.seats || 0);
  const [ticketPrice, setTicketPrice] = useState(initial.ticket_price || 0);
  const totalCost = (+seats || 0) * (+ticketPrice || 0);

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
      <Section title="PNR & Rute">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="PNR Code" required>
            <input name="pnr" defaultValue={initial.pnr || ''} required className={inputCls} placeholder="ABC123" />
          </Field>
          <Field label="Vendor / Maskapai">
            <input name="vendor" defaultValue={initial.vendor || ''} className={inputCls} placeholder="Garuda, Emirates, Qatar, dll" />
          </Field>
          <Field label="Rute" className="md:col-span-2">
            <input name="route" defaultValue={initial.route || ''} className={inputCls} placeholder="CGK-DXB-CDG-CGK" />
          </Field>
          <Field label="Tanggal Keberangkatan">
            <input type="date" name="departure_date" defaultValue={initial.departure_date || ''} className={inputCls} />
          </Field>
          <Field label="Jumlah Seat">
            <input type="number" name="seats" min="0" value={seats} onChange={(e) => setSeats(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="Harga & Deposit">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Harga Tiket per Seat (IDR)">
            <input type="number" name="ticket_price" min="0" value={ticketPrice} onChange={(e) => setTicketPrice(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Total Cost (auto: harga × seat)" hint="View only">
            <input value={totalCost.toLocaleString('id-ID')} disabled className={inputCls + ' bg-slate-100'} />
          </Field>
          <Field label="Jumlah Deposit (DP)" className="md:col-span-2">
            <input type="number" name="deposit_total" min="0" defaultValue={initial.deposit_total || ''} className={inputCls} />
          </Field>
          <Field label="Jumlah Pelunasan">
            <input type="number" name="payoff_amount" min="0" defaultValue={initial.payoff_amount || ''} className={inputCls} />
          </Field>
          <Field label="Tanggal Pelunasan">
            <input type="date" name="payoff_date" defaultValue={initial.payoff_date || ''} className={inputCls} />
          </Field>
          <Field label="Deadline Pelunasan" hint="Tanggal terakhir yang harus dilunasi">
            <input type="date" name="payoff_due_date" defaultValue={initial.payoff_due_date || ''} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Field label="Catatan (opsional)">
        <textarea name="notes" defaultValue={initial.vendor_notes || ''} rows="3" className={inputCls + ' resize-none'} placeholder="Catatan tambahan tentang PNR ini..." />
      </Field>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card transition-colors">
        {pending ? 'Menyimpan...' : submitLabel}
      </button>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, required, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-500 block mt-0.5">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
