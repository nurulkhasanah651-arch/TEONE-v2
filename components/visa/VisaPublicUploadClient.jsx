'use client';

// R215p: Public client component untuk upload dokumen visa
// Path: components/visa/VisaPublicUploadClient.jsx

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadVisaDocByToken, deleteUploadedDocByToken } from '@/lib/actions/visa-public-upload';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(d); }
}

function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function VisaPublicUploadClient({ token, passenger, trip, customer }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);

  const docTemplate = Array.isArray(trip?.visa_doc_template) ? trip.visa_doc_template : [];
  const uploadedDocs = Array.isArray(passenger?.visa_uploaded_docs) ? passenger.visa_uploaded_docs : [];

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 5000);
  }

  async function handleUpload(docName, file) {
    if (!file) return;
    setUploadingDoc(docName);
    try {
      const fd = new FormData();
      fd.append('doc_file', file);
      const r = await uploadVisaDocByToken(token, docName, fd);
      if (r?.error) {
        showMsg('Upload gagal: ' + r.error, 'error');
      } else {
        showMsg(`✓ "${docName}" berhasil ter-upload!`);
        router.refresh();
      }
    } catch (e) {
      showMsg('Error: ' + e.message, 'error');
    } finally {
      setUploadingDoc(null);
    }
  }

  async function handleDelete(docName) {
    if (!confirm(`Hapus "${docName}"? Bisa di-upload ulang setelahnya.`)) return;
    setDeletingDoc(docName);
    try {
      const r = await deleteUploadedDocByToken(token, docName);
      if (r?.error) {
        showMsg(r.error, 'error');
      } else {
        showMsg(`✓ "${docName}" terhapus`);
        router.refresh();
      }
    } catch (e) {
      showMsg('Error: ' + e.message, 'error');
    } finally {
      setDeletingDoc(null);
    }
  }

  const uploadedCount = uploadedDocs.length;
  const totalCount = docTemplate.length || 1;
  const progress = Math.min(Math.round((uploadedCount / Math.max(totalCount, 1)) * 100), 100);

  return (
    <div className="p-6 space-y-6">
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${
          msg.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Peserta info */}
      <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-bold text-cyan-800 uppercase">Nama Peserta</p>
            <p className="font-bold text-slate-800">{customer?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-cyan-800 uppercase">Trip</p>
            <p className="font-bold text-slate-800">{trip?.kode_trip ? `${trip.kode_trip} · ` : ''}{trip?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-cyan-800 uppercase">Visa</p>
            <p className="font-semibold text-slate-700">{trip?.visa_country || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-cyan-800 uppercase">Keberangkatan</p>
            <p className="font-semibold text-slate-700">{fmtDate(trip?.departure)}</p>
          </div>
        </div>
      </div>

      {/* PDF Syarat link */}
      {trip?.visa_pdf_syarat_url && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs font-bold text-amber-800 mb-1">📋 Persyaratan Lengkap</p>
          <a
            href={trip.visa_pdf_syarat_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-amber-700 hover:underline font-semibold"
          >
            🔗 Buka PDF Persyaratan Visa
          </a>
        </div>
      )}

      {/* Progress */}
      <div className="bg-white border-2 border-cyan-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-cyan-800">📊 Progress Upload</p>
          <p className="text-sm font-bold text-cyan-700">{uploadedCount} / {totalCount} dokumen</p>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-1">{progress}% selesai</p>
      </div>

      {/* Deadline */}
      {trip?.visa_deadline_doc && (
        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
          <p className="text-xs font-bold text-red-800">⏰ Deadline Upload</p>
          <p className="text-sm font-semibold text-red-700">{fmtDate(trip.visa_deadline_doc)}</p>
        </div>
      )}

      {/* Document list */}
      <div className="space-y-2">
        <h2 className="text-base font-bold text-slate-800">📋 Dokumen Yang Perlu Di-upload</h2>
        {docTemplate.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-6 text-center">
            <p className="text-sm text-slate-500">Belum ada list dokumen di trip ini.</p>
            <p className="text-xs text-slate-400 mt-1">Mohon tunggu admin setup list dokumen.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docTemplate.map((docName, idx) => {
              const uploaded = uploadedDocs.find((d) => d.doc_name === docName);
              const isUploading = uploadingDoc === docName;
              const isDeleting = deletingDoc === docName;
              return (
                <DocUploadRow
                  key={docName + idx}
                  docName={docName}
                  uploaded={uploaded}
                  isUploading={isUploading}
                  isDeleting={isDeleting}
                  onUpload={(file) => handleUpload(docName, file)}
                  onDelete={() => handleDelete(docName)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-1">
        <p>📤 <b>Format diizinkan:</b> JPG, PNG, WEBP, HEIC, PDF (max 10 MB per file)</p>
        <p>🔒 <b>Privasi:</b> Dokumen hanya bisa diakses oleh tim visa TE</p>
        <p>✏ <b>Replace:</b> Upload ulang file dgn dokumen yg sama akan replace yg lama</p>
        <p>📞 <b>Bantuan:</b> Chat WA tim visa kalau ada kendala</p>
      </div>
    </div>
  );
}

function DocUploadRow({ docName, uploaded, isUploading, isDeleting, onUpload, onDelete }) {
  const fileRef = useRef(null);
  const isComplete = !!uploaded;

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className={`rounded-lg border p-3 transition ${isComplete ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isComplete ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {isComplete ? '✓' : '○'}
            </span>
            <p className={`text-sm font-semibold ${isComplete ? 'text-emerald-800' : 'text-slate-800'}`}>{docName}</p>
          </div>
          {uploaded && (
            <div className="mt-1 ml-9 text-[11px] text-slate-600">
              <p>📎 {uploaded.original_name || uploaded.doc_name} · {fmtFileSize(uploaded.file_size)}</p>
              <p>📅 Uploaded: {new Date(uploaded.uploaded_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!isComplete ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf"
                onChange={handleFileChange}
                disabled={isUploading}
                className="hidden"
                id={`upload-${docName}`}
              />
              <label
                htmlFor={`upload-${docName}`}
                className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer ${isUploading ? 'bg-slate-300 text-slate-500' : 'bg-cyan-600 hover:bg-cyan-700 text-white'}`}
              >
                {isUploading ? '⏳ Uploading...' : '📤 Upload'}
              </label>
            </>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf"
                onChange={handleFileChange}
                disabled={isUploading}
                className="hidden"
                id={`upload-${docName}`}
              />
              <label
                htmlFor={`upload-${docName}`}
                className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer ${isUploading ? 'bg-slate-300 text-slate-500' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
              >
                {isUploading ? '⏳' : '↻ Replace'}
              </label>
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-bold rounded bg-red-100 hover:bg-red-200 text-red-700"
              >
                {isDeleting ? '⏳' : '🗑'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
