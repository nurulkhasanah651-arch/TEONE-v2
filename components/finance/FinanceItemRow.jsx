'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFinanceItem, updatePaymentStatus, requestPaymentToAccounting, cancelPaymentRequest } from '@/lib/actions/finance';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { PAYMENT_STATUS_CFG, PAYMENT_STATUS_OPTS } from '@/lib/utils/finance-constants';

export default function FinanceItemRow({ item, tripId }) {
  const [pending, startTransition] = useTransition();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const router = useRouter();
  const isHpp = item.item_type === 'hpp';
  const ps = item.payment_status ? PAYMENT_STATUS_CFG[item.payment_status] : null;
  const requestStatus = item.payment_request_status;

  async function handleDelete() {
    if (!confirm(`Hapus "${item.component}"?`)) return;
    startTransition(async () => {
      const result = await deleteFinanceItem(item.id, tripId);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    startTransition(async () => {
      const result = await updatePaymentStatus(item.id, tripId, newStatus);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  async function handleRequest() {
    startTransition(async () => {
      const result = await requestPaymentToAccounting(item.id, tripId, requestNote);
      if (result?.error) alert(result.error);
      setShowRequestModal(false);
      setRequestNote('');
      router.refresh();
    });
  }

  async function handleCancelRequest() {
    if (!confirm('Cancel payment request ini?')) return;
    startTransition(async () => {
      const result = await cancelPaymentRequest(item.id, tripId);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  const canRequest = isHpp && item.payment_status !== 'lunas' && !requestStatus;
  const isRequested = requestStatus === 'requested';
  const isApproved = requestStatus === 'approved';
  const isRejected = requestStatus === 'rejected';

  return (
    <>
      <div className="flex items-center justify-between gap-3 p-2 rounded hover:bg-slate-50 transition-colors flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{item.component}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {item.basic_fare > 0 && item.qty > 0 && `${fmtRupiah(item.basic_fare)} × ${item.qty}`}
            {item.vendor_name && ` · 🏢 ${item.vendor_name}`}
            {item.notes && ` · ${item.notes}`}
          </p>
          {/* Request status badge row */}
          {isRequested && (
            <p className="text-[11px] text-blue-700 font-semibold mt-1">
              ⏳ Requested ke Accounting · {item.payment_requested_by || ''} · {fmtDate(item.payment_requested_at)}
              {item.payment_requested_note && ` · "${item.payment_requested_note}"`}
            </p>
          )}
          {isApproved && (
            <p className="text-[11px] text-green-700 font-semibold mt-1">
              ✓ Approved & Transferred {fmtDate(item.transfer_date)} · {item.approved_by}
            </p>
          )}
          {isRejected && (
            <p className="text-[11px] text-red-700 font-semibold mt-1">
              ✗ Rejected oleh {item.approved_by}
              {item.payment_requested_note && ` · "${item.payment_requested_note}"`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isHpp && (
            <select
              value={item.payment_status || 'belum bayar'}
              onChange={handleStatusChange}
              disabled={pending || isApproved}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded border outline-none cursor-pointer ${ps ? `${ps.bg} ${ps.text} border-current` : 'bg-slate-100 text-slate-700 border-slate-300'} ${isApproved ? 'opacity-50' : ''}`}
            >
              {PAYMENT_STATUS_OPTS.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_CFG[s]?.label || s}</option>)}
            </select>
          )}
          <p className={`text-sm font-bold ${isHpp ? 'text-amber-700' : 'text-green-700'}`}>
            {fmtRupiah(item.total_amount)}
          </p>
          {/* Request action */}
          {canRequest && (
            <button
              onClick={() => setShowRequestModal(true)}
              disabled={pending}
              className="text-[11px] px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 font-semibold disabled:opacity-50"
            >
              🔔 Request Payment
            </button>
          )}
          {isRequested && (
            <button
              onClick={handleCancelRequest}
              disabled={pending}
              className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold disabled:opacity-50"
            >
              Cancel Request
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={pending || isApproved}
            className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors disabled:opacity-50"
            title={isApproved ? 'Sudah approved, tidak bisa dihapus' : 'Hapus item'}
          >
            🗑
          </button>
        </div>
      </div>

      {/* Request modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowRequestModal(false)}>
          <div className="bg-white rounded-xl shadow-card-hover max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-brand-700">🔔 Request Payment to Accounting</h3>
            <p className="text-sm text-slate-600">
              Item: <strong>{item.component}</strong>
              {item.vendor_name && <> · 🏢 {item.vendor_name}</>}
              <br />
              Nominal: <strong>{fmtRupiah(item.total_amount)}</strong>
            </p>
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Catatan untuk Accounting (opsional)</span>
              <textarea
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                rows="3"
                placeholder="Contoh: Tolong transfer ASAP, deadline besok"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none resize-none"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRequestModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded font-semibold">Batal</button>
              <button onClick={handleRequest} disabled={pending} className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded hover:bg-blue-600 disabled:opacity-50">
                {pending ? 'Mengirim...' : 'Kirim Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
