'use client';

// Round 57: DOC_CATEGORIES dari utility file (bukan 'use server')
// Plus hyper-defensive array handling

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { addTripDocument, deleteTripDocument } from '@/lib/actions/trip-docs';
import { DOC_CATEGORIES } from '@/lib/utils/trip-doc-categories';
import { fmtDate } from '@/lib/utils/format';

export default function TripDocuments({ tripId, documents, readOnly = false }) {
  const docs = Array.isArray(documents) ? documents : [];
  const cats = Array.isArray(DOC_CATEGORIES) ? DOC_CATEGORIES : [];

  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState('file');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const router = useRouter();

  async function handleFileUpload(file) {
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${tripId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('trip-docs').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error) {
        setUploadError('Upload gagal: ' + error.message + ' (cek bucket trip-docs di Supabase Storage)');
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from('trip-docs').getPublicUrl(path);
      const fileType = file.type?.startsWith?.('image/') ? 'image'
        : file.type === 'application/pdf' ? 'pdf'
        : 'doc';
      setUploadedFile({ url: pub.publicUrl, path, type: fileType, name: file.name });
    } catch (e) {
      setUploadError('Upload error: ' + (e?.message || 'unknown'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(formData) {
    if (uploadMode === 'file' && uploadedFile) {
      formData.set('file_url', uploadedFile.url);
      formData.set('file_path', uploadedFile.path);
      formData.set('file_type', uploadedFile.type);
    } else if (uploadMode === 'url') {
      formData.set('file_path', '');
      formData.set('file_type', 'link');
    } else {
      alert('Upload file atau paste URL dulu');
      return;
    }

    startTransition(async () => {
      const r = await addTripDocument(tripId, formData);
      if (r?.error) { alert(r.error); return; }
      setShowForm(false);
      setUploadedFile(null);
      setUploadMode('file');
      router.refresh();
    });
  }

  function handleDelete(docId) {
    if (!confirm('Hapus dokumen ini?')) return;
    startTransition(async () => {
      const r = await deleteTripDocument(docId, tripId);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  // Group docs by category — defensive
  const byCategory = {};
  for (const d of docs) {
    if (!d || !d.category) continue;
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-brand-700">📂 Dokumen Trip ({docs.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {readOnly ? 'Read-only — Ops upload dokumen, kamu bisa akses' : 'Upload voucher hotel, tiket, kontak vendor, dll. Bisa diakses TL via Portal.'}
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg"
          >
            {showForm ? '× Tutup' : '+ Upload Dokumen'}
          </button>
        )}
      </div>

      {showForm && !readOnly && (
        <form action={handleSubmit} className="p-4 bg-brand-50/40 border-b border-slate-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 block mb-1">Kategori <span className="text-red-500">*</span></span>
              <select name="category" required className={inputCls}>
                {cats.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 block mb-1">Judul / Nama Dokumen <span className="text-red-500">*</span></span>
              <input name="title" required placeholder="Misal: Voucher Hotel Roma Day 3-5" className={inputCls} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi (opsional)</span>
            <input name="description" placeholder="Catatan untuk TL" className={inputCls} />
          </label>

          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setUploadMode('file')} className={`px-3 py-1 rounded font-semibold ${uploadMode === 'file' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
              📤 Upload File
            </button>
            <button type="button" onClick={() => setUploadMode('url')} className={`px-3 py-1 rounded font-semibold ${uploadMode === 'url' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
              🔗 Paste URL (Drive/Dropbox)
            </button>
          </div>

          {uploadMode === 'file' && (
            <div>
              <input
                type="file"
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
                disabled={uploading}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                className="w-full text-sm border border-slate-300 rounded p-2"
              />
              {uploading && <p className="text-xs text-blue-700 mt-1">⏳ Uploading...</p>}
              {uploadError && <p className="text-xs text-red-700 mt-1">{uploadError}</p>}
              {uploadedFile && (
                <p className="text-xs text-green-700 mt-1">✓ Uploaded: {uploadedFile.name}</p>
              )}
              <p className="text-[10px] text-slate-500 mt-1">
                Max 10MB. PDF/Gambar/Word/Excel. Tersimpan di Supabase Storage bucket "trip-docs".
              </p>
            </div>
          )}

          {uploadMode === 'url' && (
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 block mb-1">URL Dokumen</span>
              <input
                name="file_url"
                type="url"
                required
                placeholder="https://drive.google.com/file/d/..."
                className={inputCls}
              />
            </label>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setUploadedFile(null); setUploadError(''); }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Batal</button>
            <button
              type="submit"
              disabled={pending || uploading || (uploadMode === 'file' && !uploadedFile)}
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded disabled:opacity-50"
            >
              {pending ? 'Menyimpan...' : 'Simpan Dokumen'}
            </button>
          </div>
        </form>
      )}

      {docs.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">
          {readOnly
            ? 'Ops belum upload dokumen apapun untuk trip ini.'
            : 'Belum ada dokumen. Klik "+ Upload Dokumen" untuk mulai.'}
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {cats
            .filter((c) => Array.isArray(byCategory[c.value]) && byCategory[c.value].length > 0)
            .map((c) => (
              <div key={c.value} className="px-5 py-3">
                <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">{c.icon} {c.label}</p>
                <div className="space-y-1.5">
                  {byCategory[c.value].map((d) => (
                    <div key={d.id} className="flex items-start justify-between gap-3 p-2 bg-slate-50 rounded">
                      <div className="flex-1 min-w-0">
                        <a
                          href={d.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand-700 hover:underline"
                        >
                          {d.file_type === 'pdf' ? '📄' : d.file_type === 'image' ? '🖼' : '📎'} {d.title}
                        </a>
                        {d.description && <p className="text-[11px] text-slate-600 mt-0.5">{d.description}</p>}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Upload by {d.uploaded_by || '—'} · {fmtDate(d.created_at)}
                        </p>
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => handleDelete(d.id)}
                          disabled={pending}
                          className="text-xs px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-700 font-semibold"
                        >🗑</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white';
