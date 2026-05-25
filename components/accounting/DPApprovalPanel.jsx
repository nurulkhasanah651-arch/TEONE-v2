'use client';

// Round 102d: DPApprovalPanel — group by family + batch approve + 1 WA ke kepala
// - DP request dengan family_group_id sama → group dalam 1 card
// - "Approve Family" tombol → batch approve semua DP di family + single WA ke kepala
// - DP request individu (tanpa family) → tampil card terpisah seperti biasa

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveDPRequest, approveDPBatch, rejectDPRequest, deleteDPRequest } from '@/lib/actions/dp';

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

export default function DPApprovalPanel({
  requests = [],
  passengers = [],         // Round 102d: untuk lookup family_group_id
  familyGroups = [],       // Round 102d: untuk lookup nama family + head
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('pending');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Build lookup maps
  const paxMap = Object.fromEntries(passengers.map((p) => [p.id, p]));
  const famMap = Object.fromEntries(familyGroups.map((f) => [f.id, f]));

  // Filter requests
  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  // Group by family — utk request pending, kalau peserta dalam family valid → group
  const familyGroupedRequests = {};  // family_id → [requests]
  const individualRequests = [];      // requests yang gak ada family

  for (const r of filtered) {
    const pax = paxMap[r.passenger_id];
    const familyId = pax?.family_group_id;
    const family = familyId ? famMap[familyId] : null;
    if (family && r.status === 'pending') {
      // Group hanya untuk pending (approved/rejected tampil individu untuk history clarity)
      if (!familyGroupedRequests[familyId]) familyGroupedRequests[familyId] = [];
      familyGroupedRequests[familyId].push(r);
    } else {
      individualRequests.push(r);
    }
  }

  // Stats
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;
  const totalPendingAmount = requests
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  function handleApproveIndividual(req) {
    if (!confirm(
      `APPROVE DP ${fmtRupiah(req.amount)} untuk ${req.customer_name}?\n\n` +
      `→ Matrix DP auto-centang ✓\n` +
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

  function handleApproveFamily(familyId, reqs) {
    const family = famMap[familyId];
    const totalAmt = reqs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const headPax = passengers.find((p) => p.id === family?.head_passenger_id);
    const headPhone = headPax?.customers?.phone || family?.head_phone || null;

    if (!confirm(
      `APPROVE ${reqs.length} DP untuk family "${family?.name}"?\n\n` +
      `Total: ${fmtRupiah(totalAmt)}\n\n` +
      `→ Matrix DP semua ${reqs.length} anggota auto-centang ✓\n` +
      `→ 1 WA dikirim ke KEPALA (${headPhone || 'no HP belum diisi'}) dengan breakdown per anggota`
    )) return;

    startTransition(async () => {
      const r = await approveDPBatch(reqs.map((x) => x.id));
      if (r?.error) alert(r.error);
      else {
        let msg = `✓ ${r.approved} DP approved untuk family ${r.family_name || '(unknown)'}!\n\n`;
        if (r.wa_sent_to_head) {
          msg += `📤 WA terkirim ke kepala: ${r.wa_target}`;
        } else if (r.wa_error) {
          msg += `⚠ WA gagal: ${r.wa_error}`;
        } else {
          msg += `ℹ WA tidak dikirim (kepala family no HP belum diisi)`;
        }
        alert(msg);
      }
      router.refresh();
    });
  }

  function handleStartReject(id) {
    setRejectingId(id);
    setRejectReason('');
  }

  function handleConfirmReject(req) {
    if (!rejectReason.trim()) { alert('Reason wajib diisi'); return; }
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
            CS submit DP → Finance approve → matrix centang + WA auto-kirim
            {totalPendingAmount > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">
                · Total pending: {fmtRupiah(totalPendingAmount)}
              </span>
            )}
          </p>
        </div>
      </div>

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
          {/* FAMILY GROUPS (only pending) */}
          {Object.entries(familyGroupedRequests).map(([familyId, reqs]) => {
            const family = famMap[familyId];
            const totalAmt = reqs.reduce((s, r) => s + Number(r.amount || 0), 0);
            const headPax = passengers.find((p) => p.id === family?.head_passenger_id);
            const headPhone = headPax?.customers?.phone;
            const headName = headPax?.customers?.name || family?.name || '(unknown)';

            return (
              <div key={`fam-${familyId}`} className="px-5 py-3 bg-indigo-50/30 border-l-4 border-indigo-400">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase border bg-amber-100 text-amber-800 border-amber-300">
                        ⏳ Pending
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800">
                        👨‍👩‍👧 FAMILY ({reqs.length} pax)
                      </span>
                      <p className="font-bold text-indigo-800">{family?.name || '(Family)'}</p>
                    </div>
                    <p className="text-xs text-slate-700">
                      👑 Kepala: <span className="font-semibold">{headName}</span>
                      {headPhone ? ` · 📞 ${headPhone}` : <span className="text-amber-700"> · ⚠ no HP belum diisi</span>}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Trip: <b>{reqs[0].trip_name || reqs[0].trip_id}</b>{reqs[0].trip_kode ? ` (${reqs[0].trip_kode})` : ''}
                    </p>

                    {/* Breakdown per peserta */}
                    <div className="mt-2 space-y-1 bg-white border border-indigo-200 rounded p-2">
                      {reqs.map((r) => {
                        const isHead = String(r.passenger_id) === String(family?.head_passenger_id);
                        return (
                          <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex items-center gap-1 flex-wrap">
                              <span>{isHead ? '👑' : '👤'}</span>
                              <span className="font-medium text-slate-800">{r.customer_name || `#${r.passenger_id}`}</span>
                              <span className="text-slate-500">📅 {fmtDate(r.payment_date)}</span>
                              <span className="text-slate-500 capitalize">· {r.payment_method}</span>
                            </span>
                            <span className="font-bold text-green-700">{fmtRupiah(r.amount)}</span>
                          </div>
                        );
                      })}
                      <div className="border-t border-indigo-200 pt-1 mt-1 flex justify-between text-xs font-bold">
                        <span className="text-indigo-800">TOTAL FAMILY:</span>
                        <span className="text-indigo-800 text-base">{fmtRupiah(totalAmt)}</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 mt-1">
                      Submit by: <b>{reqs[0].requested_by || '—'}</b> · {fmtDate(reqs[0].created_at)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => handleApproveFamily(familyId, reqs)}
                      disabled={pending}
                      className="px-3 py-1.5 text-xs font-bold rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
                      title={`Approve ${reqs.length} DP sekaligus + WA ke kepala`}
                    >
                      ✓ Approve Family ({reqs.length})
                    </button>
                    <p className="text-[10px] text-indigo-700 text-center">
                      📤 WA hanya ke kepala
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* INDIVIDUAL REQUESTS (non-family + approved/rejected) */}
          {individualRequests.map((req) => {
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
                          placeholder="Alasan reject"
                          className="w-full px-2 py-1 border border-red-300 rounded text-xs bg-white"
                          autoFocus
                        />
                        <div className="mt-1.5 flex gap-1.5 justify-end">
                          <button onClick={() => setRejectingId(null)} className="px-2 py-1 text-[10px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700">
                            Batal
                          </button>
                          <button onClick={() => handleConfirmReject(req)} disabled={pending || !rejectReason.trim()}
                            className="px-3 py-1 text-[10px] font-semibold rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    {req.status === 'pending' && !isReject && (
                      <>
                        <button onClick={() => handleApproveIndividual(req)} disabled={pending}
                          className="px-3 py-1.5 text-xs font-bold rounded bg-green-500 hover:bg-green-600 text-white disabled:opacity-50">
                          ✓ Approve
                        </button>
                        <button onClick={() => handleStartReject(req.id)} disabled={pending}
                          className="px-2 py-1.5 text-xs font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700">
                          ✕ Reject
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDelete(req)} disabled={pending}
                      className="px-2 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-600" title="Hapus request">
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
