'use client';

// Round 131: Trip Docs — UPLOAD INTERNAL ONLY, TL bisa DOWNLOAD aja
// Plus custom category text (kalau "Other" dipilih)
// Path: components/tl/TripDocsSection.jsx

import { useState, useTransition } from 'react';
import { addTripDocument, deleteTripDocument } from '@/lib/actions/tlmanage';

const CATEGORIES = [
  { value: 'voucher', label: '🎫 Voucher Hotel/Tour' },
  { value: 'ticket', label: '✈ Tiket Pesawat' },
  { value: 'vendor_contract', label: '📑 Vendor Contract' },
  { value: 'manifest', label: '📋 Manifest' },
  { value: 'roomlist', label: '🛏 Roomlist' },
  { value: 'insurance', label: '🛡 Asuransi' },
  { value: 'visa', label: '🛂 Dokumen Visa' },
  { value: 'briefing', label: '📚 Materi Briefing' },
  { value: 'itinerary', label: '🗓 Itinerary' },
  { value: 'emergency_contact', label: '☎ Emergency Contact' },
  { value: 'other', label: '📂 Lainnya / Custom' },
];

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); }
  catch { return s; }
}

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export default function TripDocsSection({
  tripId, docs = [],
  canUpload = false,  // Round 131: TRUE hanya untuk internal (manager/ops/owner/cs)
  isTL = false,       // Round 131: TL view-only (download)
  userEmail = '',
}) {
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [customCategory, setCustomCategory] = useState('');
  const [title, setTitle] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setCategory(CATEGORIES[0].value);
    setCustomCategory('');
    setTitle(''); setFileUrl(''); setNotes('');
  }

  function handleAdd() {
    setError('');
    if (!title.trim()) { setError('Judul wajib'); return; }
    if (!fileUrl.trim()) { setError('Link file wajib'); return; }
    if (category === 'other' && !customCategory.trim()) {
      setError('Untuk "Lainnya/Custom", isi nama kategori-nya');
      return;
    }

    startTransition(async () => {
      const r = await addTripDocument({
        tripId,
        category: category === 'other' ? `custom:${customCategory.trim()}` : category,
        title: title.trim(),
        fileUrl: fileUrl.trim(),
        notes: notes.trim(),
        userEmail,
      });
      if (r?.error) { setError(r.error); return; }
      resetForm();
      setShowForm(false);
    });
  }

  function handleDelete(docId, title) {
    if (!confirm(`Hapus dokumen "${title}"?`)) return;
    startTransition(async () => {
      const r = await deleteTripDocument(docId, tripId);
      if (r?.error) alert(r.error);
    });
  }

  // Group by category
  const docsByCategory = {};
  for (const d of docs) {
    const cat = d.category || 'other';
    if (!docsByCategory[cat]) docsByCategory[cat] = [];
    docsByCategory[cat].push(d);
  }

  function getCatLabel(catKey) {
    if (catKey && catKey.startsWith('custom:')) {
      return `📂 ${catKey.replace('custom:', '')}`;
    }
    return CATEGORIES.find((c) => c.value === catKey)?.label || catKey;
  }

  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-blue-50 border-blue-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-blue-800 flex items-center gap-2">
            <span>📂</span> Dokumen Trip
            <span className="text-xs font-semibold text-slate-600">({docs.length})</span>
          </h2>
          {isTL && (
            <p className="text-[10px] text-blue-700 mt-0.5">📥 TL: Klik link untuk download. Upload by Internal only.</p>
          )}
        </div>
        {canUpload && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold"
          >
            + Upload Dokumen
          </button>
        )}
      </div>

      {showForm && canUpload && (
        <div className="p-5 bg-blue-50/40 border-b border-blue-100 space-y-3">
          <h3 className="text-sm font-bold text-blue-800">Tambah Dokumen Baru</h3>
          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded p-2">
            💡 Upload file ke Google Drive/Dropbox → set "Anyone with the link can view" → paste link ke field.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Kategori" required>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            {category === 'other' && (
              <Field label="Nama Kategori Custom" required>
                <input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Contoh: SOP, Cleaning Schedule, dll"
                  className={inputCls}
                />
              </Field>
            )}
            <Field label="Judul Dokumen" required className={category === 'other' ? '' : 'md:col-span-1'}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Voucher Hotel Champs Elysees"
                className={inputCls}
              />
            </Field>
            <Field label="Link File (Google Drive/Dropbox)" required className="md:col-span-2">
              <input
                type="url"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                className={inputCls}
              />
            </Field>
            <Field label="Catatan" className="md:col-span-2">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="(opsional)"
                className={inputCls}
              />
            </Field>
          </div>
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={pending}
              className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg disabled:opacity-50"
            >
              {pending ? 'Menyimpan...' : '📤 Upload'}
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); setError(''); }}
              disabled={pending}
              className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-3xl mb-2">📂</p>
          <p className="text-sm">Belum ada dokumen untuk trip ini.</p>
          {canUpload && <p className="text-xs text-slate-400 mt-1">Klik "+ Upload Dokumen" untuk mulai.</p>}
          {isTL && <p className="text-xs text-slate-400 mt-1">Tim Internal akan upload dokumen di sini.</p>}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {Object.entries(docsByCategory).map(([cat, list]) => (
            <div key={cat} className="p-4">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">{getCatLabel(cat)}</p>
              <div className="space-y-1.5">
                {list.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 p-2 rounded bg-slate-50 hover:bg-slate-100 group">
                    <div className="flex-1 min-w-0">
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-blue-700 hover:underline truncate block"
                      >
                        📄 {d.title} <span className="text-[10px] text-blue-500">↗ Open/Download</span>
                      </a>
                      {d.notes && <p className="text-xs text-slate-500 mt-0.5">{d.notes}</p>}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {d.uploaded_by && `Upload by ${d.uploaded_by}`}
                        {d.created_at && ` · ${fmtDate(d.created_at)}`}
                        {d.file_size_bytes && ` · ${fmtSize(d.file_size_bytes)}`}
                      </p>
                    </div>
                    {canUpload && (
                      <button
                        onClick={() => handleDelete(d.id, d.title)}
                        disabled={pending}
                        className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold disabled:opacity-50 transition-opacity"
                      >
                        🗑
                      </button>
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

function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white';
