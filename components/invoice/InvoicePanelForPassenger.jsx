'use client';

// Round 95: Inline invoice panel per peserta di /trips/[id]
// - List existing invoices peserta ini
// - Per invoice: status + button Send WA / Resend Receipt / Mark Paid
// - Tombol "+ Generate Invoice Baru" → inline form

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  createInvoice,
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
  passenger,        // { id, customer_id, room_type, ... }
  customer,         // { id, name, phone, email, ... }
  invoices = [],    // list invoice yang sudah ada untuk peserta ini
  priceBreakdown = {}, // dari trip.price_breakdown
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [milestone, setMilestone] = useState('DP');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [customMilestone, setCustomMilestone] = useState('');
  const [autoSend, setAutoSend] = useState(true);
  const [error, setError] = useState('');

  const paidCount = invoices.filter((i) => i.status === 'paid').length;
  const unpaidCount = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled').length;

  function handleGenerate() {
    const finalMilestone = milestone === 'Custom' ? customMilestone : milestone;
    if (!finalMilestone) { alert('Pilih milestone'); return; }
    const amt = parseInt(amount) || 0;
    if (amt <= 0) { alert('Amount harus > 0'); return; }
    if (!customer?.phone && autoSend) {
      alert('Peserta belum punya no HP. Tambah di Edit peserta dulu, atau matikan Auto-Send.');
      return;
    }

    startTransition(async () => {
      setError('');
      const r = await createInvoice({
        trip_id: tripId,
        passenger_id: passenger.id,
        customer_id: customer?.id || passenger.customer_id,
        milestone: finalMilestone,
        amount: amt,
        due_date: dueDate || null,
        description: `${finalMilestone} — ${customer?.name || 'Peserta'}`,
      });
      if (r?.error) { setError(r.error); return; }

      // Auto-send WA
      if (autoSend && r.invoice_id) {
        const s = await sendInvoiceWA(r.invoice_id);
        if (s?.error) {
          alert('Invoice dibuat tapi gagal kirim WA: ' + s.error);
        }
      }

      setShowForm(false);
      setAmount('');
      setDueDate('');
      setCustomMilestone('');
      router.refresh();
    });
  }

  function handleSendWA(invoiceId) {
    if (!confirm(`Kirim invoice ke WA ${customer?.phone}?`)) return;
    startTransition(async () => {
      const r = await sendInvoiceWA(invoiceId);
      if (r?.error) alert(r.error);
      else alert('✓ Terkirim');
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

  function quickFillAmount(key) {
    // Quick fill dari breakdown (mis. klik "DP" auto-fill amount dari template)
    const presets = {
      DP: 5000000,
      P1: 5000000,
      P2: 5000000,
      P3: 5000000,
      Pelunasan: 0,
      Visa: priceBreakdown.visa || 0,
      Asuransi: priceBreakdown.asuransi || 0,
    };
    return presets[key] || 0;
  }

  function handleMilestoneChange(val) {
    setMilestone(val);
    if (val !== 'Custom') {
      const preset = quickFillAmount(val);
      if (preset > 0) setAmount(String(preset));
    }
  }

  return (
    <div className="mt-2">
      {/* Toggle button */}
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
        {unpaidCount > 0 && <span className="ml-2 text-amber-700">⏳ {unpaidCount} pending</span>}
        <span className="ml-2 text-slate-500">{expanded ? '▴' : '▾'}</span>
      </button>

      {/* Expanded panel */}
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
                        {inv.due_date && (
                          <span className="text-[10px] text-slate-500">Due: {fmtDate(inv.due_date)}</span>
                        )}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {inv.status !== 'paid' && customer?.phone && (
                          <button
                            type="button"
                            onClick={() => handleSendWA(inv.id)}
                            disabled={pending}
                            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
                          >
                            📤 {inv.status === 'sent' ? 'Resend' : 'Send'} WA
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
                        {inv.status === 'paid' && customer?.phone && (
                          <button
                            type="button"
                            onClick={() => handleSendWA(inv.id)}
                            disabled={pending}
                            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 hover:bg-blue-200 text-blue-800"
                          >
                            📤 Resend Receipt
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

          {/* Generate new invoice form */}
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full py-1.5 border-2 border-dashed border-pink-300 hover:border-pink-500 text-pink-700 text-xs font-semibold rounded transition-colors"
            >
              + Generate Invoice Baru
            </button>
          ) : (
            <div className="p-2 bg-white border border-pink-300 rounded space-y-2">
              <p className="text-xs font-bold text-pink-800 uppercase tracking-wider">Generate Invoice Baru</p>

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
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Due Date</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                  />
                </label>
              </div>

              <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={autoSend}
                  onChange={(e) => setAutoSend(e.target.checked)}
                />
                <span>📤 Auto-send WA setelah generate</span>
                {!customer?.phone && <span className="text-red-600">(peserta belum punya no HP)</span>}
              </label>

              {error && <p className="text-xs text-red-700">{error}</p>}

              <div className="flex gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(''); }}
                  className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={pending || !amount}
                  className="px-3 py-1 text-xs font-semibold rounded bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white"
                >
                  {pending ? '...' : (autoSend ? '📄 Generate + Send WA' : '📄 Generate')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
