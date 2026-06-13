'use client';

// R215p + R216 (family): Public client untuk upload dokumen visa
// Satu link keluarga → upload dokumen untuk SETIAP anggota (3 orang = 3x per dokumen)
// Path: components/visa/VisaPublicUploadClient.jsx

import { useState, useRef } from 'react';
import { compressImage } from '@/lib/utils/compress-image';
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

export default function VisaPublicUploadClient({ token, passenger, trip, customer, members, isFamily }) {
  const router = useRouter();
  const [msg, setMsg] = useState(null);
  const [busyKey, setBusyKey] = useState(null);       // `${memberId}::${docName}::up|del`

  const docTemplate = Array.isArray(trip?.visa_doc_template) ? trip.visa_doc_template : [];

  // Fallback ke peserta tunggal kalau members tidak dikirim
  const memberList = (Array.isArray(members) && members.length)
    ? members
    : [{
        id: passenger?.id,
        name: customer?.name || 'Peserta',
        is_family_head: true,
        visa_uploaded_docs: Array.isArray(passenger?.visa_uploaded_docs) ? passenger.visa_uploaded_docs : [],
      }];

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 5000);
  }

  async function handleUpload(memberId, docName, rawFile) {
    if (!rawFile) return;
    const file = await compressImage(rawFile);
    setBusyKey(`${memberId}::${docName}::up`);
    try {
      const fd = new FormData();
      fd.append('doc_file', file);
      const r = await uploadVisaDocByToken(token, docName, fd, memberId);
      if (r?.error) showMsg('Upload gagal: ' + r.error, 'error');
      else { showMsg(`✓ "${docName}" berhasil ter-upload!`); router.refresh(); }
    } catch (e) {
      showMsg('Error: ' + e.message, 'error');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(memberId, docName) {
    if (!confirm(`Hapus "${docName}"? Bisa di-upload ulang setelahnya.`)) return;
    setBusyKey(`${memberId}::${docName}::del`);
    try {
      const r = await deleteUploadedDocByToken(token, docName, memberId);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ "${docName}" terhapus`); router.refresh(); }
    } catch (e) {
      showMsg('Error: ' + e.message, 'error');
    } finally {
      setBusyKey(null);
    }
  }

  const perMember = docTemplate.length || 1;
  const totalSlots = perMember * memberList.length;
  const uploadedSlots = memberList.reduce((acc, m) => {
    const ud = Array.isArray(m.visa_uploaded_docs) ? m.visa_uploaded_docs : [];
    // hitung hanya dokumen yg ada di template
    return acc + ud.filter((d) => docTemplate.includes(d.doc_name)).length;
  }, 0);
  const progress = Math.min(Math.round((uploadedSlots / Math.max(totalSlots, 1)) * 100), 100);

  return (
    <div className="p-6 space-y-6">
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${
          msg.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Info trip */}
      <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-bold text-cyan-800 uppercase">{isFamily ? 'Kepala Keluarga' : 'Nama Peserta'}</p>
            <p className="font-bold text-slate-800">{customer?.name || memberList[0]?.name || '—'}</p>
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

      {isFamily && (
        <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200 text-sm text-indigo-800">
          👨‍👩‍👧 Ini link <b>1 keluarga ({memberList.length} orang)</b>. Mohon upload dokumen untuk
          <b> setiap anggota</b> di bagian masing-masing ya, Kak.
        </div>
      )}

      {/* PDF Syarat link */}
      {trip?.visa_pdf_syarat_url && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs font-bold text-amber-800 mb-1">📋 Persyaratan Lengkap</p>
          <a href={trip.visa_pdf_syarat_url} target="_blank" rel="noreferrer" className="text-sm text-amber-700 hover:underline font-semibold">
            🔗 Buka PDF Persyaratan Visa
          </a>
        </div>
      )}

      {/* Progress total */}
      <div className="bg-white border-2 border-cyan-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-cyan-800">📊 Progress Upload {isFamily ? '(semua anggota)' : ''}</p>
          <p className="text-sm font-bold text-cyan-700">{uploadedSlots} / {totalSlots} dokumen</p>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
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

      {/* Per anggota */}
      {docTemplate.length === 0 ? (
        <div className="bg-slate-50 rounded-lg p-6 text-center">
          <p className="text-sm text-slate-500">Belum ada list dokumen di trip ini.</p>
          <p className="text-xs text-slate-400 mt-1">Mohon tunggu admin setup list dokumen.</p>
        </div>
      ) : (
        memberList.map((m, mi) => {
          const ud = Array.isArray(m.visa_uploaded_docs) ? m.visa_uploaded_docs : [];
          const done = ud.filter((d) => docTemplate.includes(d.doc_name)).length;
          return (
            <div key={m.id || mi} className="border-2 border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-600 text-white text-xs font-bold flex items-center justify-center">{mi + 1}</span>
                  <p className="text-sm font-bold text-slate-800">{m.name}</p>
                  {m.is_family_head && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Kepala Keluarga</span>}
                </div>
                <p className="text-xs font-bold text-slate-500">{done}/{docTemplate.length}</p>
              </div>
              <div className="p-3 space-y-2">
                {docTemplate.map((docName, idx) => {
                  const uploaded = ud.find((d) => d.doc_name === docName);
                  return (
                    <DocUploadRow
                      key={docName + idx}
                      docName={docName}
                      uploaded={uploaded}
                      isUploading={busyKey === `${m.id}::${docName}::up`}
                      isDeleting={busyKey === `${m.id}::${docName}::del`}
                      onUpload={(file) => handleUpload(m.id, docName, file)}
                      onDelete={() => handleDelete(m.id, docName)}
                      uid={`${m.id}-${idx}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })
      )}

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

function DocUploadRow({ docName, uploaded, isUploading, isDeleting, onUpload, onDelete, uid }) {
  const fileRef = useRef(null);
  const isComplete = !!uploaded;
  const inputId = `upload-${uid}`;

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
          <input autoComplete="off" ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf" onChange={handleFileChange} disabled={isUploading} className="hidden" id={inputId} />
          {!isComplete ? (
            <label htmlFor={inputId} className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer ${isUploading ? 'bg-slate-300 text-slate-500' : 'bg-cyan-600 hover:bg-cyan-700 text-white'}`}>
              {isUploading ? '⏳ Uploading...' : '📤 Upload'}
            </label>
          ) : (
            <>
              <label htmlFor={inputId} className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer ${isUploading ? 'bg-slate-300 text-slate-500' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}>
                {isUploading ? '⏳' : '↻ Replace'}
              </label>
              <button type="button" onClick={onDelete} disabled={isDeleting} className="px-3 py-1.5 text-xs font-bold rounded bg-red-100 hover:bg-red-200 text-red-700">
                {isDeleting ? '⏳' : '🗑'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
