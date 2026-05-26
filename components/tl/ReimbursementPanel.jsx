'use client';

// Round 129: Reimbursement panel — list + approve/reject (Internal) atau create (TL)
// Path: components/tl/ReimbursementPanel.jsx

import { useState, useTransition } from 'react';
import {
  createReimbursement,
  approveReimbursement,
  rejectReimbursement,
  markReimbursementPaid,
} from '@/lib/actions/tlmanage';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}
function parseNum(s) { return Number(String(s || '').replace(/[^0-9]/g, '')) || 0; }
function formatNum(n) { return n ? Number(n).toLocaleString('id-ID') : ''; }

const CATEGORIES = ['Transport', 'Meal', 'Accommodation', 'Tips', 'Communication', 'Emergency', 'Other'];

const STATUS_CFG = {
  pending: { label: '⏳ Pending', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  approved: { label: '✓ Approved', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  rejected: { label: '✕ Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
  paid: { label: '💰 Paid', color: 'bg-green-100 text-green-800 border-green-300' },
};

export default function ReimbursementPanel({
  tripId,
  requests = [],
  canApprove = false,  // true untuk internal
  canRequest = true,   // true untuk TL & internal
  userEmail = '',
  userName = '',
  userRole = 'tour_leader',
}) {
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Form state
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  function resetForm() {
    setCategory(CATEGORIES[0]);
    setDescription('');
    setAmount('');
    setReceiptUrl('');
    setSpentAt(new Date().toISOString().slice(0, 10));
    setNotes('');
  }

  function handleCreate() {
    setError('');
    setMsg('');
    if (!description.trim()) { setError('Deskripsi wajib'); return; }
    const amt = parseNum(amount);
    if (amt <= 0) { setError('Nominal wajib > 0'); return; }

    startTransition(async () => {
      const r = await createReimbursement({
        tripId,
        requesterName: userName,
        requesterEmail: userEmail,
        requesterRole: userRole,
        category,
        description: description.trim(),
        amount: amt,
        receiptUrl: receiptUrl.trim(),
        spentAt,
        notes: notes.trim(),
      });
      if (r?.error) { setError(r.error); return; }
      setMsg('✓ Request reimbursement berhasil dikirim, menunggu approval.');
      resetForm();
      setShowForm(false);
    });
  }

  function handleApprove(id, desc) {
    if (!confirm(`Approve reimbursement: ${desc}?`)) return;
    setMsg('');
    startTransition(async () => {
      const r = await approveReimbursement(id, userEmail);
      if (r?.error) setError(r.error);
      else setMsg('✓ Approved + petty cash spent auto-update');
    });
  }

  function handleReject(id, desc) {
    const reason = prompt(`Reject reimbursement: ${desc}\nAlasan reject:`);
    if (reason === null) return;
    setMsg('');
    startTransition(async () => {
      const r = await rejectReimbursement(id, reason, userEmail);
      if (r?.error) setError(r.error);
      else setMsg('✓ Rejected');
    });
  }

  function handleMarkPaid(id, desc) {
    if (!confirm(`Mark sebagai paid: ${desc}?`)) return;
    setMsg('');
    startTransition(async () => {
      const r = await markReimbursementPaid(id, userEmail);
      if (r?.error) setError(r.error);
      else setMsg('✓ Marked as paid');
    });
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const totalApproved = requests
    .filter((r) => r.status === 'approved' || r.status === 'paid')
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="bg-white rounded-xl border-2 border-amber-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-amber-50 border-amber-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-amber-800 flex items-center gap-2">
            <span>🧾</span> Reimbursement Requests
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {pendingCount > 0 && <span className="font-bold text-amber-700">⏳ {pendingCount} pending</span>}
            {pendingCount > 0 && approvedCount > 0 && ' · '}
            {approvedCount > 0 && <span className="text-blue-700">✓ {approvedCount} approved</span>}
            {pendingCount === 0 && approvedCount === 0 && 'Belum ada request'}
          </p>
        </div>
        {canRequest && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
          >
            + Request Reimbursement
          </button>
        )}
      </div>

      {msg && (
        <div className="px-5 py-2 bg-green-50 border-b border-green-200 text-xs text-green-800">{msg}</div>
      )}
      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-800">⚠ {error}</div>
      )}

      {/* Form */}
      {showForm && (
        <div className="p-5 bg-amber-50/40 border-b border-amber-100 space-y-3">
          <h3 className="text-sm font-bold text-amber-800">Request Reimbursement Baru</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Kategori" required>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Nominal (IDR)" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(formatNum(parseNum(e.target.value)))}
                  className={`${inputCls} pl-10 font-mono`}
                  placeholder="500.000"
                />
              </div>
            </Field>
            <Field label="Tanggal Pengeluaran">
              <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Link Bukti (opsional)">
              <input
                type="url"
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                className={inputCls}
              />
            </Field>
            <Field label="Deskripsi" required className="md:col-span-2">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: Taksi dari airport ke hotel di Paris"
                className={inputCls}
              />
            </Field>
            <Field label="Catatan tambahan" className="md:col-span-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={pending}
              className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg disabled:opacity-50"
            >
              {pending ? 'Menyimpan...' : '📨 Kirim Request'}
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); setError(''); }}
              disabled={pending}
              className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {requests.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-3xl mb-2">🧾</p>
          <p className="text-sm">Belum ada reimbursement request.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {requests.map((r) => {
            const status = STATUS_CFG[r.status] || STATUS_CFG.pending;
            return (
              <div key={r.id} className="p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${status.color}`}>
                        {status.label}
                      </span>
                      {r.category && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {r.category}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{fmtDate(r.spent_at || r.created_at)}</span>
                    </div>
                    <p className="font-bold text-slate-800">{r.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {r.requester_name && `👤 ${r.requester_name}`}
                      {r.notes && ` · ${r.notes}`}
                    </p>
                    {r.receipt_url && (
                      <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                        📎 Lihat bukti
                      </a>
                    )}
                    {r.reject_reason && (
                      <p className="text-xs text-red-700 italic mt-1">Reject reason: "{r.reject_reason}"</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-amber-700">{fmtRupiah(r.amount)}</p>
                    {canApprove && (
                      <div className="flex flex-col gap-1 mt-2">
                        {r.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(r.id, r.description)}
                              disabled={pending}
                              className="px-2 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold disabled:opacity-50"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleReject(r.id, r.description)}
                              disabled={pending}
                              className="px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-bold disabled:opacity-50"
                            >
                              ✕ Reject
                            </button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <button
                            onClick={() => handleMarkPaid(r.id, r.description)}
                            disabled={pending}
                            className="px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold disabled:opacity-50"
                          >
                            💰 Mark Paid
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalApproved > 0 && (
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between text-sm">
          <span className="text-slate-600 font-semibold">Total Approved/Paid:</span>
          <span className="font-bold text-amber-700">{fmtRupiah(totalApproved)}</span>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none bg-white';
