'use client';

// Round 102: DP Approval Panel — di halaman Accounting
// Accounting lihat list DP request pending → approve/reject

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveDPRequest, rejectDPRequest, deleteDPRequest } from '@/lib/actions/dp';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}
function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

const STATUS_COLOR = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  approved: 'bg-green-100 text-green-800 border-green-300',
  rejected: 'bg-red-100 text-red-800 border-red-300',
};

export default function DPApprovalPanel({ requests = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('pending');  // pending | approved | rejected | all
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;
  const totalPendingAmount = requests
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  function handleApprove(req) {
    if (!confirm(
      `APPROVE DP ${fmtRupiah(req.amount)} untuk ${req.customer_name}?\n\n` +
      `→ Matrix DP akan auto-centang ✓\n` +
      `→ WA konfirmasi auto-kirim ke ${req.customer_phone || 'peserta'}`
    )) return;

    startTransition(async () => {
      const r = await approveDPRequest(req.id);
      if (r?.error) alert(r.error);
      else {
        const waMsg = r.wa_sent ? '✓ WA terkirim' : (r.wa_error || 'WA gagal dikirim');
        alert(`✓ DP approved!\n${waMsg}`);
      }
      router.refresh();
    });
  }

  function handleStartReject(id) {
    setRejectingId(id);
    setRejectReason('');
  }

  function handleConfirmReject(req) {
    if (!rejectReason.trim()) {
      alert('Reason wajib diisi');
      return;
    }
    startTransition(async () => {
      const r = await rejectDPRequest(req.id, rejectReason);
      if (r?.error) alert(r.error);
      setRejectingId(null);
      setRejectReason('');
      router.refresh();
    });
  }

  function handleDelete(req) {
    if (!confirm(`Hapus DP request ${fmtRupiah(req.amount)} untuk ${req.customer_name}?`)) return;
    startTransition(async () => {
      const r = await deleteDPRequest(req.id);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-brand-700 flex items-center gap-2">
            💵 DP Approval Queue
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                {pendingCount} pending
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            CS submit DP → Accounting approve → matrix centang + WA auto-kirim
            {totalPendingAmount > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">
                · Total pending: {fmtRupiah(totalPendingAmount)}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-5 py-2 border-b border-slate-200 flex gap-2 flex-wrap">
        {[
          { key: 'pending',  label: `Pending (${pendingCount})`,   color: 'bg-amber-100 text-amber-800' },
          { key: 'approved', label: `Approved (${approvedCount})`, color: 'bg-green-100 text-green-800' },
          { key: 'rejected', label: `Rejected (${rejectedCount})`, color: 'bg-red-100 text-red-800' },
          { key: 'all',      label: `All (${requests.length})`,    color: 'bg-slate-100 text-slate-800' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
              filter === t.key ? t.color + ' ring-2 ring-offset-1 ring-brand-400' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-3xl mb-2">💵</p>
          <p className="text-sm text-slate-600">
            {filter === 'pending' ? 'Tidak ada DP pending — semua sudah di-approve! 🎉' : 'Tidak ada data'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((req) => {
            const isReject = rejectingId === req.id;
            return (
              <div key={req.id} className="px-5 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${STATUS_COLOR[req.status] || ''}`}>
                        {req.status === 'pending' ? '⏳ Pending' : req.status === 'approved' ? '✓ Approved' : '✕ Rejected'}
                      </span>
                      <p className="font-bold text-brand-700">{req.customer_name || `Peserta #${req.passenger_id}`}</p>
                      {req.customer_phone && <span className="text-xs text-slate-600">📞 {req.customer_phone}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
                      <span className="text-slate-600">Trip: <b>{req.trip_name || req.trip_id}</b>{req.trip_kode ? ` (${req.trip_kode})` : ''}</span>
                      <span className="font-bold text-green-700 text-base">{fmtRupiah(req.amount)}</span>
                      <span className="text-slate-500">📅 {fmtDate(req.payment_date)}</span>
                      <span className="text-slate-500 capitalize">· {req.payment_method || 'transfer'}</span>
                    </div>
                    {req.notes && (
                      <p className="mt-1 text-xs text-slate-600 italic">📝 {req.notes}</p>
                    )}
                    <div className="mt-1 text-[10px] text-slate-500 flex gap-3 flex-wrap">
                      <span>Submit by: <b>{req.requested_by || '—'}</b> · {fmtDate(req.created_at)}</span>
                      {req.approved_by && (
                        <span className="text-green-700">Approved by: <b>{req.approved_by}</b> · {fmtDate(req.approved_at)}</span>
                      )}
                      {req.wa_sent && <span className="text-green-700">📤 WA sent {fmtDate(req.wa_sent_at)}</span>}
                      {req.rejected_reason && (
                        <span className="text-red-700">✕ Rejected: {req.rejected_reason}</span>
                      )}
                    </div>

                    {isReject && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Alasan reject (mis: Bukti transfer tidak valid)"
                          className="w-full px-2 py-1 border border-red-300 rounded text-xs bg-white"
                          autoFocus
                        />
                        <div className="mt-1.5 flex gap-1.5 justify-end">
                          <button
                            onClick={() => setRejectingId(null)}
                            className="px-2 py-1 text-[10px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >
                            Batal
                          </button>
                          <button
                            onClick={() => handleConfirmReject(req)}
                            disabled={pending || !rejectReason.trim()}
                            className="px-3 py-1 text-[10px] font-semibold rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    {req.status === 'pending' && !isReject && (
                      <>
                        <button
                          onClick={() => handleApprove(req)}
                          disabled={pending}
                          className="px-3 py-1.5 text-xs font-bold rounded bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleStartReject(req.id)}
                          disabled={pending}
                          className="px-2 py-1.5 text-xs font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700"
                        >
                          ✕ Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(req)}
                      disabled={pending}
                      className="px-2 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                      title="Hapus request"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
