'use client';

// Round 184c: Standalone document bar — + OPTIMISTIC UPDATE + DIAGNOSTIC
// Saat upload sukses, langsung update local state (gak nunggu router.refresh)
// Plus tombol diagnostic kalau upload gak nyangkut
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
  inspectHPPItem,
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
  // R184c: local state untuk OPTIMISTIC update
  const [localItem, setLocalItem] = useState(item);
  // R184c: diagnostic state
  const [diagnostic, setDiagnostic] = useState(null);

  // Sync localItem dgn prop kalau parent kasih update baru
  useEffect(() => { setLocalItem(item); }, [item.invoice_url, item.transfer_proof_url, item.id]);

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
      // R184c: optimistic update local state DULU, baru router.refresh
      if (r.item) setLocalItem(r.item);
      else if (r.invoice_url) setLocalItem((p) => ({ ...p, invoice_url: r.invoice_url, invoice_uploaded_at: r.uploaded_at }));
      flash(`✓ Invoice ter-upload (${file.name})`);
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
      // R184c: optimistic update
      if (r.item) setLocalItem(r.item);
      else if (r.transfer_proof_url) setLocalItem((p) => ({ ...p, transfer_proof_url: r.transfer_proof_url, transfer_proof_uploaded_at: r.uploaded_at }));
      flash(`✓ Bukti transfer ter-upload (${file.name}) — Finance bisa download untuk vendor`);
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

  // R184c: Diagnostic — cek raw DB state buat troubleshoot
  async function handleDiagnostic() {
    setDiagnostic({ loading: true });
    const r = await inspectHPPItem(item.id);
    setDiagnostic(r);
  }

  const hasInvoice = !!localItem.invoice_url;
  const hasProof = !!localItem.transfer_proof_url;

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
        <div className={`text-[11px] rounded p-2 ${msg.isErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          <p>{msg.text}</p>
          {msg.isErr && (
            <button onClick={handleDiagnostic} className="mt-1 text-[10px] underline text-red-800">
              🔍 Run Diagnostic
            </button>
          )}
        </div>
      )}

      {/* R184c: Diagnostic panel */}
      {diagnostic && !diagnostic.loading && (
        <div className="text-[10px] bg-slate-50 border border-slate-300 rounded p-2 font-mono">
          <div className="flex items-center justify-between mb-1">
            <p className="font-bold text-slate-700">🔍 DB State item #{item.id}</p>
            <button onClick={() => setDiagnostic(null)} className="text-slate-500 hover:text-slate-700">✕</button>
          </div>
          {diagnostic.error ? (
            <p className="text-red-700">⚠ {diagnostic.error}</p>
          ) : (
            <div className="space-y-0.5 text-slate-700">
              <p><span className="font-bold">Component:</span> {diagnostic.component}</p>
              <p><span className="font-bold">Total:</span> Rp {Number(diagnostic.total_amount || 0).toLocaleString('id-ID')}</p>
              <p><span className="font-bold">Status:</span> {diagnostic.payment_status}</p>
              <p className="pt-1 border-t border-slate-200 mt-1">
                <span className="font-bold">invoice_url:</span>{' '}
                <span className={diagnostic.invoice_url ? 'text-green-700' : 'text-red-700'}>
                  {diagnostic.invoice_url || 'NULL'}
                </span>
              </p>
              <p>
                <span className="font-bold">transfer_proof_url:</span>{' '}
                <span className={diagnostic.transfer_proof_url ? 'text-green-700' : 'text-red-700'}>
                  {diagnostic.transfer_proof_url || 'NULL'}
                </span>
              </p>
              <p className="pt-1 border-t border-slate-200 mt-1">
                Schema invoice_url col: {diagnostic.has_invoice_url_column ? '✓' : '✗ (run SQL!)'}
                {' · '}
                transfer_proof_url col: {diagnostic.has_transfer_proof_url_column ? '✓' : '✗ (run SQL!)'}
              </p>
              <p>
                Bucket "hpp-documents": {diagnostic.bucket_hpp_documents_exists ? '✓' : '✗ (run SQL!)'}
              </p>
              {(!diagnostic.has_invoice_url_column || !diagnostic.has_transfer_proof_url_column || !diagnostic.bucket_hpp_documents_exists) && (
                <p className="mt-2 text-red-700 font-bold">
                  ⚠ Run SQL_COPAS_RUN_ALL.txt di Supabase SQL Editor dulu!
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Diagnostic trigger (subtle) */}
      {!diagnostic && !msg && (
        <button
          onClick={handleDiagnostic}
          className="text-[9px] text-slate-400 hover:text-slate-700 hover:underline"
          title="Cek state DB item ini (debug)"
        >
          🔍 debug
        </button>
      )}
    </div>
  );
}
