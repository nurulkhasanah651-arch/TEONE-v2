'use client';

// Round 93: Button "Generate Invoice" untuk Payment Checklist row
// Pakai di /finance/payments/[trip] per peserta per milestone

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInvoice, sendInvoiceWA } from '@/lib/actions/invoices';
import WaManualModal from '@/components/wa/WaManualModal';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

export default function GenerateInvoiceButton({
  tripId,
  passengerId,
  customerId,
  milestone,
  amount,
  dueDate,
  customerName,
  customerPhone,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [generated, setGenerated] = useState(null);
  const [waManual, setWaManual] = useState(null);

  // Modal WA manual ditutup manual oleh user; refresh ditunda ke onClose supaya
  // re-render pohon server tidak membuang state modal.
  function closeWaManual() {
    setWaManual(null);
    router.refresh();
  }

  function handleGenerate() {
    if (!amount || amount <= 0) { alert('Amount harus > 0'); return; }
    if (!confirm(`Generate Invoice untuk ${customerName}\nMilestone: ${milestone}\nJumlah: ${fmtRupiah(amount)}`)) return;

    startTransition(async () => {
      const r = await createInvoice({
        trip_id: tripId,
        passenger_id: passengerId,
        customer_id: customerId,
        milestone,
        amount,
        due_date: dueDate,
        description: `${milestone} — ${customerName || 'Peserta'}`,
      });

      if (r?.error) {
        alert('Error: ' + r.error);
        return;
      }
      setGenerated({ id: r.invoice_id, no: r.invoice_no, token: r.token });
      router.refresh();
    });
  }

  function handleSendNow() {
    if (!generated?.id) return;
    if (!customerPhone) { alert('Peserta belum punya no HP'); return; }
    if (!confirm(`Kirim invoice ${generated.no} ke WhatsApp ${customerPhone}?`)) return;

    startTransition(async () => {
      const r = await sendInvoiceWA(generated.id);
      if (r?.error) {
        alert('Send WA error: ' + r.error);
        return;
      }
      if (r.wa_manual) {
        setWaManual({ message: r.wa_message, phone: r.wa_phone, name: r.customer_name || customerName });
        return; // refresh saat modal ditutup
      }
      alert('✓ Invoice terkirim via WA');
      setGenerated(null);
      router.refresh();
    });
  }

  if (generated) {
    return (
      <div className="flex gap-1 flex-wrap">
        <WaManualModal data={waManual} onClose={closeWaManual} title="Invoice dibuat — kirim WA manual" />
        <span className="px-2 py-0.5 text-[10px] font-bold text-green-700 bg-green-100 rounded">
          ✓ {generated.no}
        </span>
        <button
          type="button"
          onClick={handleSendNow}
          disabled={pending}
          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
        >
          📤 Send WA
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={pending}
      className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-100 hover:bg-blue-200 text-blue-700"
      title={`Generate invoice ${milestone} Rp ${(amount || 0).toLocaleString('id-ID')}`}
    >
      {pending ? '...' : '📄 Generate Invoice'}
    </button>
  );
}
