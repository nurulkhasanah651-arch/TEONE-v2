'use client';

// PUBLIC client — upload paspor per anggota keluarga. Kompres foto sebelum kirim.
import { useState } from 'react';
import { saveUploadedPassport } from '@/lib/actions/passport-upload';

async function compressImage(file) {
  // Hanya untuk image; PDF/lainnya dikirim apa adanya.
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const maxDim = 1600;
    let { width, height } = bmp;
    if (width > maxDim || height > maxDim) {
      const r = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * r); height = Math.round(height * r);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.75));
    if (blob && blob.size < file.size) return new File([blob], 'passport.jpg', { type: 'image/jpeg' });
  } catch {}
  return file;
}

function Row({ token, member }) {
  const [status, setStatus] = useState(member.uploaded ? 'done' : 'idle'); // idle|uploading|done|error
  const [msg, setMsg] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('uploading'); setMsg('');
    try {
      const out = await compressImage(file);
      const fd = new FormData();
      fd.append('file', out, out.name || 'passport');
      const r = (await saveUploadedPassport(token, member.id, fd)) || {};
      if (r.error) { setStatus('error'); setMsg(r.error); }
      else if (r.ok) { setStatus('done'); setMsg(r.autofilled ? 'Terbaca otomatis ✓' : 'Tersimpan ✓'); }
      else { setStatus('error'); setMsg('Upload gagal — coba lagi.'); }
    } catch (err) {
      setStatus('error'); setMsg(err?.message || 'Gagal upload');
    }
  }

  const done = status === 'done';
  return (
    <div className={`rounded-xl border p-4 ${done ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-800">{member.name}</p>
        {done && <span className="text-xs font-bold text-emerald-700">✅ {msg || 'Sudah upload'}</span>}
        {status === 'uploading' && <span className="text-xs text-slate-500">Mengunggah…</span>}
      </div>
      <label className={`mt-3 block w-full text-center py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${done ? 'bg-white border border-emerald-300 text-emerald-700' : 'bg-brand-500 hover:bg-brand-600 text-white'}`}>
        {status === 'uploading' ? 'Mengunggah…' : done ? '🔄 Ganti / Upload Ulang' : '📷 Pilih Foto / PDF Paspor'}
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={status === 'uploading'} onChange={handleFile} />
      </label>
      {status === 'error' && <p className="text-xs text-red-600 mt-2">⚠ {msg}</p>}
    </div>
  );
}

export default function PassportPublicUploadClient({ token, members = [] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
        📸 Foto <b>halaman biodata paspor</b> (yang ada foto & nama). Pastikan jelas, tidak buram, dan semua teks terbaca.
      </p>
      {members.map((m) => <Row key={m.id} token={token} member={m} />)}
    </div>
  );
}
