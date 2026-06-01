'use client';

// Round 184g: HPPDocumentBar — UI SUPER JELAS
// - Big "Lihat" button selalu nampak kalau file ada
// - Status badge visual (✓ / ⏳)
// - Error/success message persistent + console.log buat debug
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
  canUploadInvoice = true,
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
    setMsg({ text, isErr, ts: Date.now() });
    // Error sticky, success auto-dismiss
    if (!isErr) setTimeout(() => setMsg(null), 7000);
  }

  async function handleUploadInvoice(e) {
    e?.preventDefault?.();
    const file = invoiceRef.current?.files?.[0];
    if (!file) { flash('⚠ Pilih file invoice dulu (klik "Choose File")', true); return; }

    setUploading('invoice');
    flash(`⏳ Uploading ${file.name}...`);
    console.log('[HPPDocumentBar] Uploading invoice:', file.name, file.size, 'bytes');

    const fd = new FormData();
    fd.append('invoice_file', file);

    try {
      const r = await uploadHPPInvoice(item.id, fd);
      console.log('[HPPDocumentBar] Upload result:', r);
      setUploading(null);
      if (r?.error) {
        flash('❌ ' + r.error, true);
        return;
      }
      // Optimistic update
      if (r.item) setLocalItem(r.item);
      else if (r.invoice_url) setLocalItem((p) => ({ ...p, invoice_url: r.invoice_url, invoice_uploaded_at: r.uploaded_at }));

      flash(`✓ Invoice "${file.name}" ter-upload!`);
      if (invoiceRef.current) invoiceRef.current.value = '';
      router.refresh();
    } catch (err) {
      console.error('[HPPDocumentBar] Upload error:', err);
      setUploading(null);
      flash('❌ Error: ' + (err?.message || 'unknown'), true);
    }
  }

  async function handleUploadProof(e) {
    e?.preventDefault?.();
    const file = proofRef.current?.files?.[0];
    if (!file) { flash('⚠ Pilih file bukti dulu (klik "Choose File")', true); return; }

    setUploading('proof');
    flash(`⏳ Uploading ${file.name}...`);
    console.log('[HPPDocumentBar] Uploading proof:', file.name, file.size, 'bytes');

    const fd = new FormData();
    fd.append('proof_file', file);

    try {
      const r = await uploadTransferProof(item.id, fd);
      console.log('[HPPDocumentBar] Upload result:', r);
      setUploading(null);
      if (r?.error) {
        flash('❌ ' + r.error, true);
        return;
      }
      if (r.item) setLocalItem(r.item);
      else if (r.transfer_proof_url) setLocalItem((p) => ({ ...p, transfer_proof_url: r.transfer_proof_url, transfer_proof_uploaded_at: r.uploaded_at }));

      flash(`✓ Bukti "${file.name}" ter-upload! Finance bisa download untuk vendor.`);
      if (proofRef.current) proofRef.current.value = '';
      router.refresh();
    } catch (err) {
      console.error('[HPPDocumentBar] Upload error:', err);
      setUploading(null);
      flash('❌ Error: ' + (err?.message || 'unknown'), true);
    }
  }

  async function handleViewInvoice() {
    setMsg(null);
    const r = await getInvoiceSignedUrl(item.id);
    if (r?.error) flash('❌ ' + r.error, true);
    else window.open(r.url, '_blank');
  }

  async function handleViewProof() {
    setMsg(null);
    const r = await getTransferProofSignedUrl(item.id);
    if (r?.error) flash('❌ ' + r.error, true);
    else window.open(r.url, '_blank');
  }

  async function handleDeleteInvoice() {
    if (!confirm('Hapus invoice?')) return;
    startTransition(async () => {
      const r = await deleteInvoice(item.id);
      if (r?.error) flash('❌ ' + r.error, true);
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
      if (r?.error) flash('❌ ' + r.error, true);
      else {
        setLocalItem((p) => ({ ...p, transfer_proof_url: null, transfer_proof_uploaded_at: null }));
        flash('✓ Bukti dihapus');
        router.refresh();
      }
    });
  }

  const hasInvoice = !!localItem.invoice_url;
  const hasProof = !!localItem.transfer_proof_url;
  const isUploadingInv = uploading === 'invoice';
  const isUploadingProof = uploading === 'proof';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">

      {/* ═══ INVOICE SECTION ═══ */}
      <div className="bg-white border-2 border-purple-200 rounded-lg p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-bold uppercase text-purple-700 tracking-wider">
            📎 Invoice (dari Vendor)
          </p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            hasInvoice ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {hasInvoice ? '✓ TERSEDIA' : '⏳ BELUM ADA'}
          </span>
        </div>

        {/* BIG VIEW BUTTON — kalau ada file */}
        {hasInvoice && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleViewInvoice}
              className="w-full px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow"
            >
              📎 Lihat / Download Invoice
            </button>
            <p className="text-[10px] text-slate-500 text-center">
              Uploaded {fmtDateTime(localItem.invoice_uploaded_at)}
              {canUploadInvoice && (
                <>
                  {' · '}
                  <button onClick={handleDeleteInvoice} disabled={pending}
                    className="text-red-500 hover:underline">
                    Hapus
                  </button>
                </>
              )}
            </p>
          </div>
        )}

        {/* UPLOAD FORM — kalau gak ada, atau buat replace */}
        {canUploadInvoice && (
          <form onSubmit={handleUploadInvoice} className={hasInvoice ? 'mt-2 pt-2 border-t border-purple-100' : ''}>
            <div className="flex items-stretch gap-2">
              <input
                ref={invoiceRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="flex-1 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-purple-100 file:text-purple-700 file:font-semibold"
                disabled={isUploadingInv}
              />
              <button
                type="submit"
                disabled={isUploadingInv}
                className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap"
              >
                {isUploadingInv ? '⏳ Uploading...' : (hasInvoice ? '🔁 Replace' : '⬆️ Upload Invoice')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ═══ BUKTI TRANSFER SECTION ═══ */}
      <div className="bg-white border-2 border-green-200 rounded-lg p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-bold uppercase text-green-700 tracking-wider">
            📥 Bukti Transfer (dari Accounting)
          </p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            hasProof ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {hasProof ? '✓ TERSEDIA' : '⏳ BELUM ADA'}
          </span>
        </div>

        {hasProof && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleViewProof}
              className="w-full px-4 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow"
              title="Download bukti transfer untuk kirim ke vendor"
            >
              📥 Lihat / Download Bukti Transfer
            </button>
            <p className="text-[10px] text-slate-500 text-center">
              Uploaded {fmtDateTime(localItem.transfer_proof_uploaded_at)}
              {canUploadProof && (
                <>
                  {' · '}
                  <button onClick={handleDeleteProof} disabled={pending}
                    className="text-red-500 hover:underline">
                    Hapus
                  </button>
                </>
              )}
            </p>
          </div>
        )}

        {canUploadProof && (
          <form onSubmit={handleUploadProof} className={hasProof ? 'mt-2 pt-2 border-t border-green-100' : ''}>
            <div className="flex items-stretch gap-2">
              <input
                ref={proofRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="flex-1 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-green-100 file:text-green-700 file:font-semibold"
                disabled={isUploadingProof}
              />
              <button
                type="submit"
                disabled={isUploadingProof}
                className="px-4 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap"
              >
                {isUploadingProof ? '⏳ Uploading...' : (hasProof ? '🔁 Replace' : '⬆️ Upload Bukti')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* MESSAGE — visible & persistent untuk error */}
      {msg && (
        <div className={`rounded-lg p-3 text-sm ${
          msg.isErr
            ? 'bg-red-50 text-red-800 border-2 border-red-300 font-semibold'
            : 'bg-green-50 text-green-800 border border-green-200'
        }`}>
          {msg.text}
          {msg.isErr && (
            <p className="text-[11px] mt-1 text-red-600 font-normal">
              💡 Cek Console browser (F12 → Console) untuk detail error
            </p>
          )}
        </div>
      )}
    </div>
  );
}
