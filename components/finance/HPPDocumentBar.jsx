'use client';

// Round 184b: Standalone document bar — Upload/View Invoice & Bukti Transfer
// Bisa dipakai kapan saja (gak harus pas Request/Approve)
// Path: components/finance/HPPDocumentBar.jsx
//
// USAGE:
//   <HPPDocumentBar item={item} canUploadInvoice={true} canUploadProof={false} />

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  uploadHPPInvoice,
  uploadTransferProof,
  getInvoiceSignedUrl,
  getTransferProofSignedUrl,
  deleteInvoice,
  deleteTransferProof,
} from '@/lib/actions/hpp-documents';

function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function HPPDocumentBar({
  item,
  canUploadInvoice = true,    // Finance side
  canUploadProof = false,     // Accounting side
  compact = false,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const invoiceRef = useRef(null);
  const proofRef = useRef(null);
  const [uploading, setUploading] = useState(null); // 'invoice' | 'proof' | null

  function flash(text, isErr = false) {
    setMsg({ text, isErr });
    // R184b: error messages STICKY (gak auto-dismiss), success auto-clear setelah 5s
    if (!isErr) setTimeout(() => setMsg(null), 5000);
  }

  async function handleUploadInvoice(e) {
    e?.preventDefault?.();
    const file = invoiceRef.current?.files?.[0];
    if (!file) { flash('Pilih file invoice dulu', true); return; }
    setUploading('invoice');
    const fd = new FormData();
    fd.append('invoice_file', file);
    const r = await uploadHPPInvoice(item.id, fd);
    setUploading(null);
    if (r?.error) flash(r.error, true);
    else {
      flash('✓ Invoice ter-upload');
      if (invoiceRef.current) invoiceRef.current.value = '';
      router.refresh();
    }
  }

  async function handleUploadProof(e) {
    e?.preventDefault?.();
    const file = proofRef.current?.files?.[0];
    if (!file) { flash('Pilih file bukti dulu', true); return; }
    setUploading('proof');
    const fd = new FormData();
    fd.append('proof_file', file);
    const r = await uploadTransferProof(item.id, fd);
    setUploading(null);
    if (r?.error) flash(r.error, true);
    else {
      flash('✓ Bukti transfer ter-upload — Finance bisa download untuk kirim ke vendor');
      if (proofRef.current) proofRef.current.value = '';
      router.refresh();
    }
  }

  async function handleViewInvoice() {
    setMsg(null);
    const r = await getInvoiceSignedUrl(item.id);
    if (r?.error) flash(r.error, true);
    else window.open(r.url, '_blank');
  }

  async function handleViewProof() {
    setMsg(null);
    const r = await getTransferProofSignedUrl(item.id);
    if (r?.error) flash(r.error, true);
    else window.open(r.url, '_blank');
  }

  async function handleDeleteInvoice() {
    if (!confirm('Hapus invoice?')) return;
    startTransition(async () => {
      const r = await deleteInvoice(item.id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Invoice dihapus'); router.refresh(); }
    });
  }

  async function handleDeleteProof() {
    if (!confirm('Hapus bukti transfer?')) return;
    startTransition(async () => {
      const r = await deleteTransferProof(item.id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Bukti dihapus'); router.refresh(); }
    });
  }

  const hasInvoice = !!item.invoice_url;
  const hasProof = !!item.transfer_proof_url;

  return (
    <div className={`${compact ? '' : 'bg-slate-50 border border-slate-200 rounded p-2'} space-y-2`}>
      {!compact && (
        <p className="text-[10px] font-bold uppercase text-slate-600 tracking-wider">📂 Dokumen HPP</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* INVOICE */}
        <div className="flex items-center gap-1">
          {hasInvoice ? (
            <>
              <button
                type="button"
                onClick={handleViewInvoice}
                className="text-[11px] px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold inline-flex items-center gap-1"
                title={item.invoice_uploaded_at ? `Uploaded: ${fmtDateTime(item.invoice_uploaded_at)}` : 'Lihat invoice'}
              >
                📎 Lihat Invoice
              </button>
              {canUploadInvoice && (
                <button
                  type="button"
                  onClick={handleDeleteInvoice}
                  disabled={pending}
                  className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded"
                  title="Hapus invoice"
                >✕</button>
              )}
            </>
          ) : canUploadInvoice ? (
            <form onSubmit={handleUploadInvoice} className="flex items-center gap-1">
              <input
                ref={invoiceRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="text-[10px] file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[10px] file:bg-purple-100 file:text-purple-700"
              />
              <button
                type="submit"
                disabled={uploading === 'invoice'}
                className="text-[11px] px-2 py-1 rounded bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold"
              >
                {uploading === 'invoice' ? '⏳' : '📎 Upload Invoice'}
              </button>
            </form>
          ) : (
            <span className="text-[10px] text-amber-600 italic">⚠ Belum ada invoice</span>
          )}
        </div>

        <span className="text-slate-300">|</span>

        {/* BUKTI TRANSFER */}
        <div className="flex items-center gap-1">
          {hasProof ? (
            <>
              <button
                type="button"
                onClick={handleViewProof}
                className="text-[11px] px-2 py-1 rounded bg-green-50 hover:bg-green-100 text-green-700 font-semibold inline-flex items-center gap-1"
                title={item.transfer_proof_uploaded_at ? `Uploaded: ${fmtDateTime(item.transfer_proof_uploaded_at)}` : 'Lihat bukti transfer'}
              >
                📥 Bukti Transfer
              </button>
              {canUploadProof && (
                <button
                  type="button"
                  onClick={handleDeleteProof}
                  disabled={pending}
                  className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded"
                  title="Hapus bukti"
                >✕</button>
              )}
            </>
          ) : canUploadProof ? (
            <form onSubmit={handleUploadProof} className="flex items-center gap-1">
              <input
                ref={proofRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="text-[10px] file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[10px] file:bg-green-100 file:text-green-700"
              />
              <button
                type="submit"
                disabled={uploading === 'proof'}
                className="text-[11px] px-2 py-1 rounded bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold"
              >
                {uploading === 'proof' ? '⏳' : '📥 Upload Bukti'}
              </button>
            </form>
          ) : (
            <span className="text-[10px] text-slate-400 italic">Bukti transfer belum di-upload Accounting</span>
          )}
        </div>
      </div>

      {msg && (
        <p className={`text-[11px] rounded p-1.5 ${msg.isErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
