'use client';
import InvoiceWAButton from '@/components/invoice/InvoiceWAButton';

// Round 102e + R206: InvoicePanel — dropdown milestone DINAMIS dari paymentTemplate
// FIX: MILESTONE_OPTIONS computed inside component → P1-P7 dari template auto-muncul

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  createInvoice, createInvoiceAsPaid, sendInvoiceWA,
  markInvoicePaidManual, deleteInvoice,
} from '@/lib/actions/invoices';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtInput(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseInput(s) { if (s == null) return ''; return String(s).replace(/[^0-9]/g, ''); }
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

const STATUS_BADGE = {
  draft:     { label: 'Draft',         color: 'bg-slate-200 text-slate-700' },
  sent:      { label: '⏳ Sent',       color: 'bg-amber-100 text-amber-800' },
  paid:      { label: '💰 Lunas',      color: 'bg-green-100 text-green-800' },
  overdue:   { label: '⚠ Overdue',     color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500' },
};

// R206: Helper — generate MILESTONE_OPTIONS dinamis dari paymentTemplate
function buildMilestoneOptions(paymentTemplate, priceBreakdown = {}) {
  const tpl = paymentTemplate || {};
  // P keys (P1, P2, ...) urut angka
  const templatePKeys = Object.keys(tpl)
    .filter((k) => /^P\d+$/.test(k))
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const pKeys = templatePKeys.length > 0 ? templatePKeys : ['P1', 'P2', 'P3'];

  const standard = ['DP', ...pKeys, 'Pelunasan', 'Visa', 'Asuransi', 'All-in (Pelunasan+Visa+Asuransi)'];
  const seen = new Set(standard.map((x) => x.toLowerCase()));

  // Custom milestone bernama bebas dari template (selain DP/P*/standar)
  const customFromTemplate = Object.keys(tpl).filter((k) => {
    if (/^P\d+$/.test(k)) return false;
    if (seen.has(k.toLowerCase())) return false;
    if (!(Number(tpl[k]) > 0)) return false;
    seen.add(k.toLowerCase());
    return true;
  });

  // Custom add-on dari price breakdown (_custom: [{name, price}])
  const customFromBreakdown = [];
  const customs = Array.isArray(priceBreakdown?._custom) ? priceBreakdown._custom : [];
  for (const c of customs) {
    if (!c?.name) continue;
    if (seen.has(c.name.toLowerCase())) continue;
    if (!(Number(c.price) > 0)) continue;
    seen.add(c.name.toLowerCase());
    customFromBreakdown.push(c.name);
  }

  return [...standard, ...customFromTemplate, ...customFromBreakdown, 'Custom'];
}

export default function InvoicePanelForPassenger({
  tripId, passenger, customer, invoices = [],
  priceBreakdown = {}, paidMilestones = [],
  familyGroup = null, familyMembers = [],
  paymentTemplate = {},
  scheduleDue = {},
  scheduleAmount = {},
  // Round 102e: data hitungan dari matrix
  expectedTotal = 0,
  totalPaidPerPax = 0,
  sisaPerPax = 0,
  paxExpectedMap = {},
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState(null);
  const [milestone, setMilestone] = useState('DP');
  const [customMilestone, setCustomMilestone] = useState('');
  const [amountPerPax, setAmountPerPax] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [customPerPax, setCustomPerPax] = useState(false);
  const [perPaxAmounts, setPerPaxAmounts] = useState({});

  // R206: MILESTONE_OPTIONS dinamis berdasarkan paymentTemplate
  const MILESTONE_OPTIONS = buildMilestoneOptions(paymentTemplate, priceBreakdown);

  const isFamilyHead = !!(familyGroup && passenger?.is_family_head);
  const familyMemberCount = familyMembers?.length || 0;
  const familyMemberIds = (familyMembers || []).map((m) => m.id);

  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const pendingCount = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled').length;

  function getPresetAmount(key) {
    if (!key || key === 'Custom') return 0;
    if (key === 'Pelunasan' && sisaPerPax > 0) return sisaPerPax;
    if (paymentTemplate && Object.prototype.hasOwnProperty.call(paymentTemplate, key)) {
      const v = Number(paymentTemplate[key]);
      if (v > 0) return v;
    }
    const lc = String(key).toLowerCase();
    if (priceBreakdown && Object.prototype.hasOwnProperty.call(priceBreakdown, lc)) {
      const v = Number(priceBreakdown[lc]);
      if (v > 0) return v;
    }
    const aliases = {
      Pelunasan: ['pelunasan', 'P_lunas', 'Lunas'],
      Visa: ['visa'], Asuransi: ['asuransi'], DP: ['dp', 'DP'],
    };
    const arr = aliases[key] || [];
    for (const a of arr) {
      if (paymentTemplate && Object.prototype.hasOwnProperty.call(paymentTemplate, a)) {
        const v = Number(paymentTemplate[a]);
        if (v > 0) return v;
      }
      if (priceBreakdown && Object.prototype.hasOwnProperty.call(priceBreakdown, a)) {
        const v = Number(priceBreakdown[a]);
        if (v > 0) return v;
      }
    }
    if (scheduleAmount && Number(scheduleAmount[key]) > 0) return Number(scheduleAmount[key]);
    return 0;
  }

  function getPerPaxSisa(paxId) {
    const info = paxExpectedMap[paxId];
    if (!info) return 0;
    return Math.max(info.sisa || 0, 0);
  }

  useEffect(() => {
    if (!mode) return;
    // Auto-isi due date dari jadwal trip (tetap bisa diedit per peserta)
    if (scheduleDue && scheduleDue[milestone]) setDueDate(scheduleDue[milestone]);
    if (milestone === 'Custom') return;

    const isFamily = mode === 'family_invoice' || mode === 'family_receipt';

    if (milestone === 'Pelunasan') {
      if (isFamily) {
        if (customPerPax) {
          const newMap = {};
          for (const m of familyMembers) {
            newMap[m.id] = String(getPerPaxSisa(m.id));
          }
          setPerPaxAmounts(newMap);
        } else {
          const totalFamilySisa = familyMembers.reduce((s, m) => s + getPerPaxSisa(m.id), 0);
          const avgPerPax = familyMemberCount > 0 ? Math.round(totalFamilySisa / familyMemberCount) : 0;
          setAmountPerPax(String(avgPerPax));
        }
      } else {
        setAmount(String(sisaPerPax || 0));
      }
      return;
    }

    if (milestone === 'All-in (Pelunasan+Visa+Asuransi)') {
      const est = (Number(sisaPerPax) || 0) + (getPresetAmount('Visa') || 0) + (getPresetAmount('Asuransi') || 0);
      if (isFamily) setAmountPerPax(String(est)); else setAmount(String(est));
      return;
    }

    const preset = getPresetAmount(milestone);
    if (preset > 0) {
      if (isFamily) {
        setAmountPerPax(String(preset));
        if (customPerPax) {
          const newMap = {};
          for (const m of familyMembers) newMap[m.id] = String(preset);
          setPerPaxAmounts(newMap);
        }
      } else {
        setAmount(String(preset));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone, mode, customPerPax]);

  function setPerPaxAmount(id, val) {
    setPerPaxAmounts((prev) => ({ ...prev, [id]: parseInput(val) }));
  }

  const perPaxTotal = familyMembers.reduce((s, m) => s + (parseInt(perPaxAmounts[m.id]) || 0), 0);

  function handleGenerate() {
    const finalMilestone = milestone === 'Custom' ? customMilestone : milestone;
    if (!finalMilestone) { alert('Pilih milestone'); return; }

    const isFamily = mode === 'family_invoice' || mode === 'family_receipt';
    const isReceipt = mode === 'receipt' || mode === 'family_receipt';

    let totalAmt = 0;
    let passengerAmountsMap = null;

    if (isFamily) {
      if (customPerPax) {
        const map = {};
        for (const m of familyMembers) {
          const v = parseInt(perPaxAmounts[m.id]) || 0;
          if (v > 0) map[String(m.id)] = v;
        }
        const sum = Object.values(map).reduce((s, v) => s + v, 0);
        if (sum <= 0) { alert('Minimal 1 peserta harus punya amount > 0'); return; }
        totalAmt = sum;
        passengerAmountsMap = map;
      } else {
        const perPax = parseInt(amountPerPax) || 0;
        if (perPax <= 0) { alert('Amount per pax harus > 0'); return; }
        totalAmt = perPax * familyMemberCount;
        passengerAmountsMap = {};
        for (const m of familyMembers) passengerAmountsMap[String(m.id)] = perPax;
      }
    } else {
      totalAmt = parseInt(amount) || 0;
      if (totalAmt <= 0 && finalMilestone !== 'All-in (Pelunasan+Visa+Asuransi)') { alert('Amount harus > 0'); return; }
    }

    startTransition(async () => {
      setError('');
      let r;
      const baseDesc = isFamily
        ? `${finalMilestone} — ${familyGroup?.name || 'Keluarga'} (${familyMemberCount} pax${customPerPax ? ', custom per-pax' : ''})`
        : `${finalMilestone} — ${customer?.name || 'Peserta'}`;
      const receiptDesc = isFamily
        ? `Receipt ${finalMilestone} — ${familyGroup?.name || 'Keluarga'} (${familyMemberCount} pax)`
        : `Receipt ${finalMilestone} — ${customer?.name || 'Peserta'}`;

      const familyFields = isFamily ? {
        family_group_id: familyGroup.id,
        is_family_invoice: true,
        covers_passenger_ids: familyMemberIds,
        passenger_amounts: passengerAmountsMap || {},
      } : {};

      if (isReceipt) {
        r = await createInvoiceAsPaid({
          trip_id: tripId, passenger_id: passenger.id,
          customer_id: customer?.id || passenger.customer_id,
          milestone: finalMilestone, amount: totalAmt,
          payment_date: paymentDate || null, description: receiptDesc,
          ...familyFields,
        });
      } else {
        r = await createInvoice({
          trip_id: tripId, passenger_id: passenger.id,
          customer_id: customer?.id || passenger.customer_id,
          milestone: finalMilestone, amount: totalAmt,
          due_date: dueDate || null, description: baseDesc,
          allIn: finalMilestone === 'All-in (Pelunasan+Visa+Asuransi)',
          ...familyFields,
        });
      }
      if (r?.error) { setError(r.error); return; }

      setMode(null); setAmount(''); setAmountPerPax(''); setDueDate('');
      setCustomMilestone(''); setCustomPerPax(false); setPerPaxAmounts({});
      router.refresh();
    });
  }

  function handleSendWA(invoiceId, status) {
    if (!customer?.phone) { alert('Peserta belum punya no HP. Tambah di Edit peserta.'); return; }
    const label = status === 'paid' ? 'receipt (bukti bayar)' : 'invoice (penagihan)';
    if (!confirm(`Kirim ${label} ke WhatsApp ${customer.phone}?`)) return;
    startTransition(async () => {
      const r = await sendInvoiceWA(invoiceId);
      if (r?.error) alert(r.error);
      else alert(`✓ ${status === 'paid' ? 'Receipt' : 'Invoice'} terkirim ke WA`);
      router.refresh();
    });
  }

  function handleMarkPaid(invoiceId, invoiceNo) {
    if (!confirm(`Mark ${invoiceNo} sebagai LUNAS?\n\nReceipt + info sisa pembayaran auto-kirim WA.`)) return;
    startTransition(async () => {
      const r = await markInvoicePaidManual(invoiceId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function handleDelete(invoiceId, invoiceNo) {
    if (!confirm(`Hapus invoice ${invoiceNo}?`)) return;
    startTransition(async () => {
      const r = await deleteInvoice(invoiceId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function openMode(m) {
    setMode(m); setError(''); setAmount(''); setAmountPerPax(''); setDueDate('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setCustomPerPax(false); setPerPaxAmounts({});
  }

  const isFamilyMode = mode === 'family_invoice' || mode === 'family_receipt';
  const totalFamily = customPerPax ? perPaxTotal : (parseInt(amountPerPax) || 0) * familyMemberCount;
  const currentPreset = getPresetAmount(milestone);

  const templateKeys = Object.keys(paymentTemplate || {}).filter((k) => Number(paymentTemplate[k]) > 0);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
          expanded ? 'bg-pink-100 text-pink-800' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'
        }`}
      >
        <span className="mr-1">📄</span>
        Invoice ({invoices.length})
        {isFamilyHead && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
            👨‍👩‍👧 Kepala Family ({familyMemberCount} pax)
          </span>
        )}
        {paidCount > 0 && <span className="ml-2 text-green-700">✓ {paidCount} lunas</span>}
        {pendingCount > 0 && <span className="ml-2 text-amber-700">⏳ {pendingCount} pending</span>}
        {sisaPerPax > 0 && <span className="ml-2 text-amber-700">· Sisa: {fmtRupiah(sisaPerPax)}</span>}
        <span className="ml-2 text-slate-500">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="mt-2 p-3 bg-pink-50/50 border border-pink-200 rounded-lg space-y-2">
          {invoices.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Belum ada invoice untuk peserta ini.</p>
          ) : (
            <div className="space-y-1.5">
              {invoices.map((inv) => {
                const s = STATUS_BADGE[inv.status] || STATUS_BADGE.draft;
                const coverCount = Array.isArray(inv.covers_passenger_ids) ? inv.covers_passenger_ids.length : 0;
                const hasPerPax = inv.passenger_amounts && typeof inv.passenger_amounts === 'object' && Object.keys(inv.passenger_amounts).length > 0;
                return (
                  <div key={inv.id} className="bg-white border border-slate-200 rounded p-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Link href={`/invoices/${inv.id}`} className="font-mono font-bold text-brand-700 hover:underline">
                          {inv.invoice_no}
                        </Link>
                        <span className="font-semibold">{inv.milestone}</span>
                        {inv.is_family_invoice && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                            👨‍👩‍👧 Family ({coverCount} pax){hasPerPax && ' · custom'}
                          </span>
                        )}
                        <span className="text-slate-500">·</span>
                        <span className="font-bold">{fmtRupiah(inv.amount)}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.color}`}>{s.label}</span>
                        {inv.due_date && inv.status !== 'paid' && (
                          <span className="text-[10px] text-slate-500">Due: {fmtDate(inv.due_date)}</span>
                        )}
                        {inv.paid_at && inv.status === 'paid' && (
                          <span className="text-[10px] text-green-600">Paid: {fmtDate(inv.paid_at)}</span>
                        )}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {customer?.phone && (
                          <InvoiceWAButton
                            invoiceId={inv.id}
                            isPaid={inv.status === 'paid'}
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${inv.status === 'paid' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800' : 'bg-amber-100 hover:bg-amber-200 text-amber-800'}`}
                            label={`📤 ${inv.status === 'paid' ? 'Send Receipt WA' : (inv.status === 'sent' ? 'Resend Invoice WA' : 'Send Invoice WA')}`}
                          />
                        )}
                        {inv.status !== 'paid' && (
                          <button type="button" onClick={() => handleMarkPaid(inv.id, inv.invoice_no)} disabled={pending}
                            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-100 hover:bg-green-200 text-green-800">
                            ✓ Mark Paid
                          </button>
                        )}
                        <button type="button" onClick={() => handleDelete(inv.id, inv.invoice_no)} disabled={pending}
                          className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700">
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!mode ? (
            <>
              {paidMilestones && paidMilestones.length > 0 && (
                <p className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                  💡 Sudah centang di matrix: <span className="font-bold">{paidMilestones.join(', ')}</span>
                </p>
              )}

              <div className="text-[10px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 grid grid-cols-3 gap-1">
                <span>Expected: <b>{fmtRupiah(expectedTotal)}</b></span>
                <span>Paid: <b className="text-green-700">{fmtRupiah(totalPaidPerPax)}</b></span>
                <span>Sisa: <b className="text-amber-700">{fmtRupiah(sisaPerPax)}</b></span>
              </div>

              {templateKeys.length > 0 && (
                <p className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                  📋 Template: {templateKeys.map((k) => `${k} ${fmtRupiah(paymentTemplate[k])}`).join(' · ')}
                  <span className="block text-[9px] text-slate-500 mt-0.5">Pelunasan → auto-isi SISA · DP/P1/P2 → preset template</span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => openMode('receipt')}
                  className="py-2 border-2 border-green-500 bg-green-50 hover:bg-green-100 text-green-800 text-xs font-bold rounded transition-colors">
                  📋 Pembayaran Sudah Diterima
                  <span className="block text-[9px] font-normal mt-0.5">Generate bukti / receipt (individu)</span>
                </button>
                <button type="button" onClick={() => openMode('invoice')}
                  className="py-2 border-2 border-dashed border-pink-300 hover:border-pink-500 text-pink-700 text-xs font-semibold rounded transition-colors">
                  📄 Tagih Pembayaran
                  <span className="block text-[9px] font-normal mt-0.5">Generate invoice (individu)</span>
                </button>
              </div>

              {isFamilyHead && familyMemberCount > 1 && (
                <>
                  <p className="text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 mt-2">
                    👨‍👩‍👧 <b>{familyGroup.name}</b> — 1 invoice family cover {familyMemberCount} pax, kirim ke no HP kepala
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openMode('family_receipt')}
                      className="py-2 border-2 border-indigo-500 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded transition-colors">
                      📋👨‍👩‍👧 Pembayaran Family Sudah Diterima
                      <span className="block text-[9px] font-normal mt-0.5">Receipt family ({familyMemberCount} pax)</span>
                    </button>
                    <button type="button" onClick={() => openMode('family_invoice')}
                      className="py-2 border-2 border-dashed border-indigo-400 hover:border-indigo-600 text-indigo-700 text-xs font-semibold rounded transition-colors">
                      📄👨‍👩‍👧 Tagih Family
                      <span className="block text-[9px] font-normal mt-0.5">Invoice family ({familyMemberCount} pax)</span>
                    </button>
                  </div>
                </>
              )}

              {familyGroup && !isFamilyHead && (
                <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⓘ Peserta ini anggota family <b>{familyGroup.name}</b>. Untuk invoice family, generate dari kepala.
                </p>
              )}
            </>
          ) : (
            <div className={`p-2 border rounded space-y-2 bg-white ${
              isFamilyMode ? 'border-indigo-400' :
              mode === 'receipt' ? 'border-green-400' : 'border-pink-400'
            }`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${
                isFamilyMode ? 'text-indigo-800' :
                mode === 'receipt' ? 'text-green-800' : 'text-pink-800'
              }`}>
                {mode === 'family_receipt' && `📋 👨‍👩‍👧 Family Receipt — ${familyGroup?.name} (${familyMemberCount} pax)`}
                {mode === 'family_invoice' && `📄 👨‍👩‍👧 Family Invoice — ${familyGroup?.name} (${familyMemberCount} pax)`}
                {mode === 'receipt' && '📋 Pembayaran Sudah Diterima — Generate Bukti'}
                {mode === 'invoice' && '📄 Tagih Pembayaran — Generate Invoice'}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                    Milestone {currentPreset > 0 && <span className="text-green-700 font-bold">({fmtRupiah(currentPreset)})</span>}
                  </span>
                  <select value={milestone} onChange={(e) => setMilestone(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white">
                    {MILESTONE_OPTIONS.map((m) => {
                      const preset = m !== 'Custom' ? getPresetAmount(m) : 0;
                      const isPelunasan = m === 'Pelunasan';
                      return (
                        <option key={m} value={m}>
                          {m}{preset > 0 ? ` — ${fmtRupiah(preset)}` : ''}{isPelunasan && sisaPerPax > 0 ? ' (sisa)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </label>
                {milestone === 'Custom' && (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Nama Custom</span>
                    <input autoComplete="off" type="text" value={customMilestone} onChange={(e) => setCustomMilestone(e.target.value)}
                      placeholder="e.g. Tour Optional" className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white" />
                  </label>
                )}

                {!isFamilyMode && (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Jumlah (Rp)</span>
                    <input autoComplete="off" type="text" inputMode="numeric"
                      value={fmtInput(amount)}
                      onChange={(e) => setAmount(parseInput(e.target.value))}
                      placeholder="5.000.000"
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white" />
                    {milestone === 'Pelunasan' && sisaPerPax > 0 && (
                      <span className="text-[9px] text-amber-700 block mt-0.5">
                        ✓ Auto = SISA pembayaran: {fmtRupiah(sisaPerPax)}
                      </span>
                    )}
                    {milestone !== 'Pelunasan' && currentPreset > 0 && (
                      <span className="text-[9px] text-green-700 block mt-0.5">
                        ✓ Auto dari template: {fmtRupiah(currentPreset)}
                      </span>
                    )}
                  </label>
                )}

                {mode === 'invoice' || mode === 'family_invoice' ? (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Due Date</span>
                    <input autoComplete="off" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white" />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Tanggal Bayar</span>
                    <input autoComplete="off" type="date" value={paymentDate} max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white" />
                  </label>
                )}
              </div>

              {isFamilyMode && (
                <div className="border border-indigo-200 rounded p-2 bg-indigo-50/30 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input autoComplete="off" type="checkbox" checked={customPerPax}
                      onChange={(e) => {
                        setCustomPerPax(e.target.checked);
                        if (e.target.checked) {
                          const map = {};
                          for (const m of familyMembers) {
                            if (milestone === 'Pelunasan') {
                              map[m.id] = String(getPerPaxSisa(m.id));
                            } else {
                              const base = parseInt(amountPerPax) || currentPreset || 0;
                              map[m.id] = String(base);
                            }
                          }
                          setPerPaxAmounts(map);
                        }
                      }} className="w-4 h-4" />
                    <span className="text-xs font-bold text-indigo-800">
                      ⚙ Custom amount per peserta (adult, child no bed, infant beda harga)
                    </span>
                  </label>

                  {!customPerPax ? (
                    <label className="block">
                      <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                        Jumlah PER PAX (Rp) — auto × {familyMemberCount}
                      </span>
                      <input autoComplete="off" type="text" inputMode="numeric" value={fmtInput(amountPerPax)}
                        onChange={(e) => setAmountPerPax(parseInput(e.target.value))}
                        placeholder="5.000.000"
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white" />
                      {milestone === 'Pelunasan' && (
                        <span className="text-[9px] text-amber-700 block mt-0.5">
                          ℹ Pelunasan family: average sisa per pax. Aktifkan Custom per-pax untuk sisa real per anggota.
                        </span>
                      )}
                      {milestone !== 'Pelunasan' && currentPreset > 0 && (
                        <span className="text-[9px] text-green-700 block mt-0.5">
                          ✓ Auto dari template: {fmtRupiah(currentPreset)} / pax
                        </span>
                      )}
                    </label>
                  ) : (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-700 mb-1">
                        Set amount per peserta {milestone === 'Pelunasan' && '(auto-isi SISA per anggota)'}:
                      </p>
                      <div className="space-y-1">
                        {familyMembers.map((m) => {
                          const c = m.customers || {};
                          const isHead = String(m.id) === String(familyGroup?.head_passenger_id);
                          const paxSisa = getPerPaxSisa(m.id);
                          return (
                            <div key={m.id} className="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200">
                              <span className="text-xs flex-1 min-w-0 truncate">
                                {isHead ? '👑 ' : '👤 '}
                                <span className="font-medium">{c.name || `#${m.id}`}</span>
                                {m.room_type && <span className="ml-1 text-[10px] text-slate-500">· {m.room_type}</span>}
                                {milestone === 'Pelunasan' && (
                                  <span className="ml-1 text-[10px] text-amber-700">· sisa {fmtRupiah(paxSisa)}</span>
                                )}
                              </span>
                              <input autoComplete="off" type="text" inputMode="numeric"
                                value={fmtInput(perPaxAmounts[m.id] || '')}
                                onChange={(e) => setPerPaxAmount(m.id, e.target.value)}
                                placeholder="0"
                                className="w-32 px-2 py-1 border border-slate-300 rounded text-xs text-right bg-white" />
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        💡 Isi 0 atau kosong kalau peserta itu gak ikut bayar milestone ini
                      </p>
                    </div>
                  )}

                  <div className="bg-indigo-100 border border-indigo-300 rounded p-2 text-xs">
                    <p className="font-bold text-indigo-900 flex items-center justify-between">
                      <span>📊 TOTAL INVOICE FAMILY:</span>
                      <span className="text-base">{fmtRupiah(totalFamily)}</span>
                    </p>
                    {!customPerPax && (
                      <p className="text-[10px] text-indigo-700 mt-0.5">
                        {fmtRupiah(parseInt(amountPerPax) || 0)} × {familyMemberCount} pax
                      </p>
                    )}
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-700">{error}</p>}

              <div className="flex gap-1.5 justify-end">
                <button type="button" onClick={() => { setMode(null); setError(''); setCustomPerPax(false); setPerPaxAmounts({}); }}
                  className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700">
                  Batal
                </button>
                <button type="button" onClick={handleGenerate}
                  disabled={pending || (isFamilyMode ? (customPerPax ? perPaxTotal <= 0 : !amountPerPax) : !amount)}
                  className={`px-3 py-1 text-xs font-semibold rounded text-white disabled:opacity-50 ${
                    isFamilyMode ? 'bg-indigo-500 hover:bg-indigo-600' :
                    mode === 'receipt' ? 'bg-green-500 hover:bg-green-600' : 'bg-pink-500 hover:bg-pink-600'
                  }`}>
                  {pending ? '...' :
                    mode === 'family_receipt' ? `📋👨‍👩‍👧 Catat ${familyMemberCount} pax` :
                    mode === 'family_invoice' ? `📄👨‍👩‍👧 Kirim Tagihan Family` :
                    mode === 'receipt' ? '📋 Catat Pembayaran Diterima' : '📄 Kirim Tagihan'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
