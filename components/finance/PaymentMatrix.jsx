'use client';

// Payment matrix — rows: peserta, cols: milestones. Click cell to toggle paid.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleMilestone, updatePaymentAmount } from '@/lib/actions/payments';
import { fmtRupiah } from '@/lib/utils/format';

const MILESTONES = [
  { key: 'DP',        label: 'DP',        short: 'DP' },
  { key: 'P1',        label: 'Pay 1',     short: 'P1' },
  { key: 'P2',        label: 'Pay 2',     short: 'P2' },
  { key: 'P3',        label: 'Pay 3',     short: 'P3' },
  { key: 'Pelunasan', label: 'Pelunasan', short: 'PL' },
  { key: 'Visa',      label: 'Visa',      short: 'V' },
  { key: 'Asuransi',  label: 'Asuransi',  short: 'AS' },
];

export default function PaymentMatrix({ tripId, passengers = [], paymentsByPassenger = {}, template = {} }) {
  const [pending, startTransition] = useTransition();
  const [editingCell, setEditingCell] = useState(null); // { passengerId, paymentId, type, amount }
  const router = useRouter();

  // Build quick lookup: passengerId → { type → payment }
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

  if (passengers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-card">
        <p className="text-4xl mb-3">👥</p>
        <p className="text-lg font-bold text-slate-700">Belum ada peserta di trip ini</p>
        <p className="mt-1 text-sm text-slate-500">Tambahkan peserta dari halaman trip detail.</p>
      </div>
    );
  }

  // Milestone summary (group)
  const summary = {};
  for (const m of MILESTONES) {
    summary[m.key] = passengers.filter((p) => paymentLookup[p.id]?.[m.key]).length;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h3 className="font-bold text-brand-700">Checklist Payment Group</h3>
        <p className="text-xs text-slate-500 mt-0.5">Klik cell untuk toggle ✓/○. Klik nominal untuk edit per-peserta.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10">Peserta</th>
              {MILESTONES.map((m) => (
                <th key={m.key} className="px-2 py-2 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <p>{m.label}</p>
                  <p className="text-[10px] font-normal text-slate-400 mt-0.5">{fmtRupiah(template[m.key] || 0)}</p>
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Total Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {passengers.map((p, idx) => {
              const c = p.customers || {};
              const pays = paymentsByPassenger[p.id] || [];
              const totalPaid = pays.reduce((s, x) => s + (x.amount || 0), 0);
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 sticky left-0 bg-white hover:bg-slate-50 z-10">
                    <p className="font-semibold text-brand-700 text-sm">{c.name || '—'}</p>
                    <p className="text-[10px] text-slate-500">#{idx + 1}{p.room_type && ` · ${p.room_type}`}</p>
                  </td>
                  {MILESTONES.map((m) => {
                    const payment = paymentLookup[p.id]?.[m.key];
                    const isPaid = !!payment;
                    const isEditing = editingCell?.passengerId === p.id && editingCell?.type === m.key;
                    return (
                      <td key={m.key} className="px-1 py-2 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            defaultValue={payment?.amount || 0}
                            min="0"
                            autoFocus
                            onBlur={(e) => handleSaveAmount(payment.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.target.blur();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-20 px-1 py-0.5 border border-brand-500 rounded text-xs text-center"
                          />
                        ) : (
                          <button
                            onClick={() => handleToggle(p.id, m.key)}
                            disabled={pending}
                            className={`w-10 h-8 rounded font-bold text-sm transition-colors disabled:opacity-50 ${
                              isPaid
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                            }`}
                            title={isPaid ? `Lunas: ${fmtRupiah(payment.amount)}` : 'Belum bayar — klik untuk tandai lunas'}
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
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr>
              <td className="px-3 py-2 text-left text-xs font-bold text-slate-700 sticky left-0 bg-slate-50">
                ✓ Lunas: {passengers.length} peserta
              </td>
              {MILESTONES.map((m) => (
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
