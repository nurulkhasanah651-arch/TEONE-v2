// components/invoices/InvoicePaymentApprovalPanel.jsx
// R201: Panel untuk approve/reject pending invoice_payments
// Data: pembayaran peserta via link (sudah upload bukti, nunggu approve finance)

'use client';

import SignedImage from '@/components/common/SignedImage';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveInvoicePayment, rejectInvoicePayment, deleteInvoicePayment } from '@/lib/actions/invoice-payment';
import { getSignedFileUrl } from '@/lib/actions/signed-file';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}
function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}
function isImage(url) {
  if (!url) return false;
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}

function ProofLink({ url }) {
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-semibold">
        ⚠ Tanpa bukti
      </span>
    );
  }
  return (
    <a
      href={`/api/proof?u=${encodeURIComponent(url)}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 hover:bg-green-200 font-bold"
    >
      📎 Lihat Bukti Transfer ↗
    </a>
  );
}

export default function InvoicePaymentApprovalPanel({ payments = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [waManual, setWaManual] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const totalPendingAmount = payments.reduce(
    (s, p) => s + Number(p.amount || 0),
    0
  );

  function handleApprove(payment) {
    if (!payment.proof_url) {
      if (!confirm(
        `⚠ Belum ada bukti transfer.\n` +
        `Tetap approve pembayaran ${fmtRupiah(payment.amount)}?`
      )) return;
    } else {
      if (!confirm(
        `APPROVE pembayaran ${fmtRupiah(payment.amount)}?\n\n` +
        `📎 Bukti sudah di-upload — pastikan sudah dicek\n\n` +
        `→ Invoice akan auto-paid kalau total sudah cover`
      )) return;
    }

    startTransition(async () => {
      const r = await approveInvoicePayment(payment.id);
      if (r?.error) alert(r.error);
      else if (r.wa_manual) {
        setCopied(false); setCopiedPhone(false);
        setWaManual({ message: r.wa_message || '', phone: r.wa_phone || '', name: r.customer_name || '' });
      }
      else alert('✓ Payment approved!');
      router.refresh();
    });
  }

  function handleStartReject(id) {
    setRejectingId(id);
    setRejectReason('');
  }

  function handleConfirmReject(payment) {
    if (!rejectReason.trim()) {
      alert('Alasan reject wajib diisi');
      return;
    }
    startTransition(async () => {
      const r = await rejectInvoicePayment(payment.id, rejectReason);
      if (r?.error) alert(r.error);
      setRejectingId(null);
      setRejectReason('');
      router.refresh();
    });
  }

  function handleDelete(payment) {
    if (!confirm(`Hapus payment ${fmtRupiah(payment.amount)}?`)) return;
    startTransition(async () => {
      const r = await deleteInvoicePayment(payment.id);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  const waLink = waManual?.phone
    ? `https://wa.me/${String(waManual.phone).replace(/[^0-9]/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(waManual.message || '')}`
    : null;

  return (
    <>
    {waManual && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setWaManual(null)}>
        <div className="bg-white rounded-xl max-w-lg w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="font-bold text-brand-700">✅ Payment approved — kirim WA manual</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nomor WA PIC trip ini belum tersambung, jadi pesan tidak dikirim otomatis.
              Salin nomor & pesan di bawah, lalu kirim manual ke peserta.
            </p>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nomor peserta</p>
                <p className="font-mono text-sm font-bold text-slate-800 truncate">
                  {waManual.phone || '— belum ada nomor —'}
                </p>
                {waManual.name && <p className="text-xs text-slate-500 truncate">{waManual.name}</p>}
              </div>
              {waManual.phone && (
                <button type="button"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(waManual.phone); setCopiedPhone(true); }
                    catch { setCopiedPhone(false); alert('Gagal menyalin nomor'); }
                  }}
                  className="shrink-0 px-2.5 py-1 text-[11px] font-bold rounded bg-slate-200 hover:bg-slate-300 text-slate-800">
                  {copiedPhone ? '✓ Tersalin' : '📋 Salin nomor'}
                </button>
              )}
            </div>
            <textarea readOnly value={waManual.message || ''} rows={12}
              className="w-full text-xs font-mono border border-slate-300 rounded-lg p-3 bg-slate-50"
              onFocus={(e) => e.target.select()} />
            <div className="flex gap-2 flex-wrap">
              <button type="button"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(waManual.message || ''); setCopied(true); }
                  catch { setCopied(false); alert('Gagal menyalin — blok teksnya lalu Ctrl+C'); }
                }}
                className="px-3 py-1.5 text-xs font-bold rounded bg-brand-600 hover:bg-brand-700 text-white">
                {copied ? '✓ Tersalin' : '📋 Salin pesan'}
              </button>
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 text-xs font-bold rounded bg-green-600 hover:bg-green-700 text-white">
                  💬 Buka WhatsApp
                </a>
              )}
              <button type="button" onClick={() => setWaManual(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 ml-auto">
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-brand-700 flex items-center gap-2 flex-wrap">
            💳 Payment Approval (Pembayaran Peserta)
            {payments.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold animate-pulse">
                {payments.length} pending
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Peserta upload bukti via link → Finance verifikasi & approve → invoice auto-paid
            {totalPendingAmount > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">
                · Total: {fmtRupiah(totalPendingAmount)}
              </span>
            )}
          </p>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-3xl mb-2">💳</p>
          <p className="text-sm text-slate-600">Tidak ada pembayaran pending</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {payments.map((p) => {
            const inv = p.invoices || {};
            const isReject = rejectingId === p.id;

            return (
              <div key={p.id} className="px-5 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase border bg-amber-100 text-amber-800 border-amber-300">
                        ⏳ Pending
                      </span>
                      <p className="font-bold text-brand-700">
                        {inv.customer_name || `Invoice #${p.invoice_id}`}
                      </p>
                      {inv.invoice_no && (
                        <span className="text-xs text-slate-600 font-mono">
                          {inv.invoice_no}
                        </span>
                      )}
                      <ProofLink url={p.proof_url} />
                    </div>

                    <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
                      {inv.trip_kode && (
                        <span className="text-slate-600">
                          Trip: <b>{inv.trip_kode}</b>
                        </span>
                      )}
                      {inv.milestone && (
                        <span className="text-slate-600">
                          Milestone: <b>{inv.milestone}</b>
                        </span>
                      )}
                      <span className="font-bold text-green-700 text-base">
                        {fmtRupiah(p.amount)}
                      </span>
                      <span className="text-slate-500">📅 {fmtDate(p.payment_date)}</span>
                      {p.payment_method && (
                        <span className="text-slate-500 capitalize">· {p.payment_method}</span>
                      )}
                    </div>

                    {p.proof_url && isImage(p.proof_url) && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setPreviewId(previewId === p.id ? null : p.id)}
                          className="text-[10px] px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold"
                        >
                          {previewId === p.id ? '▲ Tutup preview' : '▼ Preview bukti'}
                        </button>
                        {previewId === p.id && (
                          <div className="mt-2 inline-block p-2 bg-slate-50 border border-slate-200 rounded">
                            <SignedImage
                              url={p.proof_url}
                              alt="Bukti transfer"
                              className="max-h-64 max-w-full rounded border border-slate-300"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {p.notes && (
                      <p className="mt-1 text-xs text-slate-600 italic">📝 {p.notes}</p>
                    )}

                    <div className="mt-1 text-[10px] text-slate-500">
                      Submitted: {fmtDate(p.created_at)}
                    </div>

                    {isReject && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                        <input autoComplete="off"
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Alasan reject"
                          className="w-full px-2 py-1 border border-red-300 rounded text-xs bg-white"
                          autoFocus
                        />
                        <div className="mt-1.5 flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setRejectingId(null)}
                            className="px-2 py-1 text-[10px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmReject(p)}
                            disabled={pending || !rejectReason.trim()}
                            className="px-3 py-1 text-[10px] font-semibold rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    {!isReject && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(p)}
                          disabled={pending}
                          className="px-3 py-1.5 text-xs font-bold rounded bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
                        >
                          ✓ Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartReject(p.id)}
                          disabled={pending}
                          className="px-2 py-1.5 text-xs font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700"
                        >
                          ✕ Reject
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      disabled={pending}
                      className="px-2 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                      title="Hapus payment"
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
    </div>
    </>
  );
}
