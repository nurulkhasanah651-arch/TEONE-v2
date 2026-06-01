'use client';

// Round 184f: HPPDocumentBar — SIMPLE & SOLID
// Finance + Accounting sama-sama bisa upload dari sini.
// 2 section jelas: Invoice (vendor) | Bukti Transfer (accounting)
// Path: components/finance/HPPDocumentBar.jsx

import { useState, useTransition, useRef, useEffect } from 'react';
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
  canUploadInvoice = true,    // default both true — Finance/Accounting akses dari sini
  canUploadProof = true,
  compact = false,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const invoiceRef = useRef(null);
  const proofRef = useRef(null);
  const [uploading, setUploading] = useState(null);
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => { setLocalItem(item); }, [item.id, item.invoice_url, item.transfer_proof_url]);

  function flash(text, isErr = false) {
    setMsg({ text, isErr });
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
      if (r.item) setLocalItem(r.item);
      else if (r.invoice_url) setLocalItem((p) => ({ ...p, invoice_url: r.invoice_url, invoice_uploaded_at: r.uploaded_at }));
      flash(`✓ Invoice ter-upload — Accounting bisa lihat di sini`);
      if (invoiceRef.current) invoiceRef.current.value = '';
      router.refresh();
    }
  }

  async function handleUploadProof(e) {
    e?.preventDefault?.();
    const file = proofRef.current?.files?.[0];
    if (!file) { flash('Pilih file bukti transfer dulu', true); return; }
    setUploading('proof');
    const fd = new FormData();
    fd.append('proof_file', file);
    const r = await uploadTransferProof(item.id, fd);
    setUploading(null);
    if (r?.error) flash(r.error, true);
    else {
      if (r.item) setLocalItem(r.item);
      else if (r.transfer_proof_url) setLocalItem((p) => ({ ...p, transfer_proof_url: r.transfer_proof_url, transfer_proof_uploaded_at: r.uploaded_at }));
      flash(`✓ Bukti transfer ter-upload — Finance bisa download untuk vendor`);
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
      else {
        setLocalItem((p) => ({ ...p, invoice_url: null, invoice_uploaded_at: null }));
        flash('✓ Invoice dihapus');
        router.refresh();
      }
    });
  }

  async function handleDeleteProof() {
    if (!confirm('Hapus bukti transfer?')) return;
    startTransition(async () => {
      const r = await deleteTransferProof(item.id);
      if (r?.error) flash(r.error, true);
      else {
        setLocalItem((p) => ({ ...p, transfer_proof_url: null, transfer_proof_uploaded_at: null }));
        flash('✓ Bukti dihapus');
        router.refresh();
      }
    });
  }

  const hasInvoice = !!localItem.invoice_url;
  const hasProof = !!localItem.transfer_proof_url;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-2 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

        {/* ═══ INVOICE SECTION (Finance upload, semua bisa lihat) ═══ */}
        <div className="bg-white border border-purple-200 rounded p-2">
          <p className="text-[10px] font-bold uppercase text-purple-700 tracking-wider mb-1.5">
            📎 Invoice (dari Vendor)
          </p>
          {hasInvoice ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleViewInvoice}
                  className="flex-1 px-3 py-1.5 rounded bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1"
                >
                  📎 Lihat / Download Invoice
                </button>
                {canUploadInvoice && (
                  <button
                    type="button"
                    onClick={handleDeleteInvoice}
                    disabled={pending}
                    className="px-2 py-1.5 text-red-500 hover:bg-red-50 rounded text-xs"
                    title="Hapus invoice"
                  >✕</button>
                )}
              </div>
              {localItem.invoice_uploaded_at && (
                <p className="text-[10px] text-slate-500">Uploaded: {fmtDateTime(localItem.invoice_uploaded_at)}</p>
              )}
              {canUploadInvoice && (
                <form onSubmit={handleUploadInvoice} className="flex items-center gap-1 mt-1 pt-1 border-t border-purple-100">
                  <input
                    ref={invoiceRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="text-[10px] flex-1 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[10px] file:bg-purple-100 file:text-purple-700"
                  />
                  <button
                    type="submit"
                    disabled={uploading === 'invoice'}
                    className="text-[10px] px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold"
                  >
                    {uploading === 'invoice' ? '⏳' : 'Replace'}
                  </button>
                </form>
              )}
            </div>
          ) : canUploadInvoice ? (
            <form onSubmit={handleUploadInvoice} className="flex items-center gap-1">
              <input
                ref={invoiceRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="text-[10px] flex-1 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[10px] file:bg-purple-100 file:text-purple-700"
              />
              <button
                type="submit"
                disabled={uploading === 'invoice'}
                className="text-[11px] px-3 py-1.5 rounded bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold"
              >
                {uploading === 'invoice' ? '⏳' : '📎 Upload Invoice'}
              </button>
            </form>
          ) : (
            <p className="text-[10px] text-amber-600 italic">⚠ Belum ada invoice dari Finance</p>
          )}
        </div>

        {/* ═══ BUKTI TRANSFER SECTION (Accounting upload, Finance download) ═══ */}
        <div className="bg-white border border-green-200 rounded p-2">
          <p className="text-[10px] font-bold uppercase text-green-700 tracking-wider mb-1.5">
            📥 Bukti Transfer (dari Accounting)
          </p>
          {hasProof ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleViewProof}
                  className="flex-1 px-3 py-1.5 rounded bg-green-500 hover:bg-green-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1"
                  title="Download bukti transfer untuk kirim ke vendor"
                >
                  📥 Download Bukti Transfer
                </button>
                {canUploadProof && (
                  <button
                    type="button"
                    onClick={handleDeleteProof}
                    disabled={pending}
                    className="px-2 py-1.5 text-red-500 hover:bg-red-50 rounded text-xs"
                    title="Hapus bukti"
                  >✕</button>
                )}
              </div>
              {localItem.transfer_proof_uploaded_at && (
                <p className="text-[10px] text-slate-500">Uploaded: {fmtDateTime(localItem.transfer_proof_uploaded_at)}</p>
              )}
              {canUploadProof && (
                <form onSubmit={handleUploadProof} className="flex items-center gap-1 mt-1 pt-1 border-t border-green-100">
                  <input
                    ref={proofRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="text-[10px] flex-1 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[10px] file:bg-green-100 file:text-green-700"
                  />
                  <button
                    type="submit"
                    disabled={uploading === 'proof'}
                    className="text-[10px] px-2 py-1 rounded bg-green-100 hover:bg-green-200 text-green-700 font-semibold"
                  >
                    {uploading === 'proof' ? '⏳' : 'Replace'}
                  </button>
                </form>
              )}
            </div>
          ) : canUploadProof ? (
            <form onSubmit={handleUploadProof} className="flex items-center gap-1">
              <input
                ref={proofRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="text-[10px] flex-1 file:mr-1 file:py-0.5 file:px-1.5 file:rounded file:border-0 file:text-[10px] file:bg-green-100 file:text-green-700"
              />
              <button
                type="submit"
                disabled={uploading === 'proof'}
                className="text-[11px] px-3 py-1.5 rounded bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold"
              >
                {uploading === 'proof' ? '⏳' : '📥 Upload Bukti'}
              </button>
            </form>
          ) : (
            <p className="text-[10px] text-slate-400 italic">Bukti transfer belum di-upload Accounting</p>
          )}
        </div>

      </div>

      {msg && (
        <div className={`text-[11px] rounded p-2 ${msg.isErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
