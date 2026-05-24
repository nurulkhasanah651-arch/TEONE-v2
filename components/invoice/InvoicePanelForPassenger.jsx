'use client';

// Round 100: InvoicePanel — family-aware
// - Kalau peserta = kepala family, tambah option "Generate Family Invoice"
//   yang cover semua anggota family + amount auto = base × N peserta
// - Otherwise: same as Round 100b

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  createInvoice,
  createInvoiceAsPaid,
  sendInvoiceWA,
  markInvoicePaidManual,
  deleteInvoice,
} from '@/lib/actions/invoices';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}
function fmtInput(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseInput(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}
function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

const STATUS_BADGE = {
  draft:     { label: 'Draft',         color: 'bg-slate-200 text-slate-700' },
  sent:      { label: '⏳ Sent',       color: 'bg-amber-100 text-amber-800' },
  paid:      { label: '💰 Lunas',      color: 'bg-green-100 text-green-800' },
  overdue:   { label: '⚠ Overdue',     color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500' },
};

const MILESTONE_OPTIONS = ['DP', 'P1', 'P2', 'P3', 'Pelunasan', 'Visa', 'Asuransi', 'Custom'];

export default function InvoicePanelForPassenger({
  tripId,
  passenger,
  customer,
  invoices = [],
  priceBreakdown = {},
  paidMilestones = [],
  familyGroup = null,         // Round 100: family info (jika peserta kepala family)
  familyMembers = [],         // Round 100: array of passenger objects (full family termasuk kepala)
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  // mode: 'invoice' | 'receipt' | 'family_invoice' | 'family_receipt' | null
  const [mode, setMode] = useState(null);
  const [milestone, setMilestone] = useState('DP');
  const [customMilestone, setCustomMilestone] = useState('');
  const [amountPerPax, setAmountPerPax] = useState('');   // for family: harga per pax (auto x N)
  const [amount, setAmount] = useState('');               // for individual
  const [dueDate, setDueDate] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  // Family head detection
  const isFamilyHead = !!(familyGroup && passenger?.is_family_head);
  const familyMemberCount = familyMembers?.length || 0;
  const familyMemberIds = (familyMembers || []).map((m) => m.id);

  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const pendingCount = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled').length;

  function handleGenerate() {
    const finalMilestone = milestone === 'Custom' ? customMilestone : milestone;
    if (!finalMilestone) { alert('Pilih milestone'); return; }

    const isFamily = mode === 'family_invoice' || mode === 'family_receipt';
    const isReceipt = mode === 'receipt' || mode === 'family_receipt';

    let totalAmt = 0;
    if (isFamily) {
      const perPax = parseInt(amountPerPax) || 0;
      if (perPax <= 0) { alert('Amount per pax harus > 0'); return; }
      totalAmt = perPax * familyMemberCount;
    } else {
      totalAmt = parseInt(amount) || 0;
      if (totalAmt <= 0) { alert('Amount harus > 0'); return; }
    }

    startTransition(async () => {
      setError('');
      let r;
      const baseDesc = isFamily
        ? `${finalMilestone} — ${familyGroup?.name || 'Keluarga'} (${familyMemberCount} pax)`
        : `${finalMilestone} — ${customer?.name || 'Peserta'}`;
      const receiptDesc = isFamily
        ? `Receipt ${finalMilestone} — ${familyGroup?.name || 'Keluarga'} (${familyMemberCount} pax)`
        : `Receipt ${finalMilestone} — ${customer?.name || 'Peserta'}`;

      const familyFields = isFamily ? {
        family_group_id: familyGroup.id,
        is_family_invoice: true,
        covers_passenger_ids: familyMemberIds,
      } : {};

      if (isReceipt) {
        r = await createInvoiceAsPaid({
          trip_id: tripId,
          passenger_id: passenger.id,
          customer_id: customer?.id || passenger.customer_id,
          milestone: finalMilestone,
          amount: totalAmt,
          payment_date: paymentDate || null,
          description: receiptDesc,
          ...familyFields,
        });
      } else {
        r = await createInvoice({
          trip_id: tripId,
          passenger_id: passenger.id,
          customer_id: customer?.id || passenger.customer_id,
          milestone: finalMilestone,
          amount: totalAmt,
          due_date: dueDate || null,
          description: baseDesc,
          ...familyFields,
        });
      }
      if (r?.error) { setError(r.error); return; }

      setMode(null);
      setAmount('');
      setAmountPerPax('');
      setDueDate('');
      setCustomMilestone('');
      router.refresh();
    });
  }

  function handleSendWA(invoiceId) {
    if (!customer?.phone) {
      alert('Peserta belum punya no HP. Tambah di Edit peserta.');
      return;
    }
    if (!confirm(`Kirim invoice ke WhatsApp ${customer.phone}?`)) return;
    startTransition(async () => {
      const r = await sendInvoiceWA(invoiceId);
      if (r?.error) alert(r.error);
      else alert('✓ Invoice terkirim ke WA');
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

  function quickAmount(key) {
    const presets = {
      Visa: priceBreakdown.visa || 0,
      Asuransi: priceBreakdown.asuransi || 0,
    };
    return presets[key] || 0;
  }

  function handleMilestoneChange(val) {
    setMilestone(val);
    if (val !== 'Custom') {
      const preset = quickAmount(val);
      if (preset > 0) {
        if (mode === 'family_invoice' || mode === 'family_receipt') {
          setAmountPerPax(String(preset));
        } else {
          setAmount(String(preset));
        }
      }
    }
  }

  function openMode(m) {
    setMode(m);
    setError('');
    setAmount('');
    setAmountPerPax('');
    setDueDate('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
  }

  const isFamilyMode = mode === 'family_invoice' || mode === 'family_receipt';
  const totalFamily = (parseInt(amountPerPax) || 0) * familyMemberCount;

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
        <span className="ml-2 text-slate-500">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="mt-2 p-3 bg-pink-50/50 border border-pink-200 rounded-lg space-y-2">
          {/* Existing invoices */}
          {invoices.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Belum ada invoice untuk peserta ini.</p>
          ) : (
            <div className="space-y-1.5">
              {invoices.map((inv) => {
                const s = STATUS_BADGE[inv.status] || STATUS_BADGE.draft;
                const coverCount = Array.isArray(inv.covers_passenger_ids) ? inv.covers_passenger_ids.length : 0;
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
                            👨‍👩‍👧 Family ({coverCount} pax)
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
                          <button
                            type="button"
                            onClick={() => handleSendWA(inv.id)}
                            disabled={pending}
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                              inv.status === 'paid'
                                ? 'bg-blue-100 hover:bg-blue-200 text-blue-800'
                                : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                            }`}
                          >
                            📤 {inv.status === 'paid' ? 'Send Receipt WA' : (inv.status === 'sent' ? 'Resend WA' : 'Send WA')}
                          </button>
                        )}
                        {inv.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(inv.id, inv.invoice_no)}
                            disabled={pending}
                            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-100 hover:bg-green-200 text-green-800"
                          >
                            ✓ Mark Paid
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(inv.id, inv.invoice_no)}
                          disabled={pending}
                          className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700"
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

          {/* Generate buttons */}
          {!mode ? (
            <>
              {paidMilestones && paidMilestones.length > 0 && (
                <p className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                  💡 Sudah centang di matrix: <span className="font-bold">{paidMilestones.join(', ')}</span> — generate bukti pembayaran ↓
                </p>
              )}

              {/* Individual options */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openMode('receipt')}
                  className="py-2 border-2 border-green-500 bg-green-50 hover:bg-green-100 text-green-800 text-xs font-bold rounded transition-colors"
                >
                  📋 Pembayaran Sudah Diterima
                  <span className="block text-[9px] font-normal mt-0.5">Generate bukti / receipt (individu)</span>
                </button>
                <button
                  type="button"
                  onClick={() => openMode('invoice')}
                  className="py-2 border-2 border-dashed border-pink-300 hover:border-pink-500 text-pink-700 text-xs font-semibold rounded transition-colors"
                >
                  📄 Tagih Pembayaran
                  <span className="block text-[9px] font-normal mt-0.5">Generate invoice (individu)</span>
                </button>
              </div>

              {/* FAMILY options — hanya muncul kalau kepala family */}
              {isFamilyHead && familyMemberCount > 1 && (
                <>
                  <p className="text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 mt-2">
                    👨‍👩‍👧 <b>{familyGroup.name}</b> — 1 invoice family cover {familyMemberCount} pax, kirim ke no HP kepala saja
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openMode('family_receipt')}
                      className="py-2 border-2 border-indigo-500 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded transition-colors"
                    >
                      📋👨‍👩‍👧 Pembayaran Family Sudah Diterima
                      <span className="block text-[9px] font-normal mt-0.5">Receipt family ({familyMemberCount} pax)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openMode('family_invoice')}
                      className="py-2 border-2 border-dashed border-indigo-400 hover:border-indigo-600 text-indigo-700 text-xs font-semibold rounded transition-colors"
                    >
                      📄👨‍👩‍👧 Tagih Family
                      <span className="block text-[9px] font-normal mt-0.5">Invoice family ({familyMemberCount} pax)</span>
                    </button>
                  </div>
                </>
              )}

              {/* Warning for non-head family members */}
              {familyGroup && !isFamilyHead && (
                <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⓘ Peserta ini anggota family <b>{familyGroup.name}</b>. Untuk invoice family, generate dari kepala keluarga.
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
                  <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Milestone</span>
                  <select
                    value={milestone}
                    onChange={(e) => handleMilestoneChange(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                  >
                    {MILESTONE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                {milestone === 'Custom' && (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Nama Custom</span>
                    <input
                      type="text"
                      value={customMilestone}
                      onChange={(e) => setCustomMilestone(e.target.value)}
                      placeholder="e.g. Tour Optional"
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                    />
                  </label>
                )}

                {isFamilyMode ? (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                      Jumlah PER PAX (Rp) — auto × {familyMemberCount}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fmtInput(amountPerPax)}
                      onChange={(e) => setAmountPerPax(parseInput(e.target.value))}
                      placeholder="5.000.000"
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Jumlah (Rp)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fmtInput(amount)}
                      onChange={(e) => setAmount(parseInput(e.target.value))}
                      placeholder="5.000.000"
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                    />
                  </label>
                )}

                {mode === 'invoice' || mode === 'family_invoice' ? (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Due Date</span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Tanggal Bayar</span>
                    <input
                      type="date"
                      value={paymentDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                    />
                  </label>
                )}
              </div>

              {isFamilyMode && (
                <div className="p-2 bg-indigo-50 border border-indigo-200 rounded text-xs">
                  <p className="font-bold text-indigo-800">📊 Preview Family Invoice</p>
                  <p className="text-indigo-700 mt-0.5">
                    {fmtRupiah(parseInt(amountPerPax) || 0)} × {familyMemberCount} pax = <b>{fmtRupiah(totalFamily)}</b>
                  </p>
                  <p className="text-[10px] text-indigo-600 mt-1">
                    Sync auto ke {familyMemberCount} peserta di Payment Checklist matrix (Rp {Math.round(totalFamily / familyMemberCount).toLocaleString('id-ID')} per pax)
                  </p>
                </div>
              )}

              {error && <p className="text-xs text-red-700">{error}</p>}

              <p className="text-[10px] text-slate-500">
                ℹ️ Generate doang. Setelah tergenerate, ada tombol <b>📤 Send WA</b> di row invoice untuk kirim ke
                {isFamilyMode ? ' kepala family' : ' peserta'}.
              </p>

              <div className="flex gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => { setMode(null); setError(''); }}
                  className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={pending || (isFamilyMode ? !amountPerPax : !amount)}
                  className={`px-3 py-1 text-xs font-semibold rounded text-white disabled:opacity-50 ${
                    isFamilyMode ? 'bg-indigo-500 hover:bg-indigo-600' :
                    mode === 'receipt' ? 'bg-green-500 hover:bg-green-600' : 'bg-pink-500 hover:bg-pink-600'
                  }`}
                >
                  {pending ? '...' :
                    mode === 'family_receipt' ? `📋👨‍👩‍👧 Catat ${familyMemberCount} pax` :
                    mode === 'family_invoice' ? `📄👨‍👩‍👧 Kirim Tagihan Family` :
                    mode === 'receipt' ? '📋 Catat Pembayaran Diterima' :
                    '📄 Kirim Tagihan'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
