'use client';

// KTP Upload + AI auto-extract (Claude Vision) — ADDITIVE, khusus Khasanah.
// Dipakai di halaman Passport AI (edit peserta). Upload foto KTP → AI baca →
// NIK & alamat terisi otomatis + tersimpan ke customer.
// Path: components/cs/KtpUploadAI.jsx

import { useState, useTransition } from 'react';
import FileUploadInput from '@/components/tl/FileUploadInput';
import { saveKtpFromUrl, saveKtpFields } from '@/lib/actions/ktp-upload';

export default function KtpUploadAI({ tripId, passengerId, initial = {} }) {
  const [pending, startTransition] = useTransition();
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [photoUrl, setPhotoUrl] = useState(initial.ktp_photo_url || '');
  const [nik, setNik] = useState(initial.nik || '');
  const [alamat, setAlamat] = useState(initial.ktp_alamat || '');
  const [raw, setRaw] = useState(null);

  function handleUploaded(url) {
    setPhotoUrl(url);
    if (!url) return;
    setError(''); setMsg(''); setExtracting(true);
    startTransition(async () => {
      const r = await saveKtpFromUrl(passengerId, url);
      setExtracting(false);
      if (r?.error) { setError(r.error); return; }
      const d = r.data || {};
      setRaw(d);
      if (d.nik) setNik(String(d.nik).replace(/\D/g, ''));
      // alamat gabungan dibentuk server; tampilkan yang terbaca ringkas kalau ada
      if (d.alamat) setAlamat([d.alamat, d.rt_rw && ('RT/RW ' + d.rt_rw), d.kel_desa && ('Kel/Desa ' + d.kel_desa), d.kecamatan && ('Kec. ' + d.kecamatan), d.kota_kabupaten, d.provinsi].filter(Boolean).join(', '));
      setMsg('✅ KTP terbaca & tersimpan otomatis');
    });
  }

  function simpanManual() {
    setError(''); setMsg('');
    startTransition(async () => {
      const r = await saveKtpFields(passengerId, { nik, ktp_alamat: alamat });
      if (r?.error) { setError(r.error); return; }
      setMsg('✅ Tersimpan');
    });
  }

  return (
    <div className="p-3 bg-white border-2 border-slate-300 rounded-lg space-y-2">
      <p className="text-sm font-bold text-slate-700">🪪 KTP (AI auto-fill NIK & alamat)</p>
      <FileUploadInput
        tripId={tripId || 'cs-ktp'}
        subfolder={`ktp/pax${passengerId}`}
        value={photoUrl}
        onChange={handleUploaded}
        label="🪪 Upload Foto / PDF KTP"
        maxSizeMB={20}
      />
      {extracting && <p className="text-xs text-blue-700">⏳ Membaca KTP…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}

      <div className="grid grid-cols-1 gap-2">
        <label className="text-[11px] text-slate-500 font-semibold">NIK
          <input value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={16}
            className="mt-0.5 w-full px-2 py-1.5 border border-slate-300 rounded text-sm" placeholder="16 digit NIK" />
        </label>
        <label className="text-[11px] text-slate-500 font-semibold">Alamat KTP
          <textarea value={alamat} onChange={(e) => setAlamat(e.target.value)} rows={2}
            className="mt-0.5 w-full px-2 py-1.5 border border-slate-300 rounded text-sm" placeholder="Alamat sesuai KTP" />
        </label>
      </div>
      <button type="button" onClick={simpanManual} disabled={pending}
        className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-50">
        {pending ? 'Menyimpan…' : '💾 Simpan NIK & Alamat'}
      </button>
      {raw && <details className="text-[10px] text-slate-400"><summary className="cursor-pointer">Data mentah AI</summary><pre className="whitespace-pre-wrap">{JSON.stringify(raw, null, 2)}</pre></details>}
    </div>
  );
}
