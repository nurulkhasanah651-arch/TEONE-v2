'use client';

// Round 176: Payslip Actions Bar — Download PDF + Send WA (karyawan internal)
// Path: components/hr/PayslipActionsBar.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PayslipActionsBar({ entry, sendWAAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);

  function flash(text, isErr = false) {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(null), 4000);
  }

  const emp = entry.employee || {};
  const period = entry.period || {};
  const phone = emp.whatsapp || emp.phone;

  async function handleSendWA() {
    if (!phone) { flash('Karyawan belum punya nomor HP', true); return; }
    if (!confirm(`Kirim slip gaji via WA ke ${phone}?`)) return;
    startTransition(async () => {
      const r = await sendWAAction();
      if (r?.error) flash(r.error, true);
      else { flash(`✓ Slip terkirim ke ${r.target} via ${r.sentVia}`); router.refresh(); }
    });
  }

  async function handleDownloadSlip() {
    try {
      if (typeof window === 'undefined') return;
      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const w = doc.internal.pageSize.getWidth();

      // Header strip
      doc.setFillColor(99, 102, 241); // indigo
      doc.rect(0, 0, w, 14, 'F');
      doc.setTextColor(255);
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text('TEONE — TRAVELING EROPA', 14, 9);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text('Slip Gaji Karyawan', w - 14, 9, { align: 'right' });

      // Title
      let y = 24;
      doc.setTextColor(30);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('SLIP GAJI', 14, y);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(`Slip #${entry.id} · ${fmtDateTime(new Date())}`, w - 14, y, { align: 'right' });

      // KARYAWAN
      y += 8;
      doc.setDrawColor(220);
      doc.line(14, y, w - 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('KARYAWAN', 14, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.text(`Nama     : ${emp.full_name || '-'}`, 14, y); y += 5;
      doc.text(`Jabatan  : ${emp.position || emp.role || '-'}`, 14, y); y += 5;
      doc.text(`Type     : ${emp.employment_type || '-'}`, 14, y); y += 5;
      doc.text(`Periode  : ${period.period_label || '-'}`, 14, y); y += 5;
      if (emp.bank_name) {
        doc.text(`Bank     : ${emp.bank_name} · ${emp.bank_account_number || ''}`, 14, y); y += 5;
        doc.text(`a.n.     : ${emp.bank_account_holder || '-'}`, 14, y); y += 5;
      }

      // PENDAPATAN
      y += 3;
      doc.line(14, y, w - 14, y);
      y += 6;
      doc.setFont(undefined, 'bold');
      doc.text('PENDAPATAN', 14, y);
      y += 6;
      doc.setFont(undefined, 'normal');

      const incomeRows = [
        ['Gaji Pokok', entry.base_salary],
        ['Tunjangan Transport', entry.transport_allowance],
        ['Uang Makan', entry.meal_allowance],
        ['Bonus', entry.bonus],
        ['Lembur', entry.overtime],
      ].filter(([, v]) => Number(v || 0) > 0);

      let gross = 0;
      for (const [label, v] of incomeRows) {
        doc.text(label, 14, y);
        doc.text(fmtIDR(v), w - 14, y, { align: 'right' });
        gross += Number(v || 0);
        y += 5;
      }
      doc.setFont(undefined, 'bold');
      doc.text('Total Gross', 14, y);
      doc.text(fmtIDR(gross), w - 14, y, { align: 'right' });
      y += 6;
      doc.setFont(undefined, 'normal');

      // POTONGAN
      const deductRows = [
        ['BPJS Kesehatan', entry.bpjs_kesehatan_amount],
        ['BPJS Ketenagakerjaan', entry.bpjs_ketenagakerjaan_amount],
        ['Pajak (PPh)', entry.tax],
        ['Potongan Lain', entry.other_deduction],
      ].filter(([, v]) => Number(v || 0) > 0);

      if (deductRows.length > 0) {
        doc.line(14, y, w - 14, y);
        y += 6;
        doc.setFont(undefined, 'bold');
        doc.text('POTONGAN', 14, y);
        y += 6;
        doc.setFont(undefined, 'normal');
        let totalDed = 0;
        for (const [label, v] of deductRows) {
          doc.text(label, 14, y);
          doc.text('-' + fmtIDR(v), w - 14, y, { align: 'right' });
          totalDed += Number(v || 0);
          y += 5;
        }
        doc.setFont(undefined, 'bold');
        doc.text('Total Potongan', 14, y);
        doc.text('-' + fmtIDR(totalDed), w - 14, y, { align: 'right' });
        y += 6;
        doc.setFont(undefined, 'normal');
      }

      // TAKE HOME
      y += 2;
      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.5);
      doc.line(14, y, w - 14, y);
      doc.setLineWidth(0.2);
      y += 7;
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(99, 102, 241);
      doc.text('TAKE HOME PAY', 14, y);
      doc.text(fmtIDR(entry.net_pay), w - 14, y, { align: 'right' });
      y += 8;

      // Status
      doc.setFontSize(10);
      doc.setTextColor(30);
      doc.setFont(undefined, 'normal');
      const isPaid = entry.status === 'paid';
      doc.text(`Status: ${isPaid ? 'SUDAH DIBAYAR ✓' : 'PENDING'}`, 14, y);
      if (isPaid) {
        y += 5;
        doc.text(`Tgl Bayar: ${fmtDateTime(entry.paid_at)}`, 14, y);
        y += 5;
        doc.text(`Metode: ${entry.payment_method || 'transfer'}`, 14, y);
      }

      // Footer
      y = doc.internal.pageSize.getHeight() - 24;
      doc.setDrawColor(220);
      doc.line(14, y, w - 14, y);
      y += 5;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('Slip ini di-generate otomatis oleh TEONE HR System.', 14, y);
      y += 4;
      doc.text(`Generated: ${new Date().toLocaleString('id-ID')}`, 14, y);

      const filename = `slip-gaji-${(emp.full_name || 'karyawan').replace(/\s+/g, '_')}-${period.period_label?.replace(/\s+/g, '_') || period.id}.pdf`;
      doc.save(filename);
      flash('✓ Slip gaji PDF di-download');
    } catch (e) {
      flash('Error generate PDF: ' + (e?.message || 'unknown'), true);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleDownloadSlip}
        disabled={pending}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-card"
      >
        📄 Download Slip (PDF)
      </button>
      <button
        type="button"
        onClick={handleSendWA}
        disabled={pending || !phone}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-card"
        title={phone ? `Kirim ke ${phone}` : 'Karyawan belum punya nomor HP'}
      >
        📱 Kirim Slip via WhatsApp
      </button>
      {entry.wa_sent_at && (
        <span className="text-[11px] text-slate-500">
          Terakhir dikirim: {fmtDateTime(entry.wa_sent_at)} → {entry.wa_sent_to}
        </span>
      )}
      {msg && (
        <div className={`w-full mt-2 p-2 rounded text-xs ${msg.isErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
