'use client';

// Round 179: Form HPP/Income — qty auto + Deposit + Pelunasan + Deadline + Skip-Deposit
// Path: components/finance/FinanceItemForm.jsx

import { useState } from 'react';
import { createFinanceItem } from '@/lib/actions/finance';
import { HPP_CATEGORIES, INCOME_CATEGORIES, PAYMENT_STATUS_OPTS } from '@/lib/utils/finance-constants';

function fmtIDR(v) {
  if (v == null || v === '') return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseIDR(s) {
  return s == null ? '' : String(s).replace(/[^0-9]/g, '');
}

export default function FinanceItemForm({ tripId, type, paxCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const cats = type === 'hpp' ? HPP_CATEGORIES : INCOME_CATEGORIES;
  const firstCategory = Object.keys(cats)[0];
  const [category, setCategory] = useState(firstCategory);
  const [basicFare, setBasicFare] = useState('');
  const [qty, setQty] = useState(paxCount > 0 ? paxCount : 1);
  const [totalOverride, setTotalOverride] = useState('');
  // R179: Deposit + Pelunasan
  const [skipDeposit, setSkipDeposit] = useState(false);
  const [depositPlanned, setDepositPlanned] = useState('');
  const [deadlineDeposit, setDeadlineDeposit] = useState('');
  const [deadlinePelunasan, setDeadlinePelunasan] = useState('');

  const fareNum = Number(parseIDR(basicFare)) || 0;
  const qtyNum = Number(qty) || 0;
  const totalAuto = fareNum * qtyNum;
  const totalOverrideNum = Number(parseIDR(totalOverride)) || 0;
  const totalFinal = totalOverrideNum > 0 ? totalOverrideNum : totalAuto;

  const depositNum = skipDeposit ? 0 : (Number(parseIDR(depositPlanned)) || 0);
  const pelunasanAuto = Math.max(totalFinal - depositNum, 0);

  const action = createFinanceItem.bind(null, tripId);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    // Override fields supaya pakai value dari state (parsed)
    formData.set('basic_fare', String(fareNum));
    formData.set('qty', String(qtyNum));
    formData.set('total_amount', String(totalFinal));
    formData.set('deposit_planned', String(depositNum));
    formData.set('deadline_deposit', deadlineDeposit || '');
    formData.set('deadline_pelunasan', deadlinePelunasan || '');
    formData.set('skip_deposit', skipDeposit ? '1' : '0');

    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setOpen(false);
      setPending(false);
      setBasicFare('');
      setQty(paxCount > 0 ? paxCount : 1);
      setTotalOverride('');
      setSkipDeposit(false);
      setDepositPlanned('');
      setDeadlineDeposit('');
      setDeadlinePelunasan('');
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
      <input autoComplete="off" type="hidden" name="type" value={type} />

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
          <input autoComplete="off"
            type="text"
            inputMode="numeric"
            value={fmtIDR(basicFare)}
            onChange={(e) => setBasicFare(parseIDR(e.target.value))}
            onFocus={(e) => e.target.select()}
            className={inputCls}
            placeholder="Harga per pax"
          />
        </Field>

        <Field
          label="Qty (Jumlah Pax)"
          hint={paxCount > 0 ? `Default = ${paxCount} pax aktif. Bisa custom.` : 'Jumlah unit/pax'}
        >
          <div className="flex gap-1">
            <input autoComplete="off"
              type="number"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onFocus={(e) => e.target.select()}
              className={inputCls + ' flex-1'}
            />
            {paxCount > 0 && (
              <button type="button" onClick={() => setQty(paxCount)} className="px-2 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 text-[10px] font-bold rounded border border-brand-200" title={`Set ke ${paxCount}`}>
                = {paxCount} pax
              </button>
            )}
            <button type="button" onClick={() => setQty(1)} className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded border border-slate-200" title="Set ke 1">
              = 1
            </button>
          </div>
        </Field>

        <Field label="Total Amount" hint="Auto = fare × qty. Bisa override.">
          <input autoComplete="off"
            type="text"
            inputMode="numeric"
            value={fmtIDR(totalOverride)}
            onChange={(e) => setTotalOverride(parseIDR(e.target.value))}
            onFocus={(e) => e.target.select()}
            className={inputCls}
            placeholder={totalAuto ? `(auto) ${fmtIDR(totalAuto)}` : '(auto)'}
          />
        </Field>

        <Field label="Notes">
          <input autoComplete="off" name="notes" className={inputCls} placeholder="(opsional)" />
        </Field>

        {type === 'hpp' && (
          <>
            <Field label="Vendor Name" className="md:col-span-2">
              <input autoComplete="off" name="vendor_name" className={inputCls} placeholder="Nama vendor/maskapai/hotel" />
            </Field>
          </>
        )}
      </div>

      {/* Preview formula */}
      {fareNum > 0 && qtyNum > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded p-2 text-xs">
          <span className="text-slate-600">Formula: </span>
          <span className="font-mono font-bold text-brand-700">
            Rp {fareNum.toLocaleString('id-ID')} × {qtyNum} = Rp {totalAuto.toLocaleString('id-ID')}
          </span>
          {totalOverrideNum > 0 && (
            <span className="ml-2 text-orange-700 font-semibold">
              (override: Rp {totalOverrideNum.toLocaleString('id-ID')})
            </span>
          )}
        </div>
      )}

      {/* R179: DEPOSIT + PELUNASAN SECTION (HPP only) */}
      {type === 'hpp' && (
        <div className="border-2 border-dashed border-purple-300 rounded-lg p-3 bg-purple-50/30 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">💰 Skema Pembayaran</p>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input autoComplete="off"
                type="checkbox"
                checked={skipDeposit}
                onChange={(e) => setSkipDeposit(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <span className="text-[11px] font-semibold text-purple-700">Tanpa Deposit — langsung Pelunasan</span>
            </label>
          </div>

          {!skipDeposit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nominal Deposit (Rp)" hint="DP yg akan di-request ke Finance">
                <input autoComplete="off"
                  type="text"
                  inputMode="numeric"
                  value={fmtIDR(depositPlanned)}
                  onChange={(e) => setDepositPlanned(parseIDR(e.target.value))}
                  className={inputCls}
                  placeholder="contoh: 3.000.000"
                />
              </Field>

              <Field label="Sisa Pelunasan (Auto)" hint="Total − Deposit">
                <input autoComplete="off"
                  type="text"
                  value={'Rp ' + pelunasanAuto.toLocaleString('id-ID')}
                  readOnly
                  className={inputCls + ' bg-slate-100 font-bold'}
                />
              </Field>

              <Field label="Deadline Deposit (opsional)" hint="Tgl batas bayar DP">
                <input autoComplete="off"
                  type="date"
                  value={deadlineDeposit}
                  onChange={(e) => setDeadlineDeposit(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Deadline Pelunasan" hint="Tgl harus lunas. Lewat = warning.">
                <input autoComplete="off"
                  type="date"
                  value={deadlinePelunasan}
                  onChange={(e) => setDeadlinePelunasan(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          )}

          {skipDeposit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Deadline Pelunasan" hint="Tgl harus lunas. Lewat = warning.">
                <input autoComplete="off"
                  type="date"
                  value={deadlinePelunasan}
                  onChange={(e) => setDeadlinePelunasan(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <div className="flex items-center text-xs text-purple-800 italic">
                💡 Skip DP — Item ini langsung masuk fase Pelunasan.<br />
                Request payment akan auto-set ke nominal total {fmtIDR(totalFinal) ? '(Rp ' + fmtIDR(totalFinal) + ')' : ''}.
              </div>
            </div>
          )}

          {/* Status preview */}
          <div className="bg-white rounded p-2 border border-purple-200 text-[11px]">
            <p className="font-bold text-slate-700">Setelah simpan:</p>
            <ul className="mt-1 space-y-0.5 text-slate-600">
              <li>✓ Status awal: <b className="text-amber-700">belum bayar</b></li>
              <li>✓ Phase: <b className="text-purple-700">{skipDeposit ? 'pelunasan (langsung)' : 'deposit'}</b></li>
              <li>✓ Setelah Finance approve {skipDeposit ? 'pelunasan' : 'DP'} → status auto jadi <b className="text-blue-700">{skipDeposit ? 'lunas' : 'DP'}</b></li>
              {!skipDeposit && <li>✓ Setelah Finance approve pelunasan → status auto jadi <b className="text-green-700">lunas</b></li>}
            </ul>
          </div>
        </div>
      )}

      {/* Initial payment_status (kalau HPP) */}
      {type === 'hpp' && (
        <Field label="Payment Status Awal">
          <select name="payment_status" defaultValue="belum bayar" className={inputCls}>
            {(PAYMENT_STATUS_OPTS || ['belum bayar', 'DP', 'lunas', 'tidak perlu']).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      )}

      {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending || totalFinal <= 0} className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
        {pending ? 'Menyimpan...' : `Simpan Item — ${fmtIDR(totalFinal) ? 'Rp ' + fmtIDR(totalFinal) : ''}`}
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

const inputCls = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
