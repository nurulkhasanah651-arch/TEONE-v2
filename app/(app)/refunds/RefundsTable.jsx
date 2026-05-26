'use client';

// Round 116: Refunds list table with approve/reject buttons
// Path: app/(app)/refunds/RefundsTable.jsx

import { useState, useTransition } from 'react';
import { approveRefund, rejectRefund, undoRefund } from '@/lib/actions/refunds';

const REASON_LABEL = {
  cancel: '❌ Cancel sendiri',
  visa_rejected: '🚫 Visa ditolak',
  medical: '🏥 Medis',
  force_majeure: '⚠️ Force majeure',
  other: '📝 Lainnya',
};

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

const STATUS_BADGE = {
  pending_approval: { label: '⏳ Pending Approval', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  approved: { label: '✓ Approved', color: 'bg-green-100 text-green-800 border-green-300' },
  rejected: { label: '✕ Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
  completed: { label: '🎉 Completed', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-700 border-slate-300' },
};

export default function RefundsTable({ refunds = [], userEmail = '' }) {
  const [pending, startTransition] = useTransition();
  const [actionMsg, setActionMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  function handleApprove(refundId) {
    if (!confirm('Approve refund ini?\n\nAkibatnya:\n• Peserta akan jadi status "refunded"\n• HPP item "Refund" otomatis dibuat di trip\n• Saldo bank otomatis kurang (cash out)\n• Invoice unpaid peserta di-cancel')) return;
    setActionMsg('');
    startTransition(async () => {
      const r = await approveRefund(refundId, userEmail);
      if (r?.error) setActionMsg('❌ ' + r.error);
      else { setActionMsg('✓ Refund approved + HPP item dibuat'); window.location.reload(); }
    });
  }

  function handleReject(refundId) {
    const reason = prompt('Alasan reject refund:');
    if (reason === null) return;
    setActionMsg('');
    startTransition(async () => {
      const r = await rejectRefund(refundId, reason, userEmail);
      if (r?.error) setActionMsg('❌ ' + r.error);
      else { setActionMsg('✓ Refund rejected'); window.location.reload(); }
    });
  }

  function handleUndo(refundId) {
    if (!confirm('Undo refund? Ini akan hapus HPP item + restore peserta jadi active.')) return;
    setActionMsg('');
    startTransition(async () => {
      const r = await undoRefund(refundId);
      if (r?.error) setActionMsg('❌ ' + r.error);
      else { setActionMsg('✓ Refund undone'); window.location.reload(); }
    });
  }

  if (refunds.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
        <p className="text-4xl mb-3">💸</p>
        <p className="text-lg font-bold text-slate-700">Belum ada refund</p>
        <p className="mt-1 text-sm text-slate-500">Refund peserta muncul di sini setelah CS request via tombol "💸 Refund" di trip.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      {actionMsg && (
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 text-sm">{actionMsg}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Peserta</th>
              <th className="px-4 py-3 text-left">Trip</th>
              <th className="px-4 py-3 text-left">Alasan</th>
              <th className="px-4 py-3 text-right">Total Dibayar</th>
              <th className="px-4 py-3 text-right">Refund</th>
              <th className="px-4 py-3 text-right">Admin Fee</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {refunds.map((r) => {
              const isExpanded = expandedId === r.id;
              const statusCfg = STATUS_BADGE[r.status] || STATUS_BADGE.pending_approval;
              return (
                <>
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{r.passenger_name || '—'}</p>
                      {r.passenger_phone && <p className="text-xs text-slate-500">📞 {r.passenger_phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs">{r.trip_kode || '—'}</p>
                      <p className="text-xs text-slate-600">{r.trip_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-xs">{REASON_LABEL[r.reason] || r.reason}</p>
                      {r.reason_detail && (
                        <p className="text-[10px] text-slate-500 italic line-clamp-2">"{r.reason_detail}"</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmtRupiah(r.total_paid)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-green-700">{fmtRupiah(r.refund_amount)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-700">{fmtRupiah(r.admin_fee)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold border ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <p className="text-[10px] text-slate-500 mt-1">{fmtDate(r.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap justify-center">
                        {r.status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => handleApprove(r.id)}
                              disabled={pending}
                              className="text-xs px-2 py-1 rounded bg-green-500 hover:bg-green-600 text-white font-bold disabled:opacity-50"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleReject(r.id)}
                              disabled={pending}
                              className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold disabled:opacity-50"
                            >
                              ✕ Reject
                            </button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <button
                            onClick={() => handleUndo(r.id)}
                            disabled={pending}
                            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold disabled:opacity-50"
                          >
                            ↩ Undo
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          <div>
                            <p className="font-bold text-slate-700 mb-1">Refund Method:</p>
                            <p>{r.refund_method || '—'}</p>
                            {r.refund_method === 'transfer' && (
                              <>
                                <p className="mt-1"><b>Bank:</b> {r.refund_bank_name || '—'}</p>
                                <p><b>No Rek:</b> <span className="font-mono">{r.refund_account_no || '—'}</span></p>
                                <p><b>A.N.:</b> {r.refund_account_name || '—'}</p>
                              </>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-700 mb-1">Timeline:</p>
                            <p>Requested: {fmtDate(r.created_at)}</p>
                            {r.approved_at && <p className="text-green-700">Approved: {fmtDate(r.approved_at)} by {r.approved_by}</p>}
                            {r.rejected_at && <p className="text-red-700">Rejected: {fmtDate(r.rejected_at)} by {r.rejected_by}</p>}
                            {r.reject_reason && <p className="italic mt-1">"{r.reject_reason}"</p>}
                          </div>
                          <div>
                            <p className="font-bold text-slate-700 mb-1">Notes:</p>
                            <p className="italic">{r.notes || '—'}</p>
                            {r.hpp_item_id && (
                              <p className="mt-1 text-blue-700">✓ HPP Item ID: <span className="font-mono text-[10px]">{r.hpp_item_id?.slice(0,8)}...</span></p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
