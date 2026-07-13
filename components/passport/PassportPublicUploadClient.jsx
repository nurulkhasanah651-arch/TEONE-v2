'use client';

// PUBLIC client — upload paspor per anggota keluarga. Kompres foto sebelum kirim.
// + Dokumen tambahan (endorse / lainnya) — bisa 2-3 dokumen per orang.
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createPassportUploadTicket, confirmPassportUpload, confirmPassportExtra } from '@/lib/actions/passport-upload';

async function compressImage(file) {
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

async function uploadOne(token, memberId, file) {
  const out = await compressImage(file);
  const ct = out.type || 'application/octet-stream';
  const t = (await createPassportUploadTicket(token, memberId, ct)) || {};
  if (!t.ok) return { error: t.error || 'Gagal menyiapkan upload' };
  const sb = createClient(t.supabaseUrl, t.anonKey);
  const up = await sb.storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, out, { contentType: ct, upsert: true });
  if (up.error) return { error: 'Gagal upload file: ' + up.error.message };
  return { ok: true, path: t.path };
}

function ExtraRow({ token, memberId }) {
  const [label, setLabel] = useState('Endorse');
  const [status, setStatus] = useState('idle');
  const [msg, setMsg] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('uploading'); setMsg('');
    try {
      const u = await uploadOne(token, memberId, file);
      if (u.error) { setStatus('error'); setMsg(u.error); return; }
      const c = (await confirmPassportExtra(token, memberId, u.path, label)) || {};
      if (c.error) { setStatus('error'); setMsg(c.error); }
      else if (c.ok) { setStatus('done'); setMsg('Tersimpan'); }
      else { setStatus('error'); setMsg('Gagal — coba lagi.'); }
    } catch (err) { setStatus('error'); setMsg(err?.message || 'Gagal upload'); }
  }

  const done = status === 'done';
  return (
    <div className="flex items-center gap-2 mt-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={done || status === 'uploading'}
        placeholder="Jenis (mis. Endorse)" className="w-32 text-xs px-2 py-1.5 border border-slate-300 rounded" />
      <label className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${done ? 'bg-white border border-emerald-300 text-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
        {status === 'uploading' ? 'Mengunggah…' : done ? `✅ ${label} tersimpan` : '📎 Pilih file'}
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={done || status === 'uploading'} onChange={handleFile} />
      </label>
      {status === 'error' && <span className="text-[10px] text-red-600">{msg}</span>}
    </div>
  );
}

function Row({ token, member }) {
  const [status, setStatus] = useState(member.uploaded ? 'done' : 'idle');
  const [msg, setMsg] = useState('');
  const [extraSlots, setExtraSlots] = useState(() => Math.max(1, member.extraCount || 0));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('uploading'); setMsg('');
    try {
      const u = await uploadOne(token, member.id, file);
      if (u.error) { setStatus('error'); setMsg(u.error); return; }
      const c = (await confirmPassportUpload(token, member.id, u.path)) || {};
      if (c.error) { setStatus('error'); setMsg(c.error); }
      else if (c.ok) { setStatus('done'); setMsg(c.autofilled ? 'Terbaca otomatis' : 'Tersimpan'); }
      else { setStatus('error'); setMsg('Upload gagal — coba lagi.'); }
    } catch (err) { setStatus('error'); setMsg(err?.message || 'Gagal upload'); }
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
        {status === 'uploading' ? 'Mengunggah…' : done ? '🔄 Ganti / Upload Ulang Paspor' : '📷 Pilih Foto / PDF Paspor'}
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={status === 'uploading'} onChange={handleFile} />
      </label>
      {status === 'error' && <p className="text-xs text-red-600 mt-2">{msg}</p>}

      <div className="mt-3 pt-3 border-t border-slate-200">
        <p className="text-[11px] font-semibold text-slate-500 uppercase">Dokumen tambahan (opsional)</p>
        <p className="text-[10px] text-slate-400">Mis. halaman endorse, visa lama, atau dokumen lain yang diminta.</p>
        {Array.from({ length: extraSlots }).map((_, i) => <ExtraRow key={i} token={token} memberId={member.id} />)}
        {extraSlots < 4 && (
          <button type="button" onClick={() => setExtraSlots((n) => n + 1)} className="mt-2 text-xs text-brand-600 font-semibold hover:underline">+ Tambah dokumen lagi</button>
        )}
      </div>
    </div>
  );
}

export default function PassportPublicUploadClient({ token, members = [] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
        📸 Foto <b>halaman biodata paspor</b> (yang ada foto & nama). Pastikan jelas, tidak buram, dan semua teks terbaca. Kalau ada dokumen tambahan (mis. endorse), upload di bagian "Dokumen tambahan".
      </p>
      {members.map((m) => <Row key={m.id} token={token} member={m} />)}
    </div>
  );
}
