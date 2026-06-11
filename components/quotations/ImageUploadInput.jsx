'use client';

// Round 163: ImageUploadInput — upload langsung ke Supabase Storage
// Path: components/quotations/ImageUploadInput.jsx

import { useState, useRef } from 'react';
import { compressImage } from '@/lib/utils/compress-image';
import { uploadQuotationImage } from '@/lib/actions/quotations';

export default function ImageUploadInput({ value, onChange, label = 'Upload Image', accept = 'image/*', maxSizeMB = 10 }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(e) {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await compressImage(file);
    setError('');

    // Validate size client-side
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${maxSizeMB}MB.`);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const result = await uploadQuotationImage(formData);
    setUploading(false);

    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.url) {
      onChange(result.url);
    }
  }

  function handlePasteUrl() {
    const url = prompt('Paste URL gambar (atau kosongkan untuk hapus):');
    if (url === null) return;
    onChange(url.trim());
  }

  function handleClear() {
    if (!confirm('Hapus gambar ini?')) return;
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative group">
          <img src={value} alt="Preview" className="w-full max-h-64 object-cover rounded-lg border border-slate-200" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-2 py-1 bg-white/90 hover:bg-white text-xs font-semibold rounded shadow"
              title="Ganti gambar"
            >
              🔄
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-2 py-1 bg-white/90 hover:bg-red-100 text-red-600 text-xs font-semibold rounded shadow"
              title="Hapus"
            >
              🗑
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-brand-400 rounded-lg p-6 text-center cursor-pointer transition-colors"
        >
          {uploading ? (
            <>
              <p className="text-2xl mb-1">⏳</p>
              <p className="text-sm font-semibold text-slate-600">Uploading...</p>
            </>
          ) : (
            <>
              <p className="text-3xl mb-2">📸</p>
              <p className="text-sm font-semibold text-slate-700">{label}</p>
              <p className="text-[11px] text-slate-500 mt-1">Klik untuk pilih · Max {maxSizeMB}MB · JPG/PNG/WebP</p>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input autoComplete="off"
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 bg-brand-100 hover:bg-brand-200 text-brand-700 text-xs font-semibold rounded disabled:opacity-50"
        >
          📤 Upload File
        </button>
        <button
          type="button"
          onClick={handlePasteUrl}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded"
        >
          🔗 Paste URL
        </button>
        {value && (
          <span className="text-[11px] text-slate-500 flex-1 truncate" title={value}>{value.slice(0, 60)}{value.length > 60 ? '...' : ''}</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
