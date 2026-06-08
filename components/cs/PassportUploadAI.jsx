'use client';

// Round 134: Passport Upload + AI Auto-Extract via Claude Vision
// Path: components/cs/PassportUploadAI.jsx
// Upload foto passport → AI baca → autofill data passport ke parent state

import { useState, useTransition } from 'react';
import FileUploadInput from '@/components/tl/FileUploadInput';
import { extractPassportData } from '@/lib/actions/passport';

export default function PassportUploadAI({
  tripId = 'cs-passport',
  paxIndex = 0,
  passportData = {},  // { number, surname, given_names, nationality, dob, expiry, sex, photo_url }
  onChange,           // (key, value) => void
  onExtracted,        // (extractedFields) => void  — batch update parent
}) {
  const [pending, startTransition] = useTransition();
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [aiBadge, setAiBadge] = useState(false);
  const [rawAi, setRawAi] = useState(null);

  function handlePhotoUploaded(url) {
    onChange?.('passport_photo_url', url);
    if (!url) return;

    // Auto-trigger AI extraction
    setError('');
    setExtracting(true);
    startTransition(async () => {
      const r = await extractPassportData(url);
      setExtracting(false);
      if (r?.error) {
        setError(r.error);
        return;
      }
      const d = r.data || {};
      setRawAi(d);
      setAiBadge(true);

      // Bulk update parent state
      const updates = {};
      if (d.surname) updates.passport_surname = d.surname;
      if (d.given_names) updates.passport_given_names = d.given_names;
      if (d.passport_number) updates.passport_number = d.passport_number;
      if (d.nationality_full || d.nationality) updates.nationality = d.nationality_full || d.nationality;
      if (d.dob) updates.dob = d.dob;
      if (d.expiry) updates.passport_expiry = d.expiry;
      if (d.issue_date) updates.passport_issue_date = d.issue_date;
      if (d.sex) updates.sex = d.sex;
      if (d.place_of_birth) updates.place_of_birth = d.place_of_birth;
      if (d.place_of_issue) updates.passport_issued_at = d.place_of_issue;
      if (r.mrz_raw) updates.mrz_raw = r.mrz_raw;

      // Auto-fill first_name + last_name kalau parent listen
      if (d.given_names) updates.first_name_auto = d.given_names;
      if (d.surname) updates.last_name_auto = d.surname;

      onExtracted?.(updates);
    });
  }

  async function handleRetryExtract() {
    if (!passportData.passport_photo_url) {
      setError('Belum ada foto passport');
      return;
    }
    setError('');
    setExtracting(true);
    startTransition(async () => {
      const r = await extractPassportData(passportData.passport_photo_url);
      setExtracting(false);
      if (r?.error) {
        setError(r.error);
        return;
      }
      const d = r.data || {};
      setRawAi(d);
      setAiBadge(true);
      const updates = {};
      if (d.surname) updates.passport_surname = d.surname;
      if (d.given_names) updates.passport_given_names = d.given_names;
      if (d.passport_number) updates.passport_number = d.passport_number;
      if (d.nationality_full || d.nationality) updates.nationality = d.nationality_full || d.nationality;
      if (d.dob) updates.dob = d.dob;
      if (d.expiry) updates.passport_expiry = d.expiry;
      if (d.sex) updates.sex = d.sex;
      if (d.place_of_birth) updates.place_of_birth = d.place_of_birth;
      if (d.place_of_issue) updates.passport_issued_at = d.place_of_issue;
      if (r.mrz_raw) updates.mrz_raw = r.mrz_raw;
      onExtracted?.(updates);
    });
  }

  return (
    <div className="space-y-2">
      {/* Photo upload */}
      <div className="p-2 bg-white border-2 border-purple-300 rounded">
        <FileUploadInput
          tripId={tripId}
          subfolder={`passport/pax${paxIndex}`}
          value={passportData.passport_photo_url || ''}
          onChange={handlePhotoUploaded}
          label="🛂 Upload Foto Passport (AI auto-fill data)"
          maxSizeMB={20}
        />
        <p className="text-[10px] text-purple-700 mt-1">
          💡 Upload foto halaman passport (yang ada foto + data) — AI akan baca otomatis dan isi nama, no passport, tgl lahir, expired, dll.
        </p>
      </div>

      {/* AI Status */}
      {extracting && (
        <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded text-center">
          <p className="text-2xl mb-1 animate-pulse">🤖</p>
          <p className="text-xs font-bold text-blue-800">AI sedang baca passport...</p>
          <p className="text-[10px] text-blue-700">±5-10 detik. Mohon tunggu.</p>
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
          ⚠ {error}
          {passportData.passport_photo_url && (
            <button
              type="button"
              onClick={handleRetryExtract}
              disabled={pending}
              className="ml-2 px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold"
            >
              🔄 Retry
            </button>
          )}
        </div>
      )}

      {aiBadge && !extracting && (
        <div className="p-2 bg-green-50 border border-green-300 rounded flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-bold text-green-800 flex items-center gap-1">
            <span>🤖✓</span> AI berhasil extract data passport!
            <span className="text-[10px] font-normal text-green-700">Cek field di bawah, edit kalau salah.</span>
          </p>
          <button
            type="button"
            onClick={handleRetryExtract}
            disabled={pending || extracting}
            className="text-[10px] px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold"
          >
            🔄 Re-extract
          </button>
        </div>
      )}

      {/* Passport fields — editable */}
      <div className="p-3 bg-purple-50/50 border border-purple-200 rounded space-y-2">
        <p className="text-[11px] font-bold text-purple-800 uppercase tracking-wider flex items-center gap-2">
          🛂 Data Passport
          {aiBadge && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-200 text-purple-900 font-bold">AI EXTRACTED</span>}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <PField label="Surname (Family Name)" value={passportData.passport_surname || ''} onChange={(v) => onChange?.('passport_surname', v)} placeholder="SUTANTO" />
          <PField label="Given Names" value={passportData.passport_given_names || ''} onChange={(v) => onChange?.('passport_given_names', v)} placeholder="ANDI BUDI" />
          <PField label="No. Passport" value={passportData.passport_number || ''} onChange={(v) => onChange?.('passport_number', v)} placeholder="A1234567" />
          <PField label="Nationality" value={passportData.nationality || ''} onChange={(v) => onChange?.('nationality', v)} placeholder="INDONESIA" />
          <PField label="Tgl Lahir" type="date" value={passportData.dob || ''} onChange={(v) => onChange?.('dob', v)} />
          <PField label="Expired" type="date" value={passportData.passport_expiry || ''} onChange={(v) => onChange?.('passport_expiry', v)} />
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Jenis Kelamin</span>
            <select
              value={passportData.sex || ''}
              onChange={(e) => onChange?.('sex', e.target.value)}
              className={miniInput}
            >
              <option value="">—</option>
              <option value="M">M (Laki-laki)</option>
              <option value="F">F (Perempuan)</option>
            </select>
          </label>
          <PField label="Issued at (Place)" value={passportData.passport_issued_at || ''} onChange={(v) => onChange?.('passport_issued_at', v)} placeholder="JAKARTA" />
          <PField label="Place of Birth" value={passportData.place_of_birth || ''} onChange={(v) => onChange?.('place_of_birth', v)} placeholder="SURABAYA" className="col-span-2" />
        </div>

        {/* Expiry warning */}
        {passportData.passport_expiry && (() => {
          const exp = new Date(passportData.passport_expiry);
          const today = new Date();
          const daysLeft = Math.ceil((exp - today) / 86400000);
          if (daysLeft < 180) {
            return (
              <div className={`p-2 rounded text-xs font-bold ${
                daysLeft < 0 ? 'bg-red-100 text-red-800 border border-red-300' :
                daysLeft < 90 ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {daysLeft < 0
                  ? `⚠ PASSPORT EXPIRED ${Math.abs(daysLeft)} hari yang lalu!`
                  : `⏰ Passport expired ${daysLeft} hari lagi (${daysLeft < 90 ? 'WARNING' : 'reminder'})`}
              </div>
            );
          }
          return null;
        })()}

        {rawAi && (
          <details className="text-[10px] text-slate-600">
            <summary className="cursor-pointer hover:text-slate-800">▼ Lihat raw AI response</summary>
            <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">{JSON.stringify(rawAi, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

function PField({ label, value, onChange, placeholder = '', type = 'text', className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">{label}</span>
      <input autoComplete="off"
        type={type}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={miniInput}
      />
    </label>
  );
}

const miniInput = 'w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none bg-white';
