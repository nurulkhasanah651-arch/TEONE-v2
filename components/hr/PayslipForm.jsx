'use client';

// Round 171: PayslipForm — edit slip gaji individual
// Path: components/hr/PayslipForm.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

function fmtIDR(v) {
  if (v == null || v === '') return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseNum(s) {
  return s == null ? '' : String(s).replace(/[^0-9]/g, '');
}

export default function PayslipForm({ entry, action, markPaidAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    base_salary: entry.base_salary || 0,
    transport_allowance: entry.transport_allowance || 0,
    meal_allowance: entry.meal_allowance || 0,
    bonus: entry.bonus || 0,
    overtime: entry.overtime || 0,
    per_trip_earnings: entry.per_trip_earnings || 0,
    trip_count: entry.trip_count || 0,
    freelance_earnings: entry.freelance_earnings || 0,
    other_earnings: entry.other_earnings || 0,
    pph21: entry.pph21 || 0,
    bpjs_kesehatan: entry.bpjs_kesehatan || 0,
    bpjs_ketenagakerjaan: entry.bpjs_ketenagakerjaan || 0,
    kasbon: entry.kasbon || 0,
    late_penalty: entry.late_penalty || 0,
    other_deductions: entry.other_deductions || 0,
    notes: entry.notes || '',
  });

  function upd(k, v) { setForm((s) => ({ ...s, [k]: v })); }

  // Live calculation
  const grossTotal = ['base_salary','transport_allowance','meal_allowance','bonus','overtime','per_trip_earnings','freelance_earnings','other_earnings']
    .reduce((s, k) => s + (parseInt(form[k]) || 0), 0);
  const totalDeductions = ['pph21','bpjs_kesehatan','bpjs_ketenagakerjaan','kasbon','late_penalty','other_deductions']
    .reduce((s, k) => s + (parseInt(form[k]) || 0), 0);
  const netPay = grossTotal - totalDeductions;

  async function handleSubmit(formData) {
    setError(''); setSuccess('');
    startTransition(async () => {
      const r = await action(formData);
      if (r?.error) setError(r.error);
      else { setSuccess('✓ Tersimpan'); router.refresh(); }
    });
  }

  async function handleMarkPaid() {
    if (!confirm('Tandai slip ini sebagai PAID?')) return;
    startTransition(async () => {
      const r = await markPaidAction(entry.id);
      if (r?.error) setError(r.error);
      else { setSuccess('✓ Marked as paid'); router.refresh(); }
    });
  }

  return (
    <>
      {entry.status !== 'paid' && (
        <button
          type="button"
          onClick={handleMarkPaid}
          disabled={pending}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded disabled:opacity-50"
        >
          💸 Mark as Paid
        </button>
      )}

      <form action={handleSubmit} className="space-y-4">
        {/* EARNINGS */}
        <Section title="⬆ Earnings (Penghasilan)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Gaji Pokok"><NumberInput name="base_salary" value={form.base_salary} onChange={(v) => upd('base_salary', v)} /></Field>
            <Field label="Tunjangan Transport"><NumberInput name="transport_allowance" value={form.transport_allowance} onChange={(v) => upd('transport_allowance', v)} /></Field>
            <Field label="Uang Makan"><NumberInput name="meal_allowance" value={form.meal_allowance} onChange={(v) => upd('meal_allowance', v)} /></Field>
            <Field label="Bonus"><NumberInput name="bonus" value={form.bonus} onChange={(v) => upd('bonus', v)} /></Field>
            <Field label="Overtime / Lembur"><NumberInput name="overtime" value={form.overtime} onChange={(v) => upd('overtime', v)} /></Field>
            {entry.employee?.employment_type === 'tour_leader' && (
              <>
                <Field label={`Per-Trip Earnings (${form.trip_count} trip)`}>
                  <NumberInput name="per_trip_earnings" value={form.per_trip_earnings} onChange={(v) => upd('per_trip_earnings', v)} />
                </Field>
                <Field label="Jumlah Trip Bulan Ini">
                  <input type="number" name="trip_count" value={form.trip_count} onChange={(e) => upd('trip_count', parseInt(e.target.value)||0)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </Field>
              </>
            )}
            {entry.employee?.employment_type === 'freelance' && (
              <Field label="Freelance Earnings (manual)"><NumberInput name="freelance_earnings" value={form.freelance_earnings} onChange={(v) => upd('freelance_earnings', v)} /></Field>
            )}
            <Field label="Other Earnings"><NumberInput name="other_earnings" value={form.other_earnings} onChange={(v) => upd('other_earnings', v)} /></Field>
          </div>
          {/* Hidden inputs for non-shown fields */}
          {entry.employee?.employment_type !== 'tour_leader' && (
            <>
              <input type="hidden" name="per_trip_earnings" value={form.per_trip_earnings} />
              <input type="hidden" name="trip_count" value={form.trip_count} />
            </>
          )}
          {entry.employee?.employment_type !== 'freelance' && <input type="hidden" name="freelance_earnings" value={form.freelance_earnings} />}

          <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border-2 border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Gross Total</span>
            <span className="text-xl font-bold text-slate-800">{fmtIDR(grossTotal)}</span>
          </div>
        </Section>

        {/* DEDUCTIONS */}
        <Section title="⬇ Deductions (Potongan)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="PPh 21 (Pajak)"><NumberInput name="pph21" value={form.pph21} onChange={(v) => upd('pph21', v)} /></Field>
            <Field label="BPJS Kesehatan"><NumberInput name="bpjs_kesehatan" value={form.bpjs_kesehatan} onChange={(v) => upd('bpjs_kesehatan', v)} /></Field>
            <Field label="BPJS Ketenagakerjaan"><NumberInput name="bpjs_ketenagakerjaan" value={form.bpjs_ketenagakerjaan} onChange={(v) => upd('bpjs_ketenagakerjaan', v)} /></Field>
            <Field label="Kasbon (Pinjaman)"><NumberInput name="kasbon" value={form.kasbon} onChange={(v) => upd('kasbon', v)} /></Field>
            <Field label="Denda Telat"><NumberInput name="late_penalty" value={form.late_penalty} onChange={(v) => upd('late_penalty', v)} /></Field>
            <Field label="Other Deductions"><NumberInput name="other_deductions" value={form.other_deductions} onChange={(v) => upd('other_deductions', v)} /></Field>
          </div>

          <div className="p-3 bg-red-50 rounded-lg flex items-center justify-between border-2 border-red-200">
            <span className="text-xs font-bold uppercase tracking-wider text-red-700">Total Potongan</span>
            <span className="text-xl font-bold text-red-700">- {fmtIDR(totalDeductions)}</span>
          </div>
        </Section>

        {/* NET PAY */}
        <div className="p-5 bg-gradient-to-br from-green-500 to-emerald-700 text-white rounded-xl shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">💰 Net Pay (yang dicairkan)</p>
              <p className="text-[10px] opacity-70 mt-0.5">Akan ditransfer ke {entry.employee?.bank_name || '?'}: {entry.employee?.bank_account_number || '?'}</p>
            </div>
            <p className="text-3xl font-bold">{fmtIDR(netPay)}</p>
          </div>
        </div>

        <Field label="Catatan slip">
          <textarea name="notes" rows="2" value={form.notes} onChange={(e) => upd('notes', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-y" />
        </Field>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

        <div className="sticky bottom-0 py-3 px-2 bg-white/90 backdrop-blur border-t border-slate-200 flex items-center justify-end gap-2 -mx-2">
          <button type="submit" disabled={pending} className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
            {pending ? '⏳ Menyimpan...' : '💾 Simpan Perubahan'}
          </button>
        </div>
      </form>
    </>
  );
}

function NumberInput({ name, value, onChange }) {
  return (
    <input
      type="text"
      name={name}
      inputMode="numeric"
      value={fmtIDR(value)}
      onChange={(e) => onChange(parseNum(e.target.value))}
      onFocus={(e) => e.target.select()}
      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
    />
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  );
}
