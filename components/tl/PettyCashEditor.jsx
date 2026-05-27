'use client';

// Round 145: PettyCashEditor + Refund/Settlement button (internal only)
// Sisa petty cash di-refund → masuk income (negative HPP) → naik margin group
// Path: components/tl/PettyCashEditor.jsx

import { useState, useTransition } from 'react';
import { savePettyCash, recordPettyCashRefund } from '@/lib/actions/tlmanage';
import FileUploadInput from './FileUploadInput';

function parseNum(s) { return Number(String(s || '').replace(/[^0-9]/g, '')) || 0; }
function formatNum(n) { return n ? Number(n).toLocaleString('id-ID') : ''; }
function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function PettyCashEditor({ tripId, current, canEdit = false, userEmail = '' }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [allocated, setAllocated] = useState(formatNum(current?.allocated_amount));
  const [notes, setNotes] = useState(current?.notes || '');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundProof, setRefundProof] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const allocatedAmt = Number(current?.allocated_amount || 0);
  const spent = Number(current?.spent_amount || 0);
  const remaining = Math.max(allocatedAmt - spent, 0);
  const refundedAmount = Number(current?.refund_amount || 0);
  const isSettled = current?.status === 'settled' || refundedAmount > 0;

  function handleSave() {
    setError(''); setMsg('');
    startTransition(async () => {
      const r = await savePettyCash({
        tripId,
        allocatedAmount: parseNum(allocated),
        notes: notes.trim(),
        userEmail,
      });
      if (r?.error) { setError(r.error); return; }
      setMsg('✓ Petty cash tersimpan');
      setEditing(false);
    });
  }

  function handleRefund() {
    setError(''); setMsg('');
    const amt = parseNum(refundAmount);
    if (amt <= 0) { setError('Nominal refund wajib > 0'); return; }
    if (amt > remaining) { setError(`Refund (${fmtRupiah(amt)}) > sisa (${fmtRupiah(remaining)})`); return; }

    if (!confirm(
      `Konfirmasi refund sisa petty cash?\n\n` +
      `Jumlah: ${fmtRupiah(amt)}\n` +
      `Sisa setelah refund: ${fmtRupiah(remaining - amt)}\n\n` +
      `Ini akan dicatat sebagai income (mengurangi total HPP → naik margin group).`
    )) return;

    startTransition(async () => {
      const r = await recordPettyCashRefund({
        tripId,
        refundAmount: amt,
        refundProofUrl: refundProof,
        notes: refundNotes.trim(),
        userEmail,
      });
      if (r?.error) { setError(r.error); return; }
      setMsg(`✓ Refund ${fmtRupiah(amt)} tercatat — masuk income group`);
      setShowRefundForm(false);
      setRefundAmount('');
      setRefundProof('');
      setRefundNotes('');
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-purple-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-purple-50 border-purple-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-purple-800 flex items-center gap-2">
          <span>💵</span> Petty Cash Trip
          {isSettled && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 uppercase tracking-wider">
              ✓ Settled
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {canEdit && !editing && !isSettled && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1 rounded bg-purple-500 hover:bg-purple-600 text-white font-bold"
            >
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      {msg && <div className="px-5 py-2 bg-green-50 border-b border-green-200 text-xs text-green-800">{msg}</div>}
      {error && <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-800">⚠ {error}</div>}

      <div className="p-5 space-y-3">
        {editing ? (
          <>
            <Field label="Nominal Petty Cash (IDR)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
                <input
                  type="text"
                  value={allocated}
                  onChange={(e) => setAllocated(formatNum(parseNum(e.target.value)))}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  placeholder="5.000.000"
                />
              </div>
            </Field>
            <Field label="Catatan">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none"
                placeholder="(opsional)"
              />
            </Field>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={pending} className="flex-1 py-2 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg disabled:opacity-50">
                {pending ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setError(''); }} disabled={pending} className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg">
                Batal
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Allocated" value={fmtRupiah(allocatedAmt)} color="purple" />
              <StatCard label="Spent" value={fmtRupiah(spent)} color="amber" />
              <StatCard label="Remaining" value={fmtRupiah(remaining)} color="green" />
            </div>

            {refundedAmount > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-bold text-green-800 mb-1">
                  ✓ Petty Cash sudah di-settle/refund
                </p>
                <p className="text-xs text-green-700">
                  Refund {fmtRupiah(refundedAmount)} dari TL → masuk income group {current?.refund_at && `· ${fmtDate(current.refund_at)}`}
                </p>
                {current?.refund_proof_url && (
                  <a href={current.refund_proof_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block font-semibold">
                    📎 Bukti transfer refund
                  </a>
                )}
                {current?.settle_notes && (
                  <p className="text-xs text-green-700 italic mt-1">{current.settle_notes}</p>
                )}
              </div>
            )}

            {current?.notes && (
              <p className="text-xs text-slate-600 italic">📝 {current.notes}</p>
            )}

            {/* ROUND 145: REFUND FORM (internal only, ada sisa, belum settled) */}
            {canEdit && !isSettled && remaining > 0 && !showRefundForm && (
              <button
                onClick={() => { setShowRefundForm(true); setRefundAmount(formatNum(remaining)); }}
                className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg"
              >
                💰 Catat Refund Sisa Petty Cash ({fmtRupiah(remaining)})
              </button>
            )}

            {showRefundForm && (
              <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg space-y-3">
                <h3 className="font-bold text-green-800">💰 Settle Petty Cash — TL Transfer Balik</h3>
                <p className="text-xs text-green-700">
                  Sisa petty cash yang ditransfer balik TL akan tercatat sebagai <b>income</b> (mengurangi total HPP → menambah margin group).
                </p>

                <Field label="Nominal Refund (IDR)" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
                    <input
                      type="text"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(formatNum(parseNum(e.target.value)))}
                      className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg font-mono bg-white"
                      placeholder={formatNum(remaining)}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Max: {fmtRupiah(remaining)}</p>
                </Field>

                <div className="p-3 bg-white border border-green-200 rounded">
                  <FileUploadInput
                    tripId={tripId}
                    subfolder="petty-cash-refund"
                    value={refundProof}
                    onChange={setRefundProof}
                    label="📎 Upload Bukti Transfer Refund (opsional)"
                    maxSizeMB={20}
                  />
                </div>

                <Field label="Catatan">
                  <textarea
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none bg-white"
                    placeholder="Catatan tambahan (opsional)"
                  />
                </Field>

                <div className="flex gap-2">
                  <button
                    onClick={handleRefund}
                    disabled={pending}
                    className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg disabled:opacity-50"
                  >
                    {pending ? 'Memproses...' : '✓ Konfirmasi Refund + Masuk HPP'}
                  </button>
                  <button
                    onClick={() => { setShowRefundForm(false); setError(''); }}
                    disabled={pending}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function StatCard({ label, value, color }) {
  const bg = {
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    green: 'bg-green-50 border-green-200 text-green-700',
  }[color];
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}
