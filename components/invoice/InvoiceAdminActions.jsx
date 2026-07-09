'use client';

// Round 93: Action buttons untuk admin di /invoices/[id]
// - Send WA
// - Mark Paid Manual
// - Approve / Reject payment

import { useState, useTransition } from 'react';
import InvoiceWAButton from '@/components/invoice/InvoiceWAButton';
import { useRouter } from 'next/navigation';
import WaManualModal from '@/components/wa/WaManualModal';
import {
  sendInvoiceWA,
  markInvoicePaidManual,
  approveInvoicePayment,
  rejectInvoicePayment,
  deleteInvoice,
} from '@/lib/actions/invoices';

export default function InvoiceAdminActions({ invoice, paymentId, mode = 'invoice' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [waManual, setWaManual] = useState(null);

  // Modal WA manual ditutup manual oleh user; refresh ditunda ke onClose supaya
  // re-render pohon server tidak membuang state modal.
  function closeWaManual() {
    setWaManual(null);
    router.refresh();
  }

  function handleSendWA() {
    if (!confirm(`Kirim invoice via WhatsApp ke ${invoice.customer_name} (${invoice.customer_phone})?`)) return;
    startTransition(async () => {
      setError('');
      const r = await sendInvoiceWA(invoice.id);
      if (r?.error) { setError(r.error); router.refresh(); return; }
      if (r.wa_manual) {
        setWaManual({ message: r.wa_message, phone: r.wa_phone, name: r.customer_name });
        return; // refresh saat modal ditutup
      }
      router.refresh();
    });
  }

  function handleMarkPaid() {
    if (!confirm(`Mark invoice ${invoice.invoice_no} sebagai PAID manual? (Owner sudah cek mutasi bank)\n\nReceipt WA akan otomatis terkirim.`)) return;
    startTransition(async () => {
      setError('');
      const r = await markInvoicePaidManual(invoice.id);
      if (r?.error) { setError(r.error); router.refresh(); return; }
      if (r.wa_manual) {
        setWaManual({ message: r.wa_message, phone: r.wa_phone, name: r.customer_name });
        return; // refresh saat modal ditutup
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Hapus invoice ${invoice.invoice_no}?`)) return;
    startTransition(async () => {
      setError('');
      const r = await deleteInvoice(invoice.id);
      if (r?.error) { setError(r.error); return; }
      router.push('/invoices');
    });
  }

  function handleApprovePayment() {
    if (!confirm('Approve bukti pembayaran ini?\n\nInvoice akan mark sebagai PAID, receipt WA + info sisa pembayaran auto-terkirim ke peserta.')) return;
    startTransition(async () => {
      setError('');
      const r = await approveInvoicePayment(paymentId);
      if (r?.error) setError(r.error);
      router.refresh();
    });
  }

  function handleRejectPayment() {
    const reason = prompt('Alasan reject bukti pembayaran:');
    if (!reason) return;
    startTransition(async () => {
      setError('');
      const r = await rejectInvoicePayment(paymentId, reason);
      if (r?.error) setError(r.error);
      router.refresh();
    });
  }

  // Payment mode — buttons untuk approve/reject specific payment
  if (mode === 'payment') {
    return (
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleApprovePayment}
          disabled={pending}
          className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold rounded"
        >
          ✓ Approve & Auto-Send Receipt WA
        </button>
        <button
          type="button"
          onClick={handleRejectPayment}
          disabled={pending}
          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold rounded"
        >
          ✕ Reject
        </button>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  // Invoice mode — main actions
  return (
    <>
    <WaManualModal data={waManual} onClose={closeWaManual} title="Kirim WA manual" />
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 space-y-2">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">Actions</p>
      <div className="flex gap-2 flex-wrap">
        <InvoiceWAButton invoiceId={invoice.id} isPaid={invoice.status === 'paid'} />
        {invoice.status !== 'paid' && (
          <button
            type="button"
            onClick={handleMarkPaid}
            disabled={pending}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
          >
            ✓ Mark Paid Manual
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="px-4 py-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-sm font-semibold rounded-lg"
        >
          🗑 Hapus
        </button>
      </div>
      {!invoice.customer_phone && (
        <p className="text-xs text-amber-700">⚠ Peserta belum punya no HP — tidak bisa kirim WA. Update di Master Trip → Edit Peserta.</p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
    </>
  );
}
