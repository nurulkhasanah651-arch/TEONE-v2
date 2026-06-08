'use client';

// Round 184: PaymentRequests — + view Invoice + upload bukti transfer di approve modal
// Path: components/accounting/PaymentRequests.jsx

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { approvePaymentRequest, rejectPaymentRequest } from '@/lib/actions/accounting';
import { getInvoiceSignedUrl, uploadTransferProof } from '@/lib/actions/hpp-documents';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';

// Helper untuk dapat nominal yg di-request (DP atau Pelunasan)
function getRequestAmount(item) {
  const reqAmt = Number(item.payment_request_amount || 0);
  if (reqAmt > 0) return reqAmt;
  // Fallback untuk legacy data tanpa payment_request_amount
  return Number(item.total_amount || 0);
}

function getPhaseLabel(item) {
  const phase = item.payment_phase || '';
  if (phase === 'deposit') return '70% DP';
  if (phase === 'pelunasan') return 'Pelunasan';
  return phase || 'Payment';
}

export default function PaymentRequests({ requests = [], accounts = [], trips = [] }) {
  const [pending, startTransition] = useTransition();
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const router = useRouter();
  const proofFileRef = useRef(null); // R184: bukti transfer

  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));

  async function handleViewInvoice(itemId) {
    const r = await getInvoiceSignedUrl(itemId);
    if (r?.error) alert(r.error);
    else window.open(r.url, '_blank');
  }

  async function handleApprove(formData) {
    if (!approving) return;
    startTransition(async () => {
      // R184: approve dulu
      const result = await approvePaymentRequest(approving.id, formData);
      if (result?.error) { alert(result.error); return; }

      // R184: upload bukti transfer kalau ada file
      const file = proofFileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append('proof_file', file);
        const upRes = await uploadTransferProof(approving.id, fd);
        if (upRes?.error) {
          alert('Approve sukses, tapi upload bukti transfer gagal: ' + upRes.error);
        }
        if (proofFileRef.current) proofFileRef.current.value = '';
      }

      setApproving(null);
      router.refresh();
    });
  }

  async function handleReject() {
    if (!rejecting) return;
    startTransition(async () => {
      const result = await rejectPaymentRequest(rejecting.id, rejectReason);
      if (result?.error) { alert(result.error); return; }
      setRejecting(null);
      setRejectReason('');
      router.refresh();
    });
  }

  if (requests.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  // R180c: total = sum dari payment_request_amount (bukan total_amount)
  const sumRequested = requests.reduce((s, r) => s + getRequestAmount(r), 0);

  return (
    <>
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-300 bg-amber-100/60 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-amber-800 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-sm font-bold animate-pulse">{requests.length}</span>
            🔔 Pending Payment Requests dari Finance
          </h2>
          <span className="text-xs text-amber-700">Total Diajukan: {fmtRupiah(sumRequested)}</span>
        </div>
        <div className="divide-y divide-amber-200">
          {requests.map((r) => {
            const trip = tripMap[r.trip_id];
            const reqAmt = getRequestAmount(r);
            const phaseLabel = getPhaseLabel(r);
            const totalItem = Number(r.total_amount || 0);
            const dpPaid = Number(r.dp_paid || 0);
            const isPartial = reqAmt < totalItem;

            return (
              <div key={r.id} className="px-5 py-3 hover:bg-amber-50">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {trip && <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{trip.kode_trip || `#${trip.id}`}</span>}
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{r.category}</span>
                      <p className="text-sm font-bold text-slate-800">{r.component}</p>
                      {r.vendor_name && <span className="text-xs text-slate-600">🏢 {r.vendor_name}</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.payment_phase === 'pelunasan' ? 'bg-blue-100 text-blue-700' : 'bg-amber-200 text-amber-800'}`}>
                        📨 {phaseLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Requested by <strong>{r.payment_requested_by || '—'}</strong> · {fmtDate(r.payment_requested_at)}
                      {r.payment_requested_note && (
                        <>
                          <br /><span className="italic">"{r.payment_requested_note}"</span>
                        </>
                      )}
                    </p>
                    {/* R180c: Konteks total vs request */}
                    {isPartial && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        💡 Termin {phaseLabel}: <b className="text-amber-700">{fmtRupiah(reqAmt)}</b>
                        {' '}dari total tagihan <b>{fmtRupiah(totalItem)}</b>
                        {dpPaid > 0 && <> · Sudah dibayar: {fmtRupiah(dpPaid)}</>}
                      </p>
                    )}
                    {/* R184: Invoice link */}
                    {r.invoice_url && (
                      <button
                        type="button"
                        onClick={() => handleViewInvoice(r.id)}
                        className="mt-1 text-[11px] px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold inline-flex items-center gap-1"
                      >
                        📎 Lihat Invoice
                      </button>
                    )}
                    {!r.invoice_url && (
                      <p className="mt-1 text-[10px] text-amber-600 italic">⚠ Belum ada invoice di-attach</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {/* R180c: tampilkan amount yg di-request, BUKAN total_amount */}
                    <p className="text-xl font-bold text-amber-700">{fmtRupiah(reqAmt)}</p>
                    {isPartial && (
                      <p className="text-[10px] text-slate-500">Termin {phaseLabel}</p>
                    )}
                    <div className="mt-2 flex gap-2 justify-end">
                      <button
                        onClick={() => setRejecting(r)}
                        disabled={pending}
                        className="px-3 py-1 text-xs font-semibold rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        ✗ Reject
                      </button>
                      <button
                        onClick={() => setApproving(r)}
                        disabled={pending}
                        className="px-3 py-1 text-xs font-semibold rounded bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        ✓ Approve {fmtRupiah(reqAmt)}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Approve modal */}
      {approving && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setApproving(null)}>
          <form action={handleApprove} className="bg-white rounded-xl shadow-card-hover max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-brand-700">✓ Approve & Transfer Payment</h3>
            <div className="p-3 bg-slate-50 rounded space-y-1">
              <p className="text-xs text-slate-500">Item:</p>
              <p className="text-sm font-bold text-slate-800">{approving.component}</p>
              {approving.vendor_name && <p className="text-xs text-slate-600">🏢 {approving.vendor_name}</p>}
              <p className="text-[10px] uppercase font-bold text-slate-500 mt-2">Termin {getPhaseLabel(approving)}</p>
              <p className="text-2xl font-bold text-amber-700">{fmtRupiah(getRequestAmount(approving))}</p>
              {getRequestAmount(approving) < Number(approving.total_amount || 0) && (
                <p className="text-[11px] text-slate-500">
                  dari total tagihan {fmtRupiah(approving.total_amount)}
                  {Number(approving.dp_paid || 0) > 0 && <> · sudah dibayar {fmtRupiah(approving.dp_paid)}</>}
                </p>
              )}
            </div>

            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Tanggal Transfer <span className="text-red-500">*</span></span>
              <input autoComplete="off"
                type="date"
                name="transfer_date"
                defaultValue={today}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Transfer dari Akun <span className="text-red-500">*</span></span>
              <select
                name="account_id"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none bg-white"
              >
                <option value="">— Pilih akun —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </label>

            {/* R184: Upload bukti transfer */}
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">
                📥 Upload Bukti Transfer {approving.transfer_proof_url ? '(replace)' : '(opsional)'}
              </span>
              <input autoComplete="off"
                ref={proofFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-green-50 file:text-green-700 file:font-semibold"
              />
              <span className="text-[10px] text-slate-400">Bukti akan didownload oleh Finance untuk dikirim ke vendor. PDF/JPG max 10MB.</span>
              {approving.invoice_url && (
                <button
                  type="button"
                  onClick={() => handleViewInvoice(approving.id)}
                  className="mt-1 text-[10px] text-purple-600 hover:underline block"
                >
                  📎 Lihat Invoice yg di-attach Finance
                </button>
              )}
            </label>

            <p className="text-[11px] text-slate-500">
              Saat approve: nominal <b>{fmtRupiah(getRequestAmount(approving))}</b> akan ditambahkan ke dp_paid.
              {getRequestAmount(approving) >= (Number(approving.total_amount || 0) - Number(approving.dp_paid || 0))
                ? ' Status item jadi LUNAS.'
                : ' Status item jadi DP (parsial). Tunggu request Pelunasan berikutnya.'}
            </p>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setApproving(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded font-semibold">Batal</button>
              <button type="submit" disabled={pending} className="px-5 py-2 bg-green-500 text-white text-sm font-semibold rounded hover:bg-green-600 disabled:opacity-50">
                {pending ? 'Memproses...' : `✓ Approve ${fmtRupiah(getRequestAmount(approving))}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reject modal */}
      {rejecting && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="bg-white rounded-xl shadow-card-hover max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-brand-700">✗ Reject Payment Request</h3>
            <p className="text-sm text-slate-600">Item: <strong>{rejecting.component}</strong></p>
            <p className="text-sm text-slate-600">Termin: <strong>{getPhaseLabel(rejecting)} {fmtRupiah(getRequestAmount(rejecting))}</strong></p>
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Alasan Reject</span>
              <textarea autoComplete="off"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows="3"
                placeholder="Contoh: Saldo bank belum cukup, tunggu cicilan pelunasan peserta..."
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none resize-none"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejecting(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded font-semibold">Batal</button>
              <button onClick={handleReject} disabled={pending} className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded hover:bg-red-600 disabled:opacity-50">
                {pending ? 'Memproses...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
