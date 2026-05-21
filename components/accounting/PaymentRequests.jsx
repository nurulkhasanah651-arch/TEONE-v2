'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approvePaymentRequest, rejectPaymentRequest } from '@/lib/actions/accounting';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';

export default function PaymentRequests({ requests = [], accounts = [], trips = [] }) {
  const [pending, startTransition] = useTransition();
  const [approving, setApproving] = useState(null); // request item that is being approved (modal data)
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const router = useRouter();

  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));

  async function handleApprove(formData) {
    if (!approving) return;
    startTransition(async () => {
      const result = await approvePaymentRequest(approving.id, formData);
      if (result?.error) {
        alert(result.error);
        return;
      }
      setApproving(null);
      router.refresh();
    });
  }

  async function handleReject() {
    if (!rejecting) return;
    startTransition(async () => {
      const result = await rejectPaymentRequest(rejecting.id, rejectReason);
      if (result?.error) {
        alert(result.error);
        return;
      }
      setRejecting(null);
      setRejectReason('');
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return null; // hide section kalau ga ada pending request
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-amber-300 bg-amber-100/60 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-amber-800 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-sm font-bold animate-pulse">{requests.length}</span>
            🔔 Pending Payment Requests dari Finance
          </h2>
          <span className="text-xs text-amber-700">Total: {fmtRupiah(requests.reduce((s, r) => s + (r.total_amount || 0), 0))}</span>
        </div>
        <div className="divide-y divide-amber-200">
          {requests.map((r) => {
            const trip = tripMap[r.trip_id];
            return (
              <div key={r.id} className="px-5 py-3 hover:bg-amber-50">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {trip && <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{trip.kode_trip || `#${trip.id}`}</span>}
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{r.category}</span>
                      <p className="text-sm font-bold text-slate-800">{r.component}</p>
                      {r.vendor_name && <span className="text-xs text-slate-600">🏢 {r.vendor_name}</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Requested by <strong>{r.payment_requested_by || '—'}</strong> · {fmtDate(r.payment_requested_at)}
                      {r.payment_requested_note && (
                        <>
                          <br /><span className="italic">"{r.payment_requested_note}"</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-bold text-amber-700">{fmtRupiah(r.total_amount)}</p>
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
                        ✓ Approve
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
              <p className="text-lg font-bold text-amber-700 mt-2">{fmtRupiah(approving.total_amount)}</p>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Tanggal Transfer <span className="text-red-500">*</span></span>
              <input
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

            <p className="text-[11px] text-slate-500">
              Saat approve: HPP item akan di-mark "lunas" di Finance, dan cash OUT akan masuk ke Accounting dengan tanggal transfer di atas.
            </p>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setApproving(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded font-semibold">Batal</button>
              <button type="submit" disabled={pending} className="px-5 py-2 bg-green-500 text-white text-sm font-semibold rounded hover:bg-green-600 disabled:opacity-50">
                {pending ? 'Memproses...' : '✓ Approve & Mark Lunas'}
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
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Alasan Reject</span>
              <textarea
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
