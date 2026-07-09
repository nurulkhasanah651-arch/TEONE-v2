'use client';

// Payment Matrix — Round 102e + R207 + R211
// R211: render DiscountPanel di expanded row + badge diskon di nama peserta

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleMilestone, updatePaymentAmount, updatePaymentNotes, settlePelunasanAll } from '@/lib/actions/payments';
import { fmtRupiah } from '@/lib/utils/format';
import { deriveMilestones, expectedPerPassenger, mainExpectedPerPassenger } from '@/lib/utils/price-breakdown';
import InvoicePanelForPassenger from '@/components/invoice/InvoicePanelForPassenger';
import DiscountPanel from '@/components/finance/DiscountPanel';
import { useWaManual } from '@/components/wa/WaManualProvider';
import PaxSearch, { matchesName } from '@/components/common/PaxSearch';

export default function PaymentMatrix({
  brand = '',
  tripId,
  passengers = [],
  paymentsByPassenger = {},
  template = {},
  scheduleDue = {},
  scheduleAmount = {},
  breakdown = {},
  invoicesByPassenger = {},
  familyGroups = [],
  visaRequirement = '',
}) {
  const [pending, startTransition] = useTransition();
  const [editingCell, setEditingCell] = useState(null);
  const [editingNotes, setEditingNotes] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const showWaManual = useWaManual();
  const [q, setQ] = useState('');

  const router = useRouter();

  const allPayments = Object.values(paymentsByPassenger).flat();
  const milestones = deriveMilestones(template, breakdown, allPayments);

  const paymentLookup = {};
  for (const pid in paymentsByPassenger) {
    paymentLookup[pid] = {};
    for (const p of paymentsByPassenger[pid]) {
      paymentLookup[pid][p.type] = p;
    }
  }

  const familyMap = {};
  for (const fg of familyGroups) familyMap[fg.id] = fg;

  const byFamily = {};
  const ungrouped = [];
  for (const p of passengers) {
    if (p.family_group_id && familyMap[p.family_group_id]) {
      if (!byFamily[p.family_group_id]) byFamily[p.family_group_id] = [];
      byFamily[p.family_group_id].push(p);
    } else {
      ungrouped.push(p);
    }
  }
  for (const fid in byFamily) {
    byFamily[fid].sort((a, b) => (b.is_family_head ? 1 : 0) - (a.is_family_head ? 1 : 0));
  }

  const seen = new Set();
  const orderedPassengers = [];
  for (const fg of familyGroups) {
    if (byFamily[fg.id]) {
      for (const m of byFamily[fg.id]) {
        orderedPassengers.push(m);
        seen.add(m.id);
      }
    }
  }
  for (const p of ungrouped) {
    orderedPassengers.push(p);
    seen.add(p.id);
  }
  for (const p of passengers) {
    if (!seen.has(p.id)) orderedPassengers.push(p);
  }

  function handleToggle(passengerId, type, tplAmount) {
    startTransition(async () => {
      const result = await toggleMilestone(passengerId, tripId, type, tplAmount);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  function handleSettleAll(passengerId, nm) {
    if (!confirm(`Lunasi SEMUA tagihan ${nm || 'peserta'} sekaligus (sisa pokok + Visa + Asuransi yang di-include)?\n\nKalau peserta bagian KELUARGA, seluruh anggota keluarga ikut dilunasi.`)) return;
    startTransition(async () => {
      const result = await settlePelunasanAll(passengerId, tripId);
      if (result?.error) { alert(result.error); return; }
      if (result.wa_manual) {
        showWaManual({ message: result.wa_message, phone: result.wa_phone, name: result.customer_name || nm, title: 'Pelunasan tercatat — kirim WA manual' });
        return; // refresh saat modal ditutup
      }
      router.refresh();
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

  // Catat pembayaran milestone dgn NOMINAL CUSTOM (default template, bisa diubah).
  async function handleCreateAmount(passengerId, type, amount) {
    const amt = parseInt(amount) || 0;
    if (amt <= 0) { setEditingCell(null); return; }
    startTransition(async () => {
      const result = await toggleMilestone(passengerId, tripId, type, amt);
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

  // Filter cari nama (tidak mengubah urutan/pengelompokan keluarga)
  const shownPassengers = orderedPassengers.filter((p) => matchesName((p.customers || {}).name, q));

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

  const sourceColor = {
    cicilan:         'text-slate-600 border-b-slate-300',
    main_addon:      'text-blue-700 border-b-blue-300 bg-blue-50/40',
    optional_addon:  'text-indigo-700 border-b-indigo-300 bg-indigo-50/40',
    custom:          'text-purple-700 border-b-purple-300 bg-purple-50/40',
    template_custom: 'text-purple-700 border-b-purple-300 bg-purple-50/40',
  };

  const paxExpectedMap = {};
  for (const p of passengers) {
    const pays = paymentsByPassenger[p.id] || [];
    const totalPaid = pays.reduce((s, x) => s + (x.amount || 0), 0);
    const expectedTotal = expectedPerPassenger(p, breakdown, pays, brand);
    paxExpectedMap[p.id] = {
      expectedTotal,
      totalPaid,
      sisa: Math.max(expectedTotal - totalPaid, 0),
    };
  }

  return (
    <>
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-brand-700">Checklist Payment Group</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="font-semibold">WAJIB</span>: room + tips + city tax + tiket/bagasi domestik (jika diisi) + cicilan ·
            <span className="font-semibold ml-1">OPTIONAL</span>: visa/asuransi/customs — masuk expected setelah ✓
          </p>
        </div>
        <div className="flex gap-1 text-[10px] font-bold uppercase flex-wrap">
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Cicilan</span>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">Wajib</span>
          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Opt-in</span>
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700">Custom</span>
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">🎟 Diskon</span>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60">
        <PaxSearch value={q} onChange={setQ} shown={shownPassengers.length} total={orderedPassengers.length} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10">Peserta</th>
              {milestones.map((m) => (
                <th key={m.key} className={`px-2 py-2 text-center text-xs font-bold uppercase tracking-wider border-b-2 ${sourceColor[m.source] || sourceColor.cicilan}`}>
                  <p>{m.icon ? `${m.icon} ` : ''}{m.label}{m.isOptional && <span className="ml-1 text-[8px] opacity-70">opt</span>}</p>
                  <p className="text-[10px] font-normal text-slate-400 mt-0.5">{fmtRupiah(m.amount)}</p>
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shownPassengers.map((p, idx) => {
              const c = p.customers || {};
              const pays = paymentsByPassenger[p.id] || [];
              const totalPaid = pays.reduce((s, x) => s + (x.amount || 0), 0);
              const isExpanded = expandedRow === p.id;

              const mainExpected = mainExpectedPerPassenger(p, breakdown, brand);
              const expectedTotal = expectedPerPassenger(p, breakdown, pays, brand);
              const optionalPaid = expectedTotal - mainExpected;
              const remaining = expectedTotal - totalPaid;
              const discount = Number(p.discount_amount) || 0;

              const fg = (p.family_group_id && familyMap[p.family_group_id]) ? familyMap[p.family_group_id] : null;
              const isHead = p.is_family_head && fg;
              const familyMembers = fg ? (byFamily[fg.id] || []) : [];

              return (
                <>
                  <tr key={p.id} className={`hover:bg-slate-50 ${isExpanded ? 'bg-amber-50/40' : ''} ${fg ? 'border-l-4 border-indigo-300' : ''}`}>
                    <td className="px-3 py-2 sticky left-0 bg-white hover:bg-slate-50 z-10">
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                        className="text-left w-full hover:bg-slate-100 -ml-1 px-1 py-0.5 rounded transition-colors"
                      >
                        <p className="font-semibold text-brand-700 text-sm flex items-center gap-1 flex-wrap">
                          {isExpanded ? '▾' : '▸'}
                          {isHead && <span title="Kepala Family">👑</span>}
                          <span>{c.name || '—'}</span>
                          {fg && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                              isHead ? 'bg-indigo-100 text-indigo-800' : 'bg-indigo-50 text-indigo-700'
                            }`}>
                              👨‍👩‍👧 {fg.name.length > 14 ? fg.name.slice(0, 14) + '…' : fg.name}
                            </span>
                          )}
                          {/* R211: Diskon badge */}
                          {discount > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300"
                              title={`Diskon ${fmtRupiah(discount)}`}>
                              🎟 -{fmtRupiah(discount)}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          #{idx + 1}{p.room_type && ` · ${p.room_type}`} ·
                          Wajib {fmtRupiah(mainExpected)}{optionalPaid > 0 && ` + opt ${fmtRupiah(optionalPaid)}`}
                          {discount > 0 && <span className="text-amber-700"> · diskon -{fmtRupiah(discount)}</span>}
                        </p>
                      </button>
                    </td>
                    {milestones.map((m) => {
                      const payment = paymentLookup[p.id]?.[m.key];
                      const isPaid = !!payment;
                      const isEditing = editingCell?.passengerId === p.id && editingCell?.type === m.key;
                      const cellBg = m.source === 'main_addon' ? 'bg-blue-50/20'
                        : m.source === 'optional_addon' ? 'bg-indigo-50/20'
                        : (m.source === 'custom' || m.source === 'template_custom') ? 'bg-purple-50/20'
                        : '';
                      return (
                        <td key={m.key} className={`px-1 py-2 text-center ${cellBg}`}>
                          {isEditing ? (
                            <input autoComplete="off"
                              type="number"
                              defaultValue={isPaid ? (payment?.amount || 0) : (m.amount || 0)} min="0" autoFocus
                              onBlur={(e) => (isPaid ? handleSaveAmount(payment.id, e.target.value) : handleCreateAmount(p.id, m.key, e.target.value))}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingCell(null); }}
                              className="w-20 px-1 py-0.5 border border-brand-500 rounded text-xs text-center"
                            />
                          ) : (
                            <button
                              onClick={() => (isPaid ? handleToggle(p.id, m.key, m.amount) : setEditingCell({ passengerId: p.id, type: m.key }))}
                              disabled={pending}
                              className={`w-10 h-8 rounded font-bold text-sm transition-colors disabled:opacity-50 ${
                                isPaid ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                              }`}
                              title={isPaid
                                ? `Lunas: ${fmtRupiah(payment.amount)}`
                                : m.isOptional
                                  ? `Opt-in: klik untuk add ${m.label} (${fmtRupiah(m.amount)}) ke expected peserta ini`
                                  : `Klik untuk input nominal bayar (default ${fmtRupiah(m.amount)}, bisa diubah)`}
                            >
                              {isPaid ? '✓' : '○'}
                            </button>
                          )}
                          {((String(m.key).toLowerCase() === 'visa' && p.include_visa) || (String(m.key).toLowerCase() === 'asuransi' && p.include_asuransi)) && (
                            <span className="block text-[8px] mt-0.5 px-1 rounded bg-amber-100 text-amber-700 font-bold" title="Dipilih saat order/CS (tagihan)">
                              {visaRequirement === 'group' && String(m.key).toLowerCase() === 'visa' ? 'INCLUDE•GRP' : 'INCLUDE'}
                            </span>
                          )}
                          {String(m.key).toLowerCase() === 'visa' && p.visa_ready && (
                            <span className="block text-[8px] mt-0.5 px-1 rounded bg-green-100 text-green-700 font-bold" title="Peserta menyatakan sudah punya visa sendiri">
                              READY VISA
                            </span>
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
                      <p className="text-[10px] text-slate-500">
                        / {fmtRupiah(expectedTotal)}
                        {totalPaid >= expectedTotal && expectedTotal > 0 && <span className="ml-1 text-green-700 font-bold">✓</span>}
                      </p>
                      {discount > 0 && (
                        <p className="text-[10px] text-amber-700 font-semibold">(setelah diskon)</p>
                      )}
                      {remaining > 0 && (
                        <p className="text-[10px] text-amber-700 font-semibold">Sisa: {fmtRupiah(remaining)}</p>
                      )}
                      {totalPaid < expectedTotal && (
                        <button onClick={() => handleSettleAll(p.id, c.name)} disabled={pending}
                          className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 mt-1"
                          title="Lunasi sisa pokok + Visa + Asuransi sekaligus">⚡ Lunasi semua</button>
                      )}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${p.id}-exp`} className="bg-amber-50/30">
                      <td colSpan={milestones.length + 2} className="px-5 py-3">
                        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">
                          Detail Pembayaran — {c.name}
                          {fg && (
                            <span className="ml-2 text-[10px] font-normal text-indigo-700">
                              👨‍👩‍👧 {fg.name} · {isHead ? 'Kepala' : 'Anggota'}
                            </span>
                          )}
                          <span className="ml-2 text-[10px] font-normal text-slate-600">
                            Room: {p.room_type || '—'} · Wajib: {fmtRupiah(mainExpected)} · Optional ✓: {fmtRupiah(optionalPaid)}
                            {discount > 0 && <span className="text-amber-700"> · Diskon: -{fmtRupiah(discount)}</span>}
                            {' · '}Expected: {fmtRupiah(expectedTotal)}
                          </span>
                        </p>

                        {/* R211: Diskon panel */}
                        <DiscountPanel passenger={p} customerName={c.name} />

                        {pays.length === 0 ? (
                          <p className="text-xs text-slate-500 italic mt-3">Belum ada pembayaran. Klik milestone di atas untuk tandai lunas.</p>
                        ) : (
                          <div className="space-y-1.5 mt-3">
                            {pays.map((py) => {
                              const isEditingThisNote = editingNotes?.paymentId === py.id;
                              return (
                                <div key={py.id} className="flex items-start gap-2 p-2 bg-white rounded border border-slate-200">
                                  <span className="text-xs font-bold text-brand-700 min-w-16">{py.type}</span>
                                  <span className="text-xs font-semibold text-green-700 min-w-24">{fmtRupiah(py.amount)}</span>
                                  <div className="flex-1">
                                    {isEditingThisNote ? (
                                      <input autoComplete="off"
                                        type="text"
                                        defaultValue={py.notes || ''}
                                        autoFocus
                                        placeholder="Catatan pembayaran..."
                                        onBlur={(e) => handleSaveNotes(py.id, e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingNotes(null); }}
                                        className="w-full px-2 py-1 border border-brand-500 rounded text-xs"
                                      />
                                    ) : (
                                      <p
                                        onClick={() => setEditingNotes({ paymentId: py.id })}
                                        className="text-xs text-slate-600 cursor-pointer hover:text-brand-600 hover:underline"
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

                        <div className="mt-3">
                          <InvoicePanelForPassenger
                            tripId={tripId}
                            passenger={p}
                            customer={c}
                            invoices={invoicesByPassenger[p.id] || []}
                            priceBreakdown={breakdown}
                            paymentTemplate={template}
                            scheduleDue={scheduleDue}
                            scheduleAmount={scheduleAmount}
                            paidMilestones={pays.map((py) => py.type)}
                            familyGroup={fg}
                            familyMembers={familyMembers}
                            expectedTotal={expectedTotal}
                            totalPaidPerPax={totalPaid}
                            sisaPerPax={remaining}
                            paxExpectedMap={paxExpectedMap}
                          />
                        </div>
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
    </>
  );
}
