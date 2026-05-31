'use client';

// Round 176: TL Payment Detail — mark paid, upload proof, download slip PDF, send WA
// Path: components/hr/TLPaymentDetail.jsx

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtIDRNum(n) { return Number(n || 0).toLocaleString('id-ID'); }
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

export default function TLPaymentDetail({
  payment,
  markPaidAction,
  unmarkPaidAction,
  markFinalReportAction,
  unmarkFinalReportAction,
  deleteAction,
  uploadProofAction,
  deleteProofAction,
  getProofUrlAction,
  sendWAAction,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef(null);

  const isDP = payment.payment_type === 'dp_70';
  const isPaid = payment.status === 'paid';
  const typeLabel = isDP ? '70% DP' : '30% Final';
  const typeBadgeColor = isDP ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !isPaid && payment.due_date && payment.due_date < today;
  const canPayFinal = isDP || payment.final_report_submitted;

  function flash(msg, isErr = false) {
    if (isErr) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  }

  async function handleMarkPaid(formData) {
    setError(''); setSuccess('');
    if (!canPayFinal) {
      flash('Final 30% gak bisa di-mark paid sebelum Final Report di-submit', true);
      return;
    }
    startTransition(async () => {
      const r = await markPaidAction(formData);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Marked as paid'); router.refresh(); }
    });
  }
  async function handleUnmark() {
    if (!confirm('Batalkan status PAID?')) return;
    startTransition(async () => {
      const r = await unmarkPaidAction();
      if (r?.error) flash(r.error, true);
      else { flash('✓ Status di-reset ke pending'); router.refresh(); }
    });
  }
  async function handleMarkFinalReport(formData) {
    startTransition(async () => {
      const r = await markFinalReportAction(formData);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Final Report ditandai submitted'); router.refresh(); }
    });
  }
  async function handleUnmarkFinalReport() {
    startTransition(async () => {
      const r = await unmarkFinalReportAction();
      if (r?.error) flash(r.error, true);
      else { flash('✓ Final Report di-reset'); router.refresh(); }
    });
  }
  async function handleDelete() {
    if (!confirm('Hapus payment entry ini?')) return;
    startTransition(async () => {
      const r = await deleteAction();
      if (r?.error) flash(r.error, true);
      else router.push('/hr/tl-payments');
    });
  }
  async function handleUpload(e) {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) { flash('Pilih file dulu', true); return; }
    const fd = new FormData();
    fd.append('file', fileRef.current.files[0]);
    startTransition(async () => {
      const r = await uploadProofAction(fd);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Bukti uploaded'); fileRef.current.value = ''; router.refresh(); }
    });
  }
  async function handleViewProof() {
    const r = await getProofUrlAction();
    if (r?.error) flash(r.error, true);
    else window.open(r.url, '_blank');
  }
  async function handleDeleteProof() {
    if (!confirm('Hapus bukti?')) return;
    startTransition(async () => {
      const r = await deleteProofAction();
      if (r?.error) flash(r.error, true);
      else { flash('✓ Bukti dihapus'); router.refresh(); }
    });
  }
  async function handleSendWA() {
    if (!payment.tl_phone) { flash('TL belum punya nomor HP', true); return; }
    if (!confirm(`Kirim slip via WA ke ${payment.tl_phone}?`)) return;
    startTransition(async () => {
      const r = await sendWAAction();
      if (r?.error) flash(r.error, true);
      else { flash(`✓ Slip terkirim ke ${r.target} via ${r.sentVia}`); router.refresh(); }
    });
  }

  async function handleDownloadSlip() {
    setError(''); setSuccess('');
    try {
      // Load jsPDF dari CDN (sama pattern dengan DownloadButtons di R155)
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
      let y = 18;

      // Header
      doc.setFillColor(236, 72, 153); // pink
      doc.rect(0, 0, w, 14, 'F');
      doc.setTextColor(255);
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text('TEONE — TRAVELING EROPA', 14, 9);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text('Slip Pembayaran Tour Leader', w - 14, 9, { align: 'right' });

      // Title
      y = 24;
      doc.setTextColor(30);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`SLIP TL — ${typeLabel}`, 14, y);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(`Slip #${payment.id} · ${fmtDateTime(new Date())}`, w - 14, y, { align: 'right' });

      // Section: TL
      y += 8;
      doc.setDrawColor(220);
      doc.line(14, y, w - 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('TOUR LEADER', 14, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.text(`Nama   : ${payment.tl_name || '-'}`, 14, y); y += 5;
      doc.text(`HP/WA  : ${payment.tl_phone || '-'}`, 14, y); y += 5;
      if (payment.tl_bank_name) {
        doc.text(`Bank   : ${payment.tl_bank_name} · ${payment.tl_bank_account || ''}`, 14, y); y += 5;
        doc.text(`a.n.   : ${payment.tl_bank_holder || '-'}`, 14, y); y += 5;
      }

      // Section: Trip
      y += 3;
      doc.line(14, y, w - 14, y);
      y += 6;
      doc.setFont(undefined, 'bold');
      doc.text('TRIP', 14, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.text(`Kode   : ${payment.trip_kode || payment.trip_id}`, 14, y); y += 5;
      doc.text(`Nama   : ${payment.trip_name || '-'}`, 14, y); y += 5;
      doc.text(`Date   : ${fmtDate(payment.trip_departure)} → ${fmtDate(payment.trip_return)}`, 14, y); y += 5;

      // Section: Payment
      y += 3;
      doc.line(14, y, w - 14, y);
      y += 6;
      doc.setFont(undefined, 'bold');
      doc.text('PEMBAYARAN', 14, y);
      y += 6;
      doc.setFont(undefined, 'normal');

      const rows = [
        ['Total Fee Trip', fmtIDR(payment.total_fee)],
        ['Termin', typeLabel + (isDP ? ' (sebelum keberangkatan)' : ' (setelah Final Report)')],
        ['Nominal Termin', fmtIDR(payment.amount)],
        ['Jatuh Tempo', fmtDate(payment.due_date)],
        ['Status', isPaid ? 'SUDAH DIBAYAR ✓' : isOverdue ? 'OVERDUE' : 'PENDING'],
      ];
      if (isPaid) {
        rows.push(['Tgl Bayar', fmtDateTime(payment.paid_at)]);
        rows.push(['Metode', payment.payment_method || '-']);
        rows.push(['Konfirmasi', payment.paid_by || '-']);
      }
      if (!isDP) {
        rows.push(['Final Report', payment.final_report_submitted ? `✓ Submitted (${fmtDateTime(payment.final_report_submitted_at)})` : '⏳ Belum submit']);
      }

      doc.setFontSize(10);
      for (const [k, v] of rows) {
        doc.setFont(undefined, 'bold');
        doc.text(k, 14, y);
        doc.setFont(undefined, 'normal');
        doc.text(String(v), 70, y);
        y += 5;
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

      const filename = `slip-tl-${(payment.tl_name || 'tl').replace(/\s+/g, '_')}-${payment.trip_kode || payment.trip_id}-${payment.payment_type}.pdf`;
      doc.save(filename);
      flash('✓ Slip PDF di-download');
    } catch (e) {
      flash('Error generate PDF: ' + (e?.message || 'unknown'), true);
    }
  }

  return (
    <div className="space-y-4">
      {/* HEADER CARD */}
      <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl border border-pink-200 shadow-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeBadgeColor}`}>{typeLabel}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                isPaid ? 'bg-green-100 text-green-700' :
                isOverdue ? 'bg-red-100 text-red-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {isPaid ? '✓ PAID' : isOverdue ? '⚠ OVERDUE' : '⏳ PENDING'}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-brand-700">{payment.tl_name}</h1>
            <p className="text-sm text-slate-600 mt-1">
              {payment.trip_kode} — {payment.trip_name}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              📅 {fmtDate(payment.trip_departure)} {payment.trip_return ? `→ ${fmtDate(payment.trip_return)}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-slate-500">Nominal</p>
            <p className="text-3xl font-bold text-brand-700 font-mono">{fmtIDR(payment.amount)}</p>
            <p className="text-xs text-slate-500 mt-1">dari total fee {fmtIDR(payment.total_fee)}</p>
            <p className="text-xs text-slate-600 mt-1">Jatuh Tempo: <span className={isOverdue ? 'text-red-600 font-bold' : 'font-semibold'}>{fmtDate(payment.due_date)}</span></p>
          </div>
        </div>
      </div>

      {/* ACTIONS BAR — DOWNLOAD + WA */}
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
          disabled={pending || !payment.tl_phone}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-card"
          title={payment.tl_phone ? `Kirim ke ${payment.tl_phone}` : 'TL belum punya nomor HP'}
        >
          📱 Kirim Slip via WhatsApp
        </button>
        {payment.wa_sent_at && (
          <span className="text-[11px] text-slate-500">
            Terakhir dikirim: {fmtDateTime(payment.wa_sent_at)} → {payment.wa_sent_to}
          </span>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {/* FINAL REPORT GATE (only for final_30) */}
      {!isDP && (
        <div className={`rounded-xl border shadow-card p-4 ${payment.final_report_submitted ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="text-xs font-bold uppercase text-slate-700">⚐ Final Report Gate</p>
          {payment.final_report_submitted ? (
            <>
              <p className="mt-2 text-sm text-green-800">
                ✓ Final Report sudah di-submit pada <b>{fmtDateTime(payment.final_report_submitted_at)}</b>
              </p>
              {payment.final_report_notes && <p className="mt-1 text-xs text-slate-600">Catatan: {payment.final_report_notes}</p>}
              <button onClick={handleUnmarkFinalReport} disabled={pending} className="mt-3 text-xs text-red-600 hover:underline">
                ↶ Reset (batal submitted)
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-amber-900">
                ⏳ Final 30% akan ter-unlock setelah Final Report di-mark submitted.
              </p>
              <form action={handleMarkFinalReport} className="mt-3 space-y-2">
                <textarea
                  name="final_report_notes"
                  rows="2"
                  placeholder="Catatan (opsional): link laporan, summary trip, dll"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button type="submit" disabled={pending} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
                  ✓ Tandai Final Report Submitted
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* MARK PAID */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <p className="text-xs font-bold uppercase text-brand-700">💰 Status Pembayaran</p>
        {isPaid ? (
          <div className="mt-3 space-y-1 text-sm">
            <p>✅ <b>Dibayar:</b> {fmtDateTime(payment.paid_at)}</p>
            <p>💵 <b>Nominal:</b> {fmtIDR(payment.paid_amount || payment.amount)}</p>
            <p>💳 <b>Metode:</b> {payment.payment_method || '-'}</p>
            <p>👤 <b>Confirmed by:</b> {payment.paid_by || '-'}</p>
            {payment.notes && <p>📝 <b>Catatan:</b> {payment.notes}</p>}
            <button onClick={handleUnmark} disabled={pending} className="mt-3 text-xs text-red-600 hover:underline">
              ↶ Reset ke pending
            </button>
          </div>
        ) : (
          <form action={handleMarkPaid} className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nominal Dibayar">
              <input type="text" inputMode="numeric" name="paid_amount" defaultValue={fmtIDRNum(payment.amount)} className={inputCls} />
            </Field>
            <Field label="Metode">
              <select name="payment_method" defaultValue="transfer" className={inputCls}>
                <option value="transfer">Transfer Bank</option>
                <option value="cash">Cash</option>
                <option value="ewallet">E-Wallet</option>
                <option value="other">Lainnya</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Catatan (opsional)">
                <textarea name="notes" rows="2" className={inputCls + ' resize-y'} />
              </Field>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <button type="submit" disabled={pending || !canPayFinal} className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
                {pending ? '⏳ Saving...' : '✓ Mark as Paid'}
              </button>
              {!canPayFinal && (
                <span className="text-xs text-amber-700">⚠ Submit Final Report dulu sebelum mark paid</span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* PAYMENT PROOF UPLOAD */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <p className="text-xs font-bold uppercase text-brand-700">📎 Bukti Transfer</p>
        {payment.payment_proof_url ? (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button onClick={handleViewProof} disabled={pending} className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold rounded">
              👁 Lihat Bukti
            </button>
            <button onClick={handleDeleteProof} disabled={pending} className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded">
              🗑 Hapus
            </button>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="mt-3 flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-xs" />
            <button type="submit" disabled={pending} className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold rounded">
              {pending ? 'Uploading...' : 'Upload Bukti'}
            </button>
          </form>
        )}
      </div>

      {/* DELETE */}
      <div className="text-right">
        <button onClick={handleDelete} disabled={pending} className="text-xs text-red-600 hover:underline">
          🗑 Hapus payment entry ini
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
