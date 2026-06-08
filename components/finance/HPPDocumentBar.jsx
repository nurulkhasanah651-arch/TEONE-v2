'use client';

// Round 188: HPPDocumentBar — DIRECT BROWSER UPLOAD ke Supabase Storage
// Pattern sama dengan portal TL (R132): bypass server payload limit (Vercel 4.5MB),
// langsung upload dari browser, max 20MB, support image+pdf+excel+word+csv+txt
//
// Path: components/finance/HPPDocumentBar.jsx

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  saveInvoiceUrl,
  saveTransferProofUrl,
  getInvoiceSignedUrl,
  getTransferProofSignedUrl,
  deleteInvoice,
  deleteTransferProof,
} from '@/lib/actions/hpp-documents';

const BUCKET = 'hpp-documents';
const MAX_FILE_SIZE_MB = 20;
const ACCEPT_ALL = 'image/*,application/pdf,.pdf,.xlsx,.xls,.xlsm,.docx,.doc,.csv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain';

function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function sanitizeFilename(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function fileIcon(url) {
  if (!url) return '📎';
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return '🖼';
  if (/\.pdf$/i.test(url)) return '📄';
  if (/\.(xlsx|xls|xlsm|csv)$/i.test(url)) return '📊';
  if (/\.(docx|doc)$/i.test(url)) return '📝';
  return '📎';
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
  const [progress, setProgress] = useState(0);
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => { setLocalItem(item); }, [item?.id, item?.invoice_url, item?.transfer_proof_url]);

  if (!localItem) return null;

  const hasInvoice = !!localItem.invoice_url;
  const hasProof = !!localItem.transfer_proof_url;

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4500);
  }

  // ============ DIRECT UPLOAD HANDLER ============
  async function handleDirectUpload(file, kind) {
    // kind: 'invoice' or 'proof'
    setMsg(null);
    setProgress(0);

    const sizeMB = file.size / 1048576;
    if (sizeMB > MAX_FILE_SIZE_MB) {
      showMsg(`File terlalu besar (${sizeMB.toFixed(1)} MB). Max ${MAX_FILE_SIZE_MB} MB.`, 'error');
      return;
    }

    setUploading(kind);

    try {
      const supabase = createClient();
      const safeName = sanitizeFilename(file.name);
      const timestamp = Date.now();
      const folder = kind === 'invoice' ? 'invoices' : 'transfer-proofs';
      const key = `${folder}/item-${localItem.id}-${timestamp}-${safeName}`;

      // Upload langsung ke Supabase Storage dari browser
      const { data: uploadData, error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });

      if (upErr) {
        if (/bucket|not.*found/i.test(upErr.message)) {
          showMsg('⚠ Bucket "hpp-documents" belum dibuat di Supabase. Jalanin SQL setup dulu.', 'error');
        } else if (/exceeded.*size|payload.*large|413/i.test(upErr.message)) {
          showMsg(`File terlalu besar (${sizeMB.toFixed(1)} MB). Cek limit bucket di Supabase (set min 20MB).`, 'error');
        } else if (/permission|policy|denied/i.test(upErr.message)) {
          showMsg('⚠ Permission denied. Cek RLS policy bucket "hpp-documents".', 'error');
        } else {
          showMsg('Upload gagal: ' + upErr.message, 'error');
        }
        setUploading(null);
        return;
      }

      setProgress(100);

      // Setelah upload sukses, panggil server action buat simpan URL ke DB
      startTransition(async () => {
        const saveAction = kind === 'invoice' ? saveInvoiceUrl : saveTransferProofUrl;
        const r = await saveAction(localItem.id, uploadData.path);

        if (!r || r.error) {
          showMsg(r?.error || 'Save URL gagal', 'error');
          // Cleanup uploaded file kalau save gagal
          try { await supabase.storage.from(BUCKET).remove([uploadData.path]); } catch {}
        } else {
          showMsg(`✓ ${kind === 'invoice' ? 'Invoice' : 'Bukti transfer'} terupload (${sizeMB.toFixed(1)} MB)`);
          if (r.item) setLocalItem(r.item);
          router.refresh();
        }
        setUploading(null);
      });
    } catch (e) {
      showMsg('Upload error: ' + (e?.message || 'unknown'), 'error');
      setUploading(null);
    }
  }

  // ============ VIEW FILE (download via signed URL) ============
  function handleView(kind) {
    const fn = kind === 'invoice' ? getInvoiceSignedUrl : getTransferProofSignedUrl;
    startTransition(async () => {
      const r = await fn(localItem.id);
      if (r?.url) {
        window.open(r.url, '_blank', 'noopener,noreferrer');
      } else {
        showMsg(r?.error || 'Gagal generate link', 'error');
      }
    });
  }

  // ============ DELETE ============
  function handleDelete(kind) {
    if (!confirm(`Hapus ${kind === 'invoice' ? 'invoice' : 'bukti transfer'} ini?`)) return;
    const fn = kind === 'invoice' ? deleteInvoice : deleteTransferProof;
    startTransition(async () => {
      const r = await fn(localItem.id);
      if (r?.error) showMsg(r.error, 'error');
      else {
        showMsg('✓ File dihapus');
        if (kind === 'invoice') {
          setLocalItem({ ...localItem, invoice_url: null, invoice_uploaded_at: null });
        } else {
          setLocalItem({ ...localItem, transfer_proof_url: null, transfer_proof_uploaded_at: null });
        }
        router.refresh();
      }
    });
  }

  // ============ FILE INPUT HANDLERS ============
  function onInvoiceSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleDirectUpload(file, 'invoice');
    if (invoiceRef.current) invoiceRef.current.value = '';
  }
  function onProofSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleDirectUpload(file, 'proof');
    if (proofRef.current) proofRef.current.value = '';
  }

  // ============ RENDER ============
  return (
    <div className="space-y-2 mt-2">
      {msg && (
        <div className={`text-xs p-2 rounded border ${
          msg.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {msg.text}
        </div>
      )}

      {/* INVOICE BAR */}
      <div className={`border rounded-lg p-2.5 ${hasInvoice ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">📎</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-purple-800">INVOICE (DARI VENDOR)</p>
              {hasInvoice ? (
                <p className="text-[10px] text-purple-600 truncate">
                  {fileIcon(localItem.invoice_url)} {localItem.invoice_url.split('/').pop()}
                  {localItem.invoice_uploaded_at && ` · ${fmtDateTime(localItem.invoice_uploaded_at)}`}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 italic">BELUM ADA</p>
              )}
            </div>
          </div>
          <div className="flex gap-1.5">
            {hasInvoice && (
              <>
                <button
                  type="button"
                  onClick={() => handleView('invoice')}
                  disabled={pending}
                  className="px-2 py-1 text-[11px] rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  ↗ Lihat
                </button>
                {canUploadInvoice && (
                  <button
                    type="button"
                    onClick={() => handleDelete('invoice')}
                    disabled={pending || uploading === 'invoice'}
                    className="px-2 py-1 text-[11px] rounded bg-red-100 text-red-700 font-semibold hover:bg-red-200 disabled:opacity-50"
                  >
                    🗑
                  </button>
                )}
              </>
            )}
            {canUploadInvoice && (
              <button
                type="button"
                onClick={() => invoiceRef.current?.click()}
                disabled={pending || uploading === 'invoice'}
                className={`px-2 py-1 text-[11px] rounded font-semibold disabled:opacity-50 ${
                  hasInvoice
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {uploading === 'invoice' ? `⏳ ${progress}%` : hasInvoice ? '🔄 Ganti' : '📤 Upload Invoice'}
              </button>
            )}
          </div>
        </div>
        <input autoComplete="off"
          ref={invoiceRef}
          type="file"
          accept={ACCEPT_ALL}
          onChange={onInvoiceSelect}
          disabled={pending || uploading === 'invoice'}
          className="hidden"
        />
        {!hasInvoice && (
          <p className="text-[9px] text-slate-400 mt-1">
            🖼 Image · 📄 PDF · 📊 Excel · 📝 Word · 📋 CSV — max {MAX_FILE_SIZE_MB} MB
          </p>
        )}
      </div>

      {/* BUKTI TRANSFER BAR */}
      <div className={`border rounded-lg p-2.5 ${hasProof ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">💸</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-800">BUKTI TRANSFER (DARI ACCOUNTING)</p>
              {hasProof ? (
                <p className="text-[10px] text-emerald-600 truncate">
                  {fileIcon(localItem.transfer_proof_url)} {localItem.transfer_proof_url.split('/').pop()}
                  {localItem.transfer_proof_uploaded_at && ` · ${fmtDateTime(localItem.transfer_proof_uploaded_at)}`}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 italic">BELUM ADA</p>
              )}
            </div>
          </div>
          <div className="flex gap-1.5">
            {hasProof && (
              <>
                <button
                  type="button"
                  onClick={() => handleView('proof')}
                  disabled={pending}
                  className="px-2 py-1 text-[11px] rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  ↗ Lihat
                </button>
                {canUploadProof && (
                  <button
                    type="button"
                    onClick={() => handleDelete('proof')}
                    disabled={pending || uploading === 'proof'}
                    className="px-2 py-1 text-[11px] rounded bg-red-100 text-red-700 font-semibold hover:bg-red-200 disabled:opacity-50"
                  >
                    🗑
                  </button>
                )}
              </>
            )}
            {canUploadProof && (
              <button
                type="button"
                onClick={() => proofRef.current?.click()}
                disabled={pending || uploading === 'proof'}
                className={`px-2 py-1 text-[11px] rounded font-semibold disabled:opacity-50 ${
                  hasProof
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {uploading === 'proof' ? `⏳ ${progress}%` : hasProof ? '🔄 Ganti' : '📤 Upload Bukti'}
              </button>
            )}
          </div>
        </div>
        <input autoComplete="off"
          ref={proofRef}
          type="file"
          accept={ACCEPT_ALL}
          onChange={onProofSelect}
          disabled={pending || uploading === 'proof'}
          className="hidden"
        />
        {!hasProof && (
          <p className="text-[9px] text-slate-400 mt-1">
            🖼 Image · 📄 PDF · 📊 Excel · 📝 Word · 📋 CSV — max {MAX_FILE_SIZE_MB} MB
          </p>
        )}
      </div>
    </div>
  );
}
