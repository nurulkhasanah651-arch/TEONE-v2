'use client';

// Round 174: PayslipForm — + upload bukti transfer + download + TL per-trip aware
// Path: components/hr/PayslipForm.jsx

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPaymentProof, deletePaymentProof, getPaymentProofSignedUrl } from '@/lib/actions/payroll';

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const isTLPerTrip = entry.entry_type === 'per_trip';

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
    if (!confirm('Tandai slip ini sebagai PAID? (tanpa upload bukti)')) return;
    startTransition(async () => {
      const r = await markPaidAction(entry.id);
      if (r?.error) setError(r.error);
      else { setSuccess('✓ Marked as paid'); router.refresh(); }
    });
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(''); setSuccess(''); setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const r = await uploadPaymentProof(entry.id, formData);
    setUploading(false);

    if (r?.error) setError(r.error);
    else {
      setSuccess('✓ Bukti transfer uploaded + status PAID');
      router.refresh();
    }
  }

  async function handleDownloadProof() {
    const r = await getPaymentProofSignedUrl(entry.id);
    if (r?.error) { setError(r.error); return; }
    window.open(r.url, '_blank');
  }

  async function handleDeleteProof() {
    if (!confirm('Hapus bukti transfer ini?')) return;
    startTransition(async () => {
      const r = await deletePaymentProof(entry.id);
      if (r?.error) setError(r.error);
      else { setSuccess('✓ Bukti dihapus'); router.refresh(); }
    });
  }

  return (
    <>
      {/* TL trip info kalau per-trip */}
      {isTLPerTrip && entry.trip_kode && (
        <div className="bg-pink-50 border-2 border-pink-200 rounded-xl p-4">
          <p className="text-xs font-bold text-pink-800 uppercase tracking-wider mb-1">✈ TL Per-Trip Payment</p>
          <p className="text-lg font-bold text-pink-900">{entry.trip_kode} — {entry.trip_name}</p>
          {entry.trip_departure && (
            <p className="text-xs text-pink-700 mt-1">
              Departure: {new Date(entry.trip_departure).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* R174: Payment Proof Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">💸 Bukti Transfer</p>

        {entry.payment_proof_url ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 font-bold">✓ PAID</span>
              {entry.paid_at && (
                <span className="text-xs text-slate-500">
                  on {new Date(entry.paid_at).toLocaleString('id-ID')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={handleDownloadProof} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded">
                📥 Download Bukti
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-semibold rounded disabled:opacity-50">
                🔄 Ganti Bukti
              </button>
              <button type="button" onClick={handleDeleteProof} disabled={pending} className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold rounded disabled:opacity-50">
                🗑 Hapus
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">
              Upload screenshot/foto bukti transfer. Setelah upload, status otomatis jadi <strong>PAID</strong>.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded disabled:opacity-50"
              >
                {uploading ? '⏳ Uploading...' : '📤 Upload Bukti + Mark Paid'}
              </button>
              <button type="button" onClick={handleMarkPaid} disabled={pending} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded disabled:opacity-50">
                💸 Mark Paid (tanpa bukti)
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Max 10MB · JPG/PNG/PDF</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      <form action={handleSubmit} className="space-y-4">
        {/* EARNINGS — kalau TL per-trip, beda layout */}
        {isTLPerTrip ? (
          <Section title="✈ Trip Fee">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Fee per Trip Ini"><NumberInput name="per_trip_earnings" value={form.per_trip_earnings} onChange={(v) => upd('per_trip_earnings', v)} /></Field>
              <Field label="Bonus (opsional)"><NumberInput name="bonus" value={form.bonus} onChange={(v) => upd('bonus', v)} /></Field>
              <Field label="Other Earnings"><NumberInput name="other_earnings" value={form.other_earnings} onChange={(v) => upd('other_earnings', v)} /></Field>
            </div>
            {/* Hidden inputs for non-applicable fields */}
            <input type="hidden" name="base_salary" value={form.base_salary} />
            <input type="hidden" name="transport_allowance" value={form.transport_allowance} />
            <input type="hidden" name="meal_allowance" value={form.meal_allowance} />
            <input type="hidden" name="overtime" value={form.overtime} />
            <input type="hidden" name="trip_count" value={form.trip_count} />
            <input type="hidden" name="freelance_earnings" value={form.freelance_earnings} />
          </Section>
        ) : (
          <Section title="⬆ Earnings (Penghasilan)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Gaji Pokok"><NumberInput name="base_salary" value={form.base_salary} onChange={(v) => upd('base_salary', v)} /></Field>
              <Field label="Tunjangan Transport"><NumberInput name="transport_allowance" value={form.transport_allowance} onChange={(v) => upd('transport_allowance', v)} /></Field>
              <Field label="Uang Makan"><NumberInput name="meal_allowance" value={form.meal_allowance} onChange={(v) => upd('meal_allowance', v)} /></Field>
              <Field label="Bonus"><NumberInput name="bonus" value={form.bonus} onChange={(v) => upd('bonus', v)} /></Field>
              <Field label="Overtime / Lembur"><NumberInput name="overtime" value={form.overtime} onChange={(v) => upd('overtime', v)} /></Field>
              <Field label="Other Earnings"><NumberInput name="other_earnings" value={form.other_earnings} onChange={(v) => upd('other_earnings', v)} /></Field>
            </div>
            <input type="hidden" name="per_trip_earnings" value={form.per_trip_earnings} />
            <input type="hidden" name="trip_count" value={form.trip_count} />
            <input type="hidden" name="freelance_earnings" value={form.freelance_earnings} />
          </Section>
        )}

        <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border-2 border-slate-200">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Gross Total</span>
          <span className="text-xl font-bold text-slate-800">{fmtIDR(grossTotal)}</span>
        </div>

        {/* DEDUCTIONS — TL biasanya tidak ada potongan, tapi tetap ada */}
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
