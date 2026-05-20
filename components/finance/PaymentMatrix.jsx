'use client';

// Payment matrix — rows: peserta, cols: milestones (standard + custom from template).
// Click cell to toggle. Click amount to edit. Click peserta name to expand for notes per cell.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleMilestone, updatePaymentAmount, updatePaymentNotes } from '@/lib/actions/payments';
import { fmtRupiah } from '@/lib/utils/format';

const STANDARD = ['DP', 'P1', 'P2', 'P3', 'Pelunasan', 'Visa', 'Asuransi'];

export default function PaymentMatrix({ tripId, passengers = [], paymentsByPassenger = {}, template = {} }) {
  const [pending, startTransition] = useTransition();
  const [editingCell, setEditingCell] = useState(null);
  const [editingNotes, setEditingNotes] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const router = useRouter();

  // Derive milestone columns: standard order + custom from template
  const templateKeys = Object.keys(template || {});
  const customKeys = templateKeys.filter((k) => !STANDARD.includes(k));
  const milestones = [...STANDARD, ...customKeys].map((k) => ({ key: k, label: k, amount: template[k] || 0, isCustom: !STANDARD.includes(k) }));

  // Build lookup
  const paymentLookup = {};
  for (const pid in paymentsByPassenger) {
    paymentLookup[pid] = {};
    for (const p of paymentsByPassenger[pid]) {
      paymentLookup[pid][p.type] = p;
    }
  }

  function handleToggle(passengerId, type) {
    const tplAmount = template[type] || 0;
    if (!template[type] && !paymentLookup[passengerId]?.[type]) {
      if (!confirm(`Template untuk ${type} belum di-set (0). Tetap tandai lunas?`)) return;
    }
    startTransition(async () => {
      const result = await toggleMilestone(passengerId, tripId, type, tplAmount);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  async function handleSaveAmount(paymentId, newAmount) {
    startTransition(async () => {
      const result = await updatePaymentAmount(paymentId, tripId, newAmount);
      if (result?.error) alert(result.error);
      setEditingCell(null);
      router.refresh();
    });
  }

  async function handleSaveNotes(paymentId, notes) {
    startTransition(async () => {
      const result = await updatePaymentNotes(paymentId, tripId, notes);
      if (result?.error) alert(result.error);
      setEditingNotes(null);
      router.refresh();
    });
  }

  if (passengers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-card">
        <p className="text-4xl mb-3">👥</p>
        <p className="text-lg font-bold text-slate-700">Belum ada peserta di trip ini</p>
        <p className="mt-1 text-sm text-slate-500">Tambahkan peserta dari halaman trip detail.</p>
      </div>
    );
  }

  const summary = {};
  for (const m of milestones) {
    summary[m.key] = passengers.filter((p) => paymentLookup[p.id]?.[m.key]).length;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h3 className="font-bold text-brand-700">Checklist Payment Group</h3>
        <p className="text-xs text-slate-500 mt-0.5">Klik ○ untuk lunas · klik ✓ untuk batal · klik nominal untuk edit · klik nama peserta untuk expand & note.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10">Peserta</th>
              {milestones.map((m) => (
                <th key={m.key} className={`px-2 py-2 text-center text-xs font-bold uppercase tracking-wider ${m.isCustom ? 'text-purple-700' : 'text-slate-600'}`}>
                  <p>{m.label}</p>
                  <p className="text-[10px] font-normal text-slate-400 mt-0.5">{fmtRupiah(m.amount)}</p>
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {passengers.map((p, idx) => {
              const c = p.customers || {};
              const pays = paymentsByPassenger[p.id] || [];
              const totalPaid = pays.reduce((s, x) => s + (x.amount || 0), 0);
              const isExpanded = expandedRow === p.id;

              return (
                <>
                  <tr key={p.id} className={`hover:bg-slate-50 ${isExpanded ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2 sticky left-0 bg-white hover:bg-slate-50 z-10">
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                        className="text-left w-full hover:bg-slate-100 -ml-1 px-1 py-0.5 rounded transition-colors"
                      >
                        <p className="font-semibold text-brand-700 text-sm">
                          {isExpanded ? '▾' : '▸'} {c.name || '—'}
                        </p>
                        <p className="text-[10px] text-slate-500">#{idx + 1}{p.room_type && ` · ${p.room_type}`}</p>
                      </button>
                    </td>
                    {milestones.map((m) => {
                      const payment = paymentLookup[p.id]?.[m.key];
                      const isPaid = !!payment;
                      const isEditing = editingCell?.passengerId === p.id && editingCell?.type === m.key;
                      return (
                        <td key={m.key} className="px-1 py-2 text-center">
                          {isEditing ? (
                            <input
                              type="number"
                              defaultValue={payment?.amount || 0} min="0" autoFocus
                              onBlur={(e) => handleSaveAmount(payment.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingCell(null); }}
                              className="w-20 px-1 py-0.5 border border-brand-500 rounded text-xs text-center"
                            />
                          ) : (
                            <button
                              onClick={() => handleToggle(p.id, m.key)}
                              disabled={pending}
                              className={`w-10 h-8 rounded font-bold text-sm transition-colors disabled:opacity-50 ${
                                isPaid ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                              }`}
                              title={isPaid ? `Lunas: ${fmtRupiah(payment.amount)}` : 'Klik untuk tandai lunas'}
                            >
                              {isPaid ? '✓' : '○'}
                            </button>
                          )}
                          {isPaid && !isEditing && (
                            <p
                              onClick={() => setEditingCell({ passengerId: p.id, paymentId: payment.id, type: m.key })}
                              className="text-[10px] text-slate-500 mt-0.5 cursor-pointer hover:text-brand-600 hover:underline"
                              title="Klik untuk edit nominal"
                            >
                              {fmtRupiah(payment.amount)}
                            </p>
                          )}
                          {payment?.notes && !isEditing && (
                            <span className="inline-block text-[9px] mt-0.5" title={payment.notes}>📝</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <p className="font-bold text-green-700">{fmtRupiah(totalPaid)}</p>
                      {p.price_paid > 0 && (
                        <p className="text-[10px] text-slate-500">
                          / {fmtRupiah(p.price_paid)}
                          {totalPaid >= p.price_paid && <span className="ml-1 text-green-700 font-bold">✓</span>}
                        </p>
                      )}
                    </td>
                  </tr>

                  {/* Expanded row — payment details with notes editor */}
                  {isExpanded && (
                    <tr key={`${p.id}-exp`} className="bg-amber-50/30">
                      <td colSpan={milestones.length + 2} className="px-5 py-3">
                        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Detail Pembayaran — {c.name}</p>
                        {pays.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">Belum ada pembayaran tercatat. Klik milestone di atas untuk tandai lunas.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {pays.map((py) => {
                              const isEditingThisNote = editingNotes?.paymentId === py.id;
                              return (
                                <div key={py.id} className="flex items-start gap-2 p-2 bg-white rounded border border-slate-200">
                                  <span className="text-xs font-bold text-brand-700 min-w-16">{py.type}</span>
                                  <span className="text-xs font-semibold text-green-700 min-w-24">{fmtRupiah(py.amount)}</span>
                                  <div className="flex-1">
                                    {isEditingThisNote ? (
                                      <input
                                        type="text"
                                        defaultValue={py.notes || ''}
                                        autoFocus
                                        placeholder="Catatan untuk pembayaran ini..."
                                        onBlur={(e) => handleSaveNotes(py.id, e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingNotes(null); }}
                                        className="w-full px-2 py-1 border border-brand-500 rounded text-xs"
                                      />
                                    ) : (
                                      <p
                                        onClick={() => setEditingNotes({ paymentId: py.id })}
                                        className="text-xs text-slate-600 cursor-pointer hover:text-brand-600 hover:underline"
                                        title="Klik untuk edit catatan"
                                      >
                                        {py.notes ? `📝 ${py.notes}` : '+ Tambah catatan'}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr>
              <td className="px-3 py-2 text-left text-xs font-bold text-slate-700 sticky left-0 bg-slate-50">
                Total: {passengers.length} peserta
              </td>
              {milestones.map((m) => (
                <td key={m.key} className="px-1 py-2 text-center">
                  <p className={`text-xs font-bold ${summary[m.key] === passengers.length ? 'text-green-700' : summary[m.key] === 0 ? 'text-slate-500' : 'text-amber-700'}`}>
                    {summary[m.key]}/{passengers.length}
                  </p>
                </td>
              ))}
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
