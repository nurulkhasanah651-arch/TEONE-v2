'use client';

// Round 85: FinanceItemRow — DP via Request Payment (input amount)
// Status awal: "Belum Dibayar". Setelah approved → DP amount masuk dp_paid

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteFinanceItem,
  requestPaymentToAccounting,
  cancelPaymentRequest,
  approvePayment,
} from '@/lib/actions/finance';

function fmtRupiah(n) {
  const v = Number(n) || 0;
  return 'Rp ' + v.toLocaleString('id-ID');
}
function fmtInput(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseInput(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}

function deriveStatus(item) {
  const total = Number(item.total_amount) || 0;
  const dp = Number(item.dp_paid) || 0;
  const reqStatus = item.payment_request_status;

  if (reqStatus === 'requested') {
    return { code: 'requested', label: '⏳ Request Approval', color: 'bg-amber-100 text-amber-800' };
  }
  if (reqStatus === 'rejected') {
    return { code: 'rejected', label: '✕ Rejected', color: 'bg-red-100 text-red-800' };
  }
  if (dp >= total && total > 0) {
    return { code: 'lunas', label: '💰 Lunas', color: 'bg-blue-100 text-blue-800' };
  }
  if (dp > 0) {
    return { code: 'dp_paid', label: '💵 DP Sudah Dibayar', color: 'bg-green-100 text-green-800' };
  }
  return { code: 'pending', label: '❌ Belum Dibayar', color: 'bg-slate-100 text-slate-700' };
}

export default function FinanceItemRow({ item, tripId, isFinance = false }) {
  const i = item;
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqAmount, setReqAmount] = useState('');
  const [reqNote, setReqNote] = useState('');

  const total = Number(i.total_amount) || 0;
  const dp = Number(i.dp_paid) || 0;
  const sisa = Math.max(total - dp, 0);
  const reqAmt = Number(i.payment_request_amount) || 0;
  const status = deriveStatus(i);

  function handleDelete() {
    if (!confirm(`Hapus item "${i.category} — ${i.component}"?`)) return;
    startTransition(async () => {
      const r = await deleteFinanceItem(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function handleRequestPayment() {
    const amt = parseInt(reqAmount) || 0;
    if (amt <= 0) { alert('Masukkan jumlah yang valid'); return; }
    if (amt > sisa) {
      if (!confirm(`Jumlah ${fmtRupiah(amt)} > sisa ${fmtRupiah(sisa)}. Lanjut?`)) return;
    }
    startTransition(async () => {
      const r = await requestPaymentToAccounting(i.id, tripId, reqNote, amt);
      if (r?.error) alert(r.error);
      setShowReqForm(false);
      setReqAmount('');
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
    if (!confirm(`Approve payment ${fmtRupiah(reqAmt)} untuk "${i.category} — ${i.component}"?\n\nDP akan ter-update otomatis.`)) return;
    startTransition(async () => {
      const r = await approvePayment(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  // Pre-fill request amount: sisa kalau ada, atau total kalau belum bayar
  function openRequestForm() {
    setReqAmount(String(sisa > 0 ? sisa : total));
    setShowReqForm(true);
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
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.color}`}>
              {status.label}
            </span>
          </div>

          {i.item_type === 'hpp' ? (
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              <div className="bg-slate-50 rounded px-2 py-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total</p>
                <p className="font-bold text-slate-800">{fmtRupiah(total)}</p>
              </div>
              <div className={dp > 0 ? 'bg-green-50 rounded px-2 py-1' : 'bg-slate-50 rounded px-2 py-1'}>
                <p className={`text-[10px] uppercase tracking-wider ${dp > 0 ? 'text-green-700' : 'text-slate-500'}`}>DP Dibayar</p>
                <p className={`font-bold ${dp > 0 ? 'text-green-800' : 'text-slate-500'}`}>{fmtRupiah(dp)}</p>
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

          {/* Show pending request amount */}
          {status.code === 'requested' && reqAmt > 0 && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              📨 Request: <span className="font-bold">{fmtRupiah(reqAmt)}</span>
              {i.payment_requested_note && <span className="block mt-0.5 italic">"{i.payment_requested_note}"</span>}
              {i.payment_requested_by && <span className="block mt-0.5 text-amber-600">by {i.payment_requested_by}</span>}
            </div>
          )}
        </div>

        <div className="flex gap-1 flex-wrap">
          {/* HPP actions */}
          {i.item_type === 'hpp' && status.code !== 'requested' && sisa > 0 && (
            <button
              type="button"
              onClick={openRequestForm}
              disabled={pending}
              className="px-2 py-1 text-xs font-semibold rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
            >
              📨 Request Bayar
            </button>
          )}

          {i.item_type === 'hpp' && status.code === 'requested' && (
            <>
              {isFinance && (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={pending}
                  className="px-2 py-1 text-xs font-semibold rounded bg-green-100 hover:bg-green-200 text-green-800"
                >
                  ✓ Approve {fmtRupiah(reqAmt)}
                </button>
              )}
              <button
                type="button"
                onClick={handleCancelRequest}
                disabled={pending}
                className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                ✕ Batal
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

      {/* Request payment form */}
      {showReqForm && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded space-y-2">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Request Payment ke Finance/Owner</p>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Jumlah yang Di-Request (Rp)</span>
            <input
              type="text"
              inputMode="numeric"
              value={fmtInput(reqAmount)}
              onChange={(e) => setReqAmount(parseInput(e.target.value))}
              placeholder={`Max sisa: ${fmtRupiah(sisa)}`}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">Default = sisa. Bisa input partial (mis. DP saja).</span>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Catatan (Opsional)</span>
            <input
              type="text"
              value={reqNote}
              onChange={(e) => setReqNote(e.target.value)}
              placeholder="Catatan untuk Finance/Owner"
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowReqForm(false); setReqAmount(''); setReqNote(''); }}
              className="px-3 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleRequestPayment}
              disabled={pending || !reqAmount}
              className="px-3 py-1 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
            >
              📨 Kirim Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
