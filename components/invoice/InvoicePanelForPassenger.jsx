'use client';

// Round 97: InvoicePanel — SPLIT Generate vs Send WA + Generate Receipt
// - "📄 Generate Invoice" (status draft) untuk yang belum dibayar
// - "📋 Generate Receipt" (status paid) untuk yang sudah dibayar
// - Tombol "📤 Send WA" terpisah, klik kapan aja

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
  paidMilestones = [],  // Round 100b: milestone yang udah ✓ di matrix
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState(null); // 'invoice' | 'receipt' | null
  const [milestone, setMilestone] = useState('DP');
  const [customMilestone, setCustomMilestone] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const pendingCount = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled').length;

  function handleGenerate() {
    const finalMilestone = milestone === 'Custom' ? customMilestone : milestone;
    if (!finalMilestone) { alert('Pilih milestone'); return; }
    const amt = parseInt(amount) || 0;
    if (amt <= 0) { alert('Amount harus > 0'); return; }

    startTransition(async () => {
      setError('');
      let r;
      if (mode === 'receipt') {
        r = await createInvoiceAsPaid({
          trip_id: tripId,
          passenger_id: passenger.id,
          customer_id: customer?.id || passenger.customer_id,
          milestone: finalMilestone,
          amount: amt,
          payment_date: paymentDate || null,
          description: `Receipt ${finalMilestone} — ${customer?.name || 'Peserta'}`,
        });
      } else {
        r = await createInvoice({
          trip_id: tripId,
          passenger_id: passenger.id,
          customer_id: customer?.id || passenger.customer_id,
          milestone: finalMilestone,
          amount: amt,
          due_date: dueDate || null,
          description: `${finalMilestone} — ${customer?.name || 'Peserta'}`,
        });
      }
      if (r?.error) { setError(r.error); return; }

      setMode(null);
      setAmount('');
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
      if (preset > 0) setAmount(String(preset));
    }
  }

  function openInvoiceForm() {
    setMode('invoice');
    setError('');
    setAmount('');
    setDueDate('');
  }

  function openReceiptForm() {
    setMode('receipt');
    setError('');
    setAmount('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
  }

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
                return (
                  <div key={inv.id} className="bg-white border border-slate-200 rounded p-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Link href={`/invoices/${inv.id}`} className="font-mono font-bold text-brand-700 hover:underline">
                          {inv.invoice_no}
                        </Link>
                        <span className="font-semibold">{inv.milestone}</span>
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
              {/* Hint kalau ada milestone yang udah ✓ di matrix tapi belum ada receipt invoice-nya */}
              {paidMilestones && paidMilestones.length > 0 && (
                <p className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                  💡 Sudah centang di matrix: <span className="font-bold">{paidMilestones.join(', ')}</span> — generate bukti pembayaran ↓
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openReceiptForm}
                  className="py-2 border-2 border-green-500 bg-green-50 hover:bg-green-100 text-green-800 text-xs font-bold rounded transition-colors"
                >
                  📋 Pembayaran Sudah Diterima
                  <span className="block text-[9px] font-normal mt-0.5">Generate bukti / receipt</span>
                </button>
                <button
                  type="button"
                  onClick={openInvoiceForm}
                  className="py-2 border-2 border-dashed border-pink-300 hover:border-pink-500 text-pink-700 text-xs font-semibold rounded transition-colors"
                >
                  📄 Tagih Pembayaran
                  <span className="block text-[9px] font-normal mt-0.5">Generate invoice (belum bayar)</span>
                </button>
              </div>
            </>
          ) : (
            <div className={`p-2 border rounded space-y-2 bg-white ${
              mode === 'receipt' ? 'border-green-400' : 'border-pink-400'
            }`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${
                mode === 'receipt' ? 'text-green-800' : 'text-pink-800'
              }`}>
                {mode === 'receipt' ? '📋 Pembayaran Sudah Diterima — Generate Bukti' : '📄 Tagih Pembayaran — Generate Invoice'}
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
                {mode === 'invoice' ? (
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

              {error && <p className="text-xs text-red-700">{error}</p>}

              <p className="text-[10px] text-slate-500">
                ℹ️ Generate doang. Setelah tergenerate, ada tombol <b>📤 Send WA</b> di row invoice untuk kirim ke peserta.
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
                  disabled={pending || !amount}
                  className={`px-3 py-1 text-xs font-semibold rounded text-white disabled:opacity-50 ${
                    mode === 'receipt' ? 'bg-green-500 hover:bg-green-600' : 'bg-pink-500 hover:bg-pink-600'
                  }`}
                >
                  {pending ? '...' : (mode === 'receipt' ? '📋 Catat Pembayaran Diterima' : '📄 Kirim Tagihan')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
