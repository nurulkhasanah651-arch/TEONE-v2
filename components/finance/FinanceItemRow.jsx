'use client';

// Round 82: FinanceItemRow — display Total/DP/Sisa + Request Payment + Approve

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteFinanceItem,
  requestPaymentToAccounting,
  cancelPaymentRequest,
  approvePayment,
} from '@/lib/actions/finance';
import { PAYMENT_REQ_STATUS } from '@/lib/utils/finance-constants';

function fmtRupiah(n) {
  const v = Number(n) || 0;
  return 'Rp ' + v.toLocaleString('id-ID');
}

export default function FinanceItemRow({ item, tripId, isFinance = false }) {
  const i = item;
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [showReqNote, setShowReqNote] = useState(false);
  const [reqNote, setReqNote] = useState('');

  const total = Number(i.total_amount) || 0;
  const dp = Number(i.dp_paid) || 0;
  const sisa = Math.max(total - dp, 0);
  const reqStatus = i.payment_request_status || (i.payment_status === 'lunas' ? 'paid' : 'pending');
  const statusCfg = PAYMENT_REQ_STATUS[reqStatus] || PAYMENT_REQ_STATUS.pending;

  function handleDelete() {
    if (!confirm(`Hapus item "${i.category} — ${i.component}"?`)) return;
    startTransition(async () => {
      const r = await deleteFinanceItem(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function handleRequestPayment() {
    if (!reqNote.trim() && !confirm('Lanjut request tanpa catatan?')) return;
    startTransition(async () => {
      const r = await requestPaymentToAccounting(i.id, tripId, reqNote);
      if (r?.error) alert(r.error);
      setShowReqNote(false);
      setReqNote('');
      router.refresh();
    });
  }

  function handleCancelRequest() {
    if (!confirm('Batalkan permintaan payment?')) return;
    startTransition(async () => {
      const r = await cancelPaymentRequest(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function handleApprove() {
    if (!confirm(`Approve payment ${fmtRupiah(sisa || total)} untuk "${i.category} — ${i.component}"?`)) return;
    startTransition(async () => {
      const r = await approvePayment(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  return (
    <div className="p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-bold text-brand-700">{i.category}</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-sm font-semibold text-slate-800">{i.component}</span>
            {i.vendor_name && <span className="text-[11px] text-slate-500">({i.vendor_name})</span>}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>

          {i.item_type === 'hpp' ? (
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              <div className="bg-slate-50 rounded px-2 py-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total</p>
                <p className="font-bold text-slate-800">{fmtRupiah(total)}</p>
              </div>
              <div className="bg-green-50 rounded px-2 py-1">
                <p className="text-[10px] text-green-700 uppercase tracking-wider">DP Dibayar</p>
                <p className="font-bold text-green-800">{fmtRupiah(dp)}</p>
              </div>
              <div className={`rounded px-2 py-1 ${sisa > 0 ? 'bg-amber-50' : 'bg-blue-50'}`}>
                <p className={`text-[10px] uppercase tracking-wider ${sisa > 0 ? 'text-amber-700' : 'text-blue-700'}`}>Sisa</p>
                <p className={`font-bold ${sisa > 0 ? 'text-amber-800' : 'text-blue-800'}`}>{fmtRupiah(sisa)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm font-bold text-green-700 mt-1">{fmtRupiah(total)}</p>
          )}

          {i.notes && <p className="text-[11px] text-slate-500 mt-1.5 italic">📝 {i.notes}</p>}
          {i.payment_requested_note && (
            <p className="text-[11px] text-amber-700 mt-1 bg-amber-50 px-2 py-1 rounded">
              📨 Request note: {i.payment_requested_note}
            </p>
          )}
        </div>

        <div className="flex gap-1 flex-wrap">
          {/* HPP actions */}
          {i.item_type === 'hpp' && reqStatus === 'pending' && (
            <button
              type="button"
              onClick={() => setShowReqNote(!showReqNote)}
              disabled={pending}
              className="px-2 py-1 text-xs font-semibold rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
            >
              📨 Request Payment
            </button>
          )}

          {i.item_type === 'hpp' && reqStatus === 'requested' && (
            <>
              {isFinance && (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={pending}
                  className="px-2 py-1 text-xs font-semibold rounded bg-green-100 hover:bg-green-200 text-green-800"
                >
                  ✓ Approve / Lunas
                </button>
              )}
              <button
                type="button"
                onClick={handleCancelRequest}
                disabled={pending}
                className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                ✕ Batal Request
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="px-2 py-1 text-xs font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Request note form */}
      {showReqNote && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded space-y-2">
          <input
            type="text"
            value={reqNote}
            onChange={(e) => setReqNote(e.target.value)}
            placeholder="Catatan untuk Finance/Owner (opsional)"
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowReqNote(false); setReqNote(''); }}
              className="px-3 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleRequestPayment}
              disabled={pending}
              className="px-3 py-1 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-600 text-white"
            >
              📨 Kirim Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
