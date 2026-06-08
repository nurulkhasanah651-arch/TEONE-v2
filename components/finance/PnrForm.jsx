'use client';

// Round 88: PNR Form — Jumlah Pelunasan AUTO = Total Cost - DP
// Plus format Rupiah dengan titik ribuan saat ngetik

import { useState, useEffect } from 'react';

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

export default function PnrForm({ initial = {}, onSubmit, submitLabel = 'Simpan PNR', trips = [] }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const [ticketType, setTicketType] = useState(initial.ticket_type === 'fit' ? 'fit' : 'group');
  const [fitTotal, setFitTotal] = useState(String(initial.total_amount || 0));
  const [fitTripId, setFitTripId] = useState(initial.trip_id || '');
  const [seats, setSeats] = useState(String(initial.seats || initial.pax || 0));
  const [ticketPrice, setTicketPrice] = useState(String(initial.ticket_price || initial.price_per_pax || 0));
  const [deposit, setDeposit] = useState(String(initial.deposit_total || 0));
  // payoffAmount manual override jika ada nilai initial, otherwise auto
  const [payoffManualOverride, setPayoffManualOverride] = useState(false);
  const [payoffAmount, setPayoffAmount] = useState(String(initial.payoff_amount || 0));

  const seatsNum = parseInt(seats) || 0;
  const priceNum = parseInt(ticketPrice) || 0;
  const depositNum = parseInt(deposit) || 0;
  const totalCost = seatsNum * priceNum;
  const autoPayoff = Math.max(totalCost - depositNum, 0);

  // Auto-update payoff kalau user belum override manual
  useEffect(() => {
    if (!payoffManualOverride) {
      setPayoffAmount(String(autoPayoff));
    }
  }, [autoPayoff, payoffManualOverride]);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    // Set numeric raw values
    formData.set('seats', String(seatsNum));
    formData.set('ticket_price', String(priceNum));
    formData.set('deposit_total', String(depositNum));
    formData.set('payoff_amount', String(parseInt(payoffAmount) || 0));
    formData.set('ticket_type', ticketType);
    if (ticketType === 'fit') {
      formData.set('total_amount', String(parseInt(parseRupiah(fitTotal)) || 0));
      formData.set('trip_id', fitTripId || '');
      if (!fitTripId) { setError('Tiket FIT wajib disambungkan ke trip. Pilih trip dulu.'); setPending(false); return; }
      if (!(parseInt(parseRupiah(fitTotal)) > 0)) { setError('Harga total tiket FIT wajib diisi.'); setPending(false); return; }
    }
    const result = await onSubmit(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  function handlePayoffChange(e) {
    setPayoffManualOverride(true);
    setPayoffAmount(parseRupiah(e.target.value));
  }

  function resetPayoffAuto() {
    setPayoffManualOverride(false);
    setPayoffAmount(String(autoPayoff));
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {/* Tipe tiket: Group (PNR) atau FIT */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
        <button type="button" onClick={() => setTicketType('group')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition ${ticketType === 'group' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
          ✈ Tiket Group (PNR)
        </button>
        <button type="button" onClick={() => setTicketType('fit')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition ${ticketType === 'fit' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
          🎫 Tiket FIT
        </button>
      </div>

      {ticketType === 'fit' && (
        <Section title="Tiket FIT — Sambung ke Trip">
          <Field label="Sambungkan ke Trip" required className="md:col-span-2"
            hint="Tiket FIT dibeli setelah trip dibuat — pilih trip tujuannya.">
            <select value={fitTripId} onChange={(e) => setFitTripId(e.target.value)} className={inputCls}>
              <option value="">— Pilih trip —</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>{t.kode_trip || t.id} — {t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Harga Total Tiket (Rp)" required className="md:col-span-2"
            hint="Total yang sudah dibayar. Masuk ke HPP cashflow trip, TIDAK masuk lagi ke cash out accounting (dianggap sudah diinput manual).">
            <input autoComplete="off" type="text" inputMode="numeric"
              value={fmtRupiah(fitTotal)} onChange={(e) => setFitTotal(parseRupiah(e.target.value))}
              className={inputCls} placeholder="cth: 12.500.000" />
          </Field>
        </Section>
      )}

      <Section title="PNR & Rute">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="PNR Code" required>
            <input autoComplete="off" name="pnr" defaultValue={initial.pnr || ''} required className={inputCls} placeholder="ABC123" />
          </Field>
          <Field label="Vendor / Maskapai">
            <input autoComplete="off" name="vendor" defaultValue={initial.vendor || ''} className={inputCls} placeholder="Garuda, Emirates, Qatar, dll" />
          </Field>
          <Field label="Rute" className="md:col-span-2">
            <input autoComplete="off"
              name="route"
              defaultValue={initial.route || (Array.isArray(initial.routes) ? initial.routes.join(' / ') : '')}
              className={inputCls}
              placeholder="CGK-DXB-CDG-CGK"
            />
          </Field>
          <Field label="Tanggal Keberangkatan">
            <input autoComplete="off" type="date" name="departure_date" defaultValue={initial.departure_date || ''} className={inputCls} />
          </Field>
          <Field label="Jumlah Seat">
            <input autoComplete="off"
              type="number"
              min="0"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              onFocus={(e) => e.target.select()}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {ticketType === 'group' && <Section title="Harga & Deposit">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Harga Tiket per Seat (Rp)">
            <input autoComplete="off"
              type="text"
              inputMode="numeric"
              value={fmtRupiah(ticketPrice)}
              onChange={(e) => setTicketPrice(parseRupiah(e.target.value))}
              onFocus={(e) => e.target.select()}
              className={inputCls}
              placeholder="0"
            />
          </Field>
          <Field label="Total Cost (auto)" hint={`${seatsNum} seat × ${fmtRupiah(ticketPrice) || 0}`}>
            <input autoComplete="off"
              value={'Rp ' + totalCost.toLocaleString('id-ID')}
              disabled
              className={inputCls + ' bg-slate-100 font-bold'}
            />
          </Field>

          <Field label="Jumlah Deposit / DP (Rp)" className="md:col-span-2">
            <input autoComplete="off"
              type="text"
              inputMode="numeric"
              value={fmtRupiah(deposit)}
              onChange={(e) => setDeposit(parseRupiah(e.target.value))}
              onFocus={(e) => e.target.select()}
              className={inputCls}
              placeholder="0"
            />
          </Field>

          <Field
            label="Jumlah Pelunasan (Sisa)"
            hint={payoffManualOverride
              ? `Manual mode. Auto value: Rp ${autoPayoff.toLocaleString('id-ID')}`
              : 'AUTO = Total Cost − DP. Bisa override manual.'}
            className="md:col-span-2"
          >
            <div className="flex gap-2 items-center">
              <input autoComplete="off"
                type="text"
                inputMode="numeric"
                value={fmtRupiah(payoffAmount)}
                onChange={handlePayoffChange}
                onFocus={(e) => e.target.select()}
                className={inputCls + (payoffManualOverride ? '' : ' bg-blue-50 font-bold')}
              />
              {payoffManualOverride && (
                <button
                  type="button"
                  onClick={resetPayoffAuto}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded whitespace-nowrap"
                >
                  ↺ Reset Auto
                </button>
              )}
            </div>
          </Field>

          <Field label="Tanggal Pelunasan">
            <input autoComplete="off" type="date" name="payoff_date" defaultValue={initial.payoff_date || ''} className={inputCls} />
          </Field>
          <Field label="Deadline Pelunasan" hint="Tanggal terakhir yang harus dilunasi">
            <input autoComplete="off" type="date" name="payoff_due_date" defaultValue={initial.payoff_due_date || ''} className={inputCls} />
          </Field>
        </div>
      </Section>}

      <Field label="Catatan (opsional)">
        <textarea autoComplete="off" name="notes" defaultValue={initial.vendor_notes || initial.notes || ''} rows="3" className={inputCls + ' resize-none'} placeholder="Catatan tambahan tentang PNR ini..." />
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
