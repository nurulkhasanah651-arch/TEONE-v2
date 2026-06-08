'use client';

// Round 115: Button + Modal untuk refund peserta (cancel/visa rejected/dll)
// File: components/trips/RefundPassengerButton.jsx

import { useState, useEffect, useTransition } from 'react';
import { createRefund, getPassengerTotalPaid } from '@/lib/actions/refunds';

const REFUND_REASONS = [
  { value: 'cancel', label: 'Cancel sendiri', icon: '❌' },
  { value: 'visa_rejected', label: 'Visa ditolak', icon: '🚫' },
  { value: 'medical', label: 'Sakit / medis', icon: '🏥' },
  { value: 'force_majeure', label: 'Force majeure', icon: '⚠️' },
  { value: 'other', label: 'Lainnya', icon: '📝' },
];

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

function parseNum(s) {
  if (s == null) return 0;
  return Number(String(s).replace(/[^0-9]/g, '')) || 0;
}

function formatNum(n) {
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}

export default function RefundPassengerButton({ passenger }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [totalPaid, setTotalPaid] = useState(0);
  const [loadingTotal, setLoadingTotal] = useState(false);

  // Form state
  const [reason, setReason] = useState('cancel');
  const [reasonDetail, setReasonDetail] = useState('');
  const [refundAmountStr, setRefundAmountStr] = useState('');
  const [refundMethod, setRefundMethod] = useState('transfer');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [accountName, setAccountName] = useState('');
  const [notes, setNotes] = useState('');

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const refundAmount = parseNum(refundAmountStr);
  const adminFee = Math.max(totalPaid - refundAmount, 0);

  useEffect(() => {
    if (!open || !passenger?.id) return;
    setLoadingTotal(true);
    getPassengerTotalPaid(passenger.id).then((r) => {
      if (r?.ok) {
        setTotalPaid(r.total || 0);
        // Default refund amount = total paid (kalau full refund)
        setRefundAmountStr(formatNum(r.total || 0));
      }
      setLoadingTotal(false);
    });
  }, [open, passenger?.id]);

  // Kalau peserta udah refunded
  if (passenger.refund_status === 'refunded' || passenger.refund_status === 'partial_refund') {
    const label = passenger.refund_status === 'refunded' ? 'Refunded' : 'Partial Refund';
    const color = passenger.refund_status === 'refunded' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800';
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${color}`}>
        <span>💸</span>
        <span className="font-semibold">{label}</span>
        {passenger.refund_amount && (
          <span className="font-mono">· {fmtRupiah(passenger.refund_amount)}</span>
        )}
      </div>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (refundAmount < 0) {
      setError('Nominal refund tidak boleh negatif');
      return;
    }
    if (refundAmount > totalPaid) {
      if (!confirm(`Refund (${fmtRupiah(refundAmount)}) lebih besar dari total dibayar (${fmtRupiah(totalPaid)}). Lanjutkan?`)) return;
    }
    if (!confirm(`Yakin refund ${passenger.name}?\n\n• Total dibayar: ${fmtRupiah(totalPaid)}\n• Refund: ${fmtRupiah(refundAmount)}\n• Admin fee: ${fmtRupiah(adminFee)}\n\nPeserta akan jadi status "refunded".`)) return;

    startTransition(async () => {
      const r = await createRefund({
        passengerId: passenger.id,
        reason,
        reasonDetail,
        refundAmount,
        totalPaid,
        refundMethod,
        bankName,
        accountNo,
        accountName,
        notes,
      });
      if (r?.error) setError(r.error);
      else setResult(r);
    });
  }

  if (result?.ok) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <div className="text-center mb-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center text-3xl">
              ✓
            </div>
            <h2 className="text-lg font-bold text-green-700">Refund Berhasil Dicatat!</h2>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm space-y-1">
            <p><span className="text-slate-500">Peserta:</span> <span className="font-bold">{result.summary.passenger}</span></p>
            <p><span className="text-slate-500">Total dibayar:</span> <span className="font-bold">{fmtRupiah(result.summary.totalPaid)}</span></p>
            <p><span className="text-slate-500">Direfund:</span> <span className="font-bold text-green-700">{fmtRupiah(result.summary.refundAmount)}</span></p>
            <p><span className="text-slate-500">Admin fee:</span> <span className="font-bold text-amber-700">{fmtRupiah(result.summary.adminFee)}</span></p>
            <p><span className="text-slate-500">Status:</span> <span className="font-bold uppercase">{result.summary.status}</span></p>
          </div>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
            💡 Cek di tab /refunds untuk process refund (transfer ke rekening peserta).
          </div>
          <button
            onClick={() => { setOpen(false); setResult(null); window.location.reload(); }}
            className="mt-5 w-full py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg"
          >
            Tutup & Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(''); }}
        className="text-xs px-2 py-1 rounded border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 font-semibold"
        title="Refund peserta (cancel / visa ditolak / dll)"
      >
        💸 Refund
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={() => !pending && setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl my-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-red-700 mb-1">💸 Refund Peserta</h2>
            <p className="text-xs text-slate-500 mb-4">
              Peserta: <span className="font-semibold text-slate-800">{passenger.name}</span>
              {passenger.room_type && <span> · {passenger.room_type}</span>}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Total dibayar */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-600">Total Sudah Dibayar:</p>
                {loadingTotal ? (
                  <p className="text-sm italic text-slate-500">Loading...</p>
                ) : (
                  <p className="text-lg font-bold text-slate-800">{fmtRupiah(totalPaid)}</p>
                )}
              </div>

              {/* Alasan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Refund *</label>
                <div className="grid grid-cols-2 gap-2">
                  {REFUND_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={`p-2 text-xs rounded border-2 font-semibold transition-colors ${
                        reason === r.value
                          ? 'border-red-500 bg-red-50 text-red-800'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-base mr-1">{r.icon}</span>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Detail Alasan (opsional)</label>
                <textarea autoComplete="off"
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="Contoh: Visa Schengen ditolak tgl 15 Mei karena dokumen kurang"
                  rows={2}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg resize-none"
                />
              </div>

              {/* Nominal refund */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Refund (IDR) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
                  <input autoComplete="off"
                    type="text"
                    value={refundAmountStr}
                    onChange={(e) => setRefundAmountStr(formatNum(parseNum(e.target.value)))}
                    placeholder="0"
                    className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setRefundAmountStr(formatNum(totalPaid))}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    Full ({fmtRupiah(totalPaid)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundAmountStr(formatNum(Math.round(totalPaid * 0.9)))}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    90% (fee 10%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundAmountStr(formatNum(Math.round(totalPaid * 0.5)))}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundAmountStr('0')}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    0 (forfeit)
                  </button>
                </div>
              </div>

              {/* Summary calc */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Total dibayar:</span>
                  <span className="font-mono">{fmtRupiah(totalPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Direfund:</span>
                  <span className="font-mono text-green-700">−{fmtRupiah(refundAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-amber-300 pt-1 font-bold">
                  <span>Admin fee / forfeit:</span>
                  <span className="font-mono text-amber-700">{fmtRupiah(adminFee)}</span>
                </div>
              </div>

              {/* Refund method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Metode Refund</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="transfer">Transfer Bank</option>
                  <option value="cash">Cash</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>

              {refundMethod === 'transfer' && (
                <div className="space-y-2 p-3 bg-blue-50/50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-bold text-blue-800">Detail Rekening Tujuan:</p>
                  <input autoComplete="off"
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Nama Bank (BCA / Mandiri / dll)"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded"
                  />
                  <input autoComplete="off"
                    type="text"
                    value={accountNo}
                    onChange={(e) => setAccountNo(e.target.value)}
                    placeholder="Nomor Rekening"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                  <input autoComplete="off"
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Nama Pemilik Rekening"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan (opsional)</label>
                <textarea autoComplete="off"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">⚠ {error}</div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pending || loadingTotal}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg disabled:opacity-50"
                >
                  {pending ? 'Processing...' : '💸 Proses Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
