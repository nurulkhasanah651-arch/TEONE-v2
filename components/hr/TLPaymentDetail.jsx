'use client';

// Round 177: TL Payment Detail — + Approve/Reject + status flow
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

const STATUS = {
  requested: { label: '⏳ DIAJUKAN',  cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: '✓ APPROVED',   cls: 'bg-blue-100 text-blue-700' },
  paid:      { label: '✅ PAID',      cls: 'bg-green-100 text-green-700' },
  rejected:  { label: '✗ REJECTED',   cls: 'bg-red-100 text-red-700' },
  pending:   { label: '⏳ PENDING',   cls: 'bg-slate-100 text-slate-700' },
};

export default function TLPaymentDetail({
  payment,
  approveAction,
  rejectAction,
  resetAction,
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
  const isApproved = payment.status === 'approved';
  const isRequested = payment.status === 'requested';
  const isRejected = payment.status === 'rejected';
  const isPending = payment.status === 'pending';
  const typeLabel = isDP ? '70% DP' : '30% Final';
  const typeBadgeColor = isDP ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  const statusInfo = STATUS[payment.status] || STATUS.pending;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !isPaid && !isRejected && payment.due_date && payment.due_date < today;
  const canPayFinal = isDP || payment.final_report_submitted;

  function flash(msg, isErr = false) {
    if (isErr) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  }

  // ============ APPROVE ============
  async function handleApprove(formData) {
    setError(''); setSuccess('');
    startTransition(async () => {
      const r = await approveAction(formData);
      if (r?.error) flash(r.error, true);
      else { flash(r.message || '✓ Request approved'); router.refresh(); }
    });
  }

  // ============ REJECT ============
  async function handleReject(formData) {
    setError(''); setSuccess('');
    startTransition(async () => {
      const r = await rejectAction(formData);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Request di-reject'); router.refresh(); }
    });
  }

  async function handleReset() {
    if (!confirm('Reset status ke "requested"? Kalau ada entry HPP terkait akan ikut dihapus.')) return;
    startTransition(async () => {
      const r = await resetAction();
      if (r?.error) flash(r.error, true);
      else { flash('✓ Reset ke requested'); router.refresh(); }
    });
  }

  // ============ MARK PAID ============
  async function handleMarkPaid(formData) {
    setError(''); setSuccess('');
    if (!canPayFinal) {
      flash('Final 30% gak bisa dibayar sebelum Final Report di-submit', true);
      return;
    }
    startTransition(async () => {
      const r = await markPaidAction(formData);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Marked as paid — hpp_items.is_paid jadi true (masuk real cashflow)'); router.refresh(); }
    });
  }

  async function handleUnmark() {
    if (!confirm('Batalkan status PAID? hpp_items akan balik ke is_paid=false.')) return;
    startTransition(async () => {
      const r = await unmarkPaidAction();
      if (r?.error) flash(r.error, true);
      else { flash('✓ Reset ke approved'); router.refresh(); }
    });
  }

  // ============ FINAL REPORT ============
  async function handleMarkFinalReport(formData) {
    startTransition(async () => {
      const r = await markFinalReportAction(formData);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Final Report submitted'); router.refresh(); }
    });
  }
  async function handleUnmarkFinalReport() {
    startTransition(async () => {
      const r = await unmarkFinalReportAction();
      if (r?.error) flash(r.error, true);
      else { flash('✓ Reset'); router.refresh(); }
    });
  }

  async function handleDelete() {
    if (!confirm('Hapus permanently? hpp_items terkait juga akan dihapus.')) return;
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

      doc.setFillColor(236, 72, 153);
      doc.rect(0, 0, w, 14, 'F');
      doc.setTextColor(255);
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text('TEONE — TRAVELING EROPA', 14, 9);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text('Slip Pembayaran Tour Leader', w - 14, 9, { align: 'right' });

      y = 24;
      doc.setTextColor(30);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`SLIP TL — ${typeLabel}`, 14, y);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(`Slip #${payment.id} · ${fmtDateTime(new Date())}`, w - 14, y, { align: 'right' });

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

      y += 3;
      doc.line(14, y, w - 14, y);
      y += 6;
      doc.setFont(undefined, 'bold');
      doc.text('PEMBAYARAN', 14, y);
      y += 6;
      doc.setFont(undefined, 'normal');
      const rows = [
        ['Total Fee Trip', fmtIDR(payment.total_fee)],
        ['Termin', typeLabel],
        ['Nominal Termin', fmtIDR(payment.amount)],
        ['Jatuh Tempo', fmtDate(payment.due_date)],
        ['Status', statusInfo.label.replace(/[^A-Z ]/g, '').trim()],
      ];
      if (payment.requested_at) rows.push(['Diajukan', fmtDateTime(payment.requested_at) + ' oleh ' + (payment.requested_by || '-')]);
      if (payment.approved_at) rows.push(['Disetujui', fmtDateTime(payment.approved_at) + ' oleh ' + (payment.approved_by || '-')]);
      if (isPaid) {
        rows.push(['Tgl Bayar', fmtDateTime(payment.paid_at)]);
        rows.push(['Metode', payment.payment_method || '-']);
      }
      doc.setFontSize(10);
      for (const [k, v] of rows) {
        doc.setFont(undefined, 'bold');
        doc.text(k, 14, y);
        doc.setFont(undefined, 'normal');
        doc.text(String(v), 70, y);
        y += 5;
      }

      y = doc.internal.pageSize.getHeight() - 24;
      doc.setDrawColor(220);
      doc.line(14, y, w - 14, y);
      y += 5;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('Slip ini di-generate otomatis oleh TEONE HR System.', 14, y);

      const filename = `slip-tl-${(payment.tl_name || 'tl').replace(/\s+/g, '_')}-${payment.trip_kode || payment.trip_id}-${payment.payment_type}.pdf`;
      doc.save(filename);
      flash('✓ Slip PDF di-download');
    } catch (e) {
      flash('Error generate PDF: ' + (e?.message || 'unknown'), true);
    }
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl border border-pink-200 shadow-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeBadgeColor}`}>{typeLabel}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusInfo.cls}`}>{statusInfo.label}</span>
              {isOverdue && <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">⚠ OVERDUE</span>}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-brand-700">{payment.tl_name}</h1>
            <p className="text-sm text-slate-600 mt-1">{payment.trip_kode} — {payment.trip_name}</p>
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

        {/* Request info */}
        {payment.requested_at && (
          <div className="mt-3 pt-3 border-t border-pink-200 text-xs text-slate-700">
            📨 <b>Diajukan oleh:</b> {payment.requested_by || '-'} ({payment.requested_by_email || '-'})
            <br />
            ⏱ {fmtDateTime(payment.requested_at)}
            {payment.request_notes && (
              <div className="mt-1 italic text-slate-600">💬 "{payment.request_notes}"</div>
            )}
          </div>
        )}
      </div>

      {/* ACTIONS BAR */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4 flex flex-wrap items-center gap-2">
        <button onClick={handleDownloadSlip} disabled={pending}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-card">
          📄 Download Slip (PDF)
        </button>
        <button onClick={handleSendWA} disabled={pending || !payment.tl_phone}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-card">
          📱 Kirim Slip via WhatsApp
        </button>
        {payment.wa_sent_at && (
          <span className="text-[11px] text-slate-500">Terakhir: {fmtDateTime(payment.wa_sent_at)} → {payment.wa_sent_to}</span>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {/* APPROVE / REJECT (kalau status='requested') */}
      {isRequested && (
        <div className="bg-amber-50 rounded-xl border border-amber-300 shadow-card p-5">
          <p className="text-xs font-bold uppercase text-amber-800">🔔 Menunggu Approval HR</p>
          <p className="text-sm text-amber-900 mt-2">
            TL <b>{payment.tl_name}</b> mengajukan {typeLabel} sebesar <b>{fmtIDR(payment.amount)}</b>.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Setelah approve: otomatis dibooking di <b>HPP / cashflow trip</b> (proyeksi) dan akan masuk <b>real cashflow</b> begitu di-mark paid.
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* APPROVE form */}
            <form action={handleApprove} className="bg-white rounded-lg p-3 border border-green-200 space-y-2">
              <label className="block">
                <span className="text-xs font-bold text-green-700">CATATAN APPROVAL (opsional)</span>
                <textarea name="approval_notes" rows="2"
                  className="mt-1 w-full px-2 py-1 border border-slate-300 rounded text-xs" />
              </label>
              <button type="submit" disabled={pending}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
                ✓ APPROVE Request
              </button>
              <p className="text-[10px] text-slate-500">→ buat entry di hpp_items (booked, is_paid=false)</p>
            </form>

            {/* REJECT form */}
            <form action={handleReject} className="bg-white rounded-lg p-3 border border-red-200 space-y-2">
              <label className="block">
                <span className="text-xs font-bold text-red-700">ALASAN REJECT (wajib)</span>
                <textarea name="reject_reason" rows="2" required
                  placeholder="Misal: trip belum selesai, fee belum di-set, dll"
                  className="mt-1 w-full px-2 py-1 border border-slate-300 rounded text-xs" />
              </label>
              <button type="submit" disabled={pending}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
                ✗ REJECT
              </button>
              <p className="text-[10px] text-slate-500">→ kirim alasan ke TL, gak ada entry di HPP</p>
            </form>
          </div>
        </div>
      )}

      {/* APPROVED — info */}
      {isApproved && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 shadow-card p-4">
          <p className="text-xs font-bold uppercase text-blue-800">✓ Approved — Menunggu Transfer</p>
          <p className="text-sm text-blue-900 mt-1">
            Approved by <b>{payment.approved_by}</b> on {fmtDateTime(payment.approved_at)}
          </p>
          {payment.approval_notes && <p className="text-xs text-slate-600 mt-1">💬 "{payment.approval_notes}"</p>}
          {payment.hpp_item_id && (
            <p className="text-xs text-slate-500 mt-2">
              📊 Linked to HPP item #{payment.hpp_item_id} (booked, belum dibayar)
            </p>
          )}
          <button onClick={handleReset} disabled={pending} className="mt-2 text-xs text-red-600 hover:underline">
            ↶ Reset ke "requested" (cancel approval, hapus HPP entry)
          </button>
        </div>
      )}

      {/* REJECTED — info */}
      {isRejected && (
        <div className="bg-red-50 rounded-xl border border-red-200 shadow-card p-4">
          <p className="text-xs font-bold uppercase text-red-800">✗ Rejected</p>
          <p className="text-sm text-red-900 mt-1">
            Rejected by <b>{payment.rejected_by}</b> on {fmtDateTime(payment.rejected_at)}
          </p>
          <p className="text-xs text-slate-700 mt-1">Alasan: <i>{payment.reject_reason}</i></p>
          <button onClick={handleReset} disabled={pending} className="mt-2 text-xs text-blue-600 hover:underline">
            ↶ Reset ke "requested" (cancel rejection)
          </button>
        </div>
      )}

      {/* FINAL REPORT GATE */}
      {!isDP && (isApproved || isPending) && (
        <div className={`rounded-xl border shadow-card p-4 ${payment.final_report_submitted ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="text-xs font-bold uppercase text-slate-700">⚐ Final Report Gate</p>
          {payment.final_report_submitted ? (
            <>
              <p className="mt-2 text-sm text-green-800">✓ Final Report submitted: {fmtDateTime(payment.final_report_submitted_at)}</p>
              {payment.final_report_notes && <p className="mt-1 text-xs text-slate-600">💬 {payment.final_report_notes}</p>}
              <button onClick={handleUnmarkFinalReport} disabled={pending} className="mt-3 text-xs text-red-600 hover:underline">
                ↶ Reset
              </button>
            </>
          ) : (
            <form action={handleMarkFinalReport} className="mt-3 space-y-2">
              <p className="text-sm text-amber-900">⏳ Final 30% Mark Paid akan ter-unlock setelah Final Report di-submit.</p>
              <textarea name="final_report_notes" rows="2"
                placeholder="Catatan (opsional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <button type="submit" disabled={pending}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
                ✓ Tandai Final Report Submitted
              </button>
            </form>
          )}
        </div>
      )}

      {/* MARK PAID (kalau approved atau pending) */}
      {(isApproved || isPending) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
          <p className="text-xs font-bold uppercase text-brand-700">💰 Transfer & Mark Paid</p>
          <form action={handleMarkPaid} className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nominal Dibayar">
              <input type="text" inputMode="numeric" name="paid_amount" defaultValue={fmtIDRNum(payment.amount)} className={inputCls} />
            </Field>
            <Field label="Metode">
              <select name="payment_method" defaultValue="transfer" className={inputCls}>
                <option value="transfer">Transfer Bank</option>
                <option value="cash">Cash</option>
                <option value="ewallet">E-Wallet</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Catatan">
                <textarea name="notes" rows="2" className={inputCls + ' resize-y'} />
              </Field>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <button type="submit" disabled={pending || !canPayFinal}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
                {pending ? '⏳ Saving...' : '✓ Mark as Paid'}
              </button>
              {!canPayFinal && <span className="text-xs text-amber-700">⚠ Submit Final Report dulu</span>}
              <span className="text-xs text-slate-500">→ flip hpp_items.is_paid=true (masuk real cashflow)</span>
            </div>
          </form>
        </div>
      )}

      {/* PAID INFO */}
      {isPaid && (
        <div className="bg-green-50 rounded-xl border border-green-200 shadow-card p-5">
          <p className="text-xs font-bold uppercase text-green-800">✅ Sudah Dibayar</p>
          <div className="mt-2 space-y-1 text-sm text-green-900">
            <p>📅 {fmtDateTime(payment.paid_at)}</p>
            <p>💵 {fmtIDR(payment.paid_amount || payment.amount)}</p>
            <p>💳 {payment.payment_method || 'transfer'}</p>
            <p>👤 {payment.paid_by || '-'}</p>
            {payment.notes && <p>📝 {payment.notes}</p>}
          </div>
          <button onClick={handleUnmark} disabled={pending} className="mt-3 text-xs text-red-600 hover:underline">
            ↶ Reset (batalkan PAID, hpp_items.is_paid jadi false)
          </button>
        </div>
      )}

      {/* PROOF UPLOAD */}
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

      <div className="text-right">
        <button onClick={handleDelete} disabled={pending} className="text-xs text-red-600 hover:underline">
          🗑 Hapus permanently
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
