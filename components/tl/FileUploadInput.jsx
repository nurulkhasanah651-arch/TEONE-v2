'use client';

// Round 132 HOTFIX: Fix click upload (label + input ter-link)
// Path: components/tl/FileUploadInput.jsx

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'tl-uploads';

const ACCEPT_ALL = 'image/*,application/pdf,.pdf,.xlsx,.xls,.xlsm,.docx,.doc,.csv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain';

export default function FileUploadInput({
  tripId = 'misc',
  subfolder = 'general',
  value = '',
  onChange,
  accept = ACCEPT_ALL,
  maxSizeMB = 20,
  label = 'Upload File',
  required = false,
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  function isImage(url) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
  }

  function isPdf(url) {
    if (!url) return false;
    return /\.pdf(\?|$)/i.test(url);
  }

  function isExcel(url) {
    if (!url) return false;
    return /\.(xlsx|xls|xlsm|csv)(\?|$)/i.test(url);
  }

  function isWord(url) {
    if (!url) return false;
    return /\.(docx|doc)(\?|$)/i.test(url);
  }

  function fileName(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      return decodeURIComponent(parts[parts.length - 1]);
    } catch {
      return url.split('/').pop();
    }
  }

  function fileIcon(url) {
    if (isImage(url)) return '🖼';
    if (isPdf(url)) return '📄';
    if (isExcel(url)) return '📊';
    if (isWord(url)) return '📝';
    return '📎';
  }

  function fileTypeBg(url) {
    if (isPdf(url)) return 'bg-red-50 border-red-200 text-red-700';
    if (isExcel(url)) return 'bg-green-50 border-green-200 text-green-700';
    if (isWord(url)) return 'bg-blue-50 border-blue-200 text-blue-700';
    return 'bg-slate-50 border-slate-200 text-slate-700';
  }

  function triggerFilePicker() {
    if (disabled || uploading) return;
    inputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setProgress(0);

    const sizeMB = file.size / 1048576;
    if (sizeMB > maxSizeMB) {
      setError(`File terlalu besar (${sizeMB.toFixed(1)} MB). Max ${maxSizeMB} MB.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 80);
      const timestamp = Date.now();
      const filePath = `${tripId}/${subfolder}/${timestamp}-${safeName}`;

      const { data, error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });

      if (uploadErr) {
        setError('Upload gagal: ' + uploadErr.message);
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
      onChange?.(publicUrl, { name: file.name, size: file.size, type: file.type });
      setProgress(100);
    } catch (e) {
      setError('Upload error: ' + (e?.message || 'unknown'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    if (!confirm('Hapus file ini?')) return;
    if (value) {
      try {
        const supabase = createClient();
        const url = new URL(value);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
        if (pathMatch) {
          await supabase.storage.from(BUCKET).remove([decodeURIComponent(pathMatch[1])]);
        }
      } catch {}
    }
    onChange?.('');
  }

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs font-semibold text-slate-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </p>
      )}

      {/* HIDDEN INPUT — must be inside render but separate from clickable area */}
      <input autoComplete="off"
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
      />

      {value ? (
        <div className="border-2 border-green-200 bg-green-50 rounded-lg p-3 space-y-2">
          {isImage(value) ? (
            <img src={value} alt="Uploaded" className="max-h-48 rounded border border-green-300 object-contain" />
          ) : (
            <div className={`flex items-center gap-2 p-3 rounded border ${fileTypeBg(value)}`}>
              <span className="text-3xl">{fileIcon(value)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{fileName(value)}</p>
                <p className="text-[10px] opacity-70">
                  {isPdf(value) && 'PDF Document'}
                  {isExcel(value) && 'Excel/Spreadsheet'}
                  {isWord(value) && 'Word Document'}
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-2 items-center justify-between flex-wrap">
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              download
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              ↗ View / Download
            </a>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={triggerFilePicker}
                disabled={disabled || uploading}
                className="text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 font-semibold disabled:opacity-50"
              >
                🔄 Ganti
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || uploading}
                className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-semibold disabled:opacity-50"
              >
                🗑 Hapus
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={triggerFilePicker}
          disabled={disabled || uploading}
          className={`w-full block border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors text-left ${
            disabled ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed' :
            uploading ? 'border-blue-300 bg-blue-50' :
            'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          {uploading ? (
            <div className="text-center">
              <p className="text-2xl mb-1">⏳</p>
              <p className="text-sm font-bold text-blue-700">Uploading...</p>
              <div className="w-full bg-blue-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-2xl mb-1">📤</p>
              <p className="text-sm font-bold text-slate-700">Klik untuk pilih file</p>
              <p className="text-[10px] text-slate-500 mt-1">
                🖼 JPG/PNG · 📄 PDF · 📊 Excel · 📝 Word · 📋 CSV — max {maxSizeMB} MB
              </p>
            </div>
          )}
        </button>
      )}

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
