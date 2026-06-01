'use client';

// Round 184d: HPPDocumentBar — + manual reload from DB + auto-sync via realtime
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
import { createClient } from '@/lib/supabase/client';

export default function HPPDocumentBar({
  item,
  canUploadInvoice = true,
  canUploadProof = false,
  compact = false,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const invoiceRef = useRef(null);
  const proofRef = useRef(null);
  const [uploading, setUploading] = useState(null);
  const [localItem, setLocalItem] = useState(item);
  const [diagnostic, setDiagnostic] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Sync local kalau parent item berubah
  useEffect(() => { setLocalItem(item); }, [item.id, item.invoice_url, item.transfer_proof_url]);

  // R184d: Realtime subscribe — kalau item ini di-update di DB, auto-refresh state
  useEffect(() => {
    if (!item.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`hpp_doc_${item.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trip_finance_items',
          filter: `id=eq.${item.id}`,
        },
        (payload) => {
          const updated = payload.new;
          if (!updated) return;
          setLocalItem((prev) => ({ ...prev, ...updated }));
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [item.id]);

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
      if (r.item) setLocalItem(r.item);
      else if (r.transfer_proof_url) setLocalItem((p) => ({ ...p, transfer_proof_url: r.transfer_proof_url, transfer_proof_uploaded_at: r.uploaded_at }));
      flash(`✓ Bukti transfer ter-upload (${file.name})`);
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

  // R184d: Manual reload — fetch state fresh dari DB
  async function handleReload() {
    setRefreshing(true);
    const r = await inspectHPPItem(item.id);
    setRefreshing(false);
    if (r?.error) flash(r.error, true);
    else {
      // Update local state pake hasil fresh
      setLocalItem((p) => ({
        ...p,
        invoice_url: r.invoice_url,
        invoice_uploaded_at: r.invoice_uploaded_at,
        transfer_proof_url: r.transfer_proof_url,
        transfer_proof_uploaded_at: r.transfer_proof_uploaded_at,
      }));
      flash(`✓ Refreshed · Invoice: ${r.invoice_url ? '✓' : '—'} · Bukti: ${r.transfer_proof_url ? '✓' : '—'}`);
    }
  }

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
                title="Lihat invoice"
              >
                📎 Lihat Invoice
              </button>
              {canUploadInvoice && (
                <button
                  type="button"
                  onClick={handleDeleteInvoice}
                  disabled={pending}
                  className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded"
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
            <span className="text-[10px] text-amber-600 italic">⚠ Belum ada invoice dari Finance</span>
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
                title="Download bukti transfer untuk kirim ke vendor"
              >
                📥 Bukti Transfer
              </button>
              {canUploadProof && (
                <button
                  type="button"
                  onClick={handleDeleteProof}
                  disabled={pending}
                  className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded"
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

        {/* R184d: Manual reload button */}
        <button
          type="button"
          onClick={handleReload}
          disabled={refreshing}
          className="ml-auto text-[10px] px-1.5 py-0.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
          title="Reload state dari database"
        >
          {refreshing ? '⏳' : '🔄'}
        </button>
      </div>

      {msg && (
        <div className={`text-[11px] rounded p-2 ${msg.isErr ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          <p>{msg.text}</p>
          {msg.isErr && (
            <button onClick={handleDiagnostic} className="mt-1 text-[10px] underline text-red-800">
              🔍 Run Diagnostic — cek apa SQL udah jalan
            </button>
          )}
        </div>
      )}

      {diagnostic && !diagnostic.loading && (
        <div className="text-[10px] bg-slate-50 border border-slate-300 rounded p-2 font-mono">
          <div className="flex items-center justify-between mb-1">
            <p className="font-bold text-slate-700">🔍 DB State #{item.id}</p>
            <button onClick={() => setDiagnostic(null)} className="text-slate-500 hover:text-slate-700">✕</button>
          </div>
          {diagnostic.error ? (
            <p className="text-red-700">⚠ {diagnostic.error}</p>
          ) : (
            <div className="space-y-0.5 text-slate-700">
              <p><b>invoice_url:</b> <span className={diagnostic.invoice_url ? 'text-green-700' : 'text-red-700'}>{diagnostic.invoice_url || 'NULL'}</span></p>
              <p><b>transfer_proof_url:</b> <span className={diagnostic.transfer_proof_url ? 'text-green-700' : 'text-red-700'}>{diagnostic.transfer_proof_url || 'NULL'}</span></p>
              <p className="pt-1 border-t border-slate-200 mt-1">
                Column invoice_url: {diagnostic.has_invoice_url_column ? '✓' : '✗'} ·
                transfer_proof_url: {diagnostic.has_transfer_proof_url_column ? '✓' : '✗'} ·
                Bucket: {diagnostic.bucket_hpp_documents_exists ? '✓' : '✗'}
              </p>
              {(!diagnostic.has_invoice_url_column || !diagnostic.has_transfer_proof_url_column || !diagnostic.bucket_hpp_documents_exists) && (
                <p className="mt-2 text-red-700 font-bold">⚠ SQL_COPAS_RUN_ALL.txt belum dijalankan!</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
