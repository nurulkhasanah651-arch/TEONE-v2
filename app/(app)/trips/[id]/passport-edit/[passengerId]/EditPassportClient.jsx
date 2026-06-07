'use client';

// Round 139: Client form untuk edit passport peserta existing
// Path: app/(app)/trips/[id]/passport-edit/[passengerId]/EditPassportClient.jsx
// Pakai updateParticipant action — UPDATE peserta yang sudah ada, BUKAN bikin baru

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { updateParticipant } from '@/lib/actions/participants';

const PassportUploadAI = dynamic(
  () => import('@/components/cs/PassportUploadAI').catch(() => ({
    default: () => (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        ⚠ PassportUploadAI component belum ter-upload.
      </div>
    ),
  })),
  { ssr: false, loading: () => <div className="p-3 text-xs text-slate-500">Loading passport tool...</div> }
);

const ROOM_TYPES = ['Single', 'Twin', 'Double', 'Triple', 'Quad', 'Family'];

export default function EditPassportClient({ tripId, passengerId, customerId, initial, paxFullName }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [data, setData] = useState(initial || {});

  function upd(key, val) {
    setData((d) => ({ ...d, [key]: val }));
  }

  function handleAIExtracted(updates) {
    if (!updates || typeof updates !== 'object') return;
    setData((d) => {
      const next = { ...d };
      // Untuk EDIT: AI override field passport, tapi nama TIDAK diubah otomatis
      // (kecuali user manually edit di field Nama Depan/Belakang)
      if (updates.passport_number) next.passport_no = updates.passport_number;
      if (updates.dob) next.birthday = updates.dob;
      if (updates.passport_expiry) next.passport_expiry = updates.passport_expiry;
      if (updates.passport_issue_date) next.passport_issued_date = updates.passport_issue_date;
      if (updates.passport_issued_at) next.passport_issued_at = updates.passport_issued_at;
      if (updates.place_of_birth && !next.city) next.city = updates.place_of_birth;
      if (updates.nationality) next.nationality = updates.nationality;
      if (updates.sex) next.gender = updates.sex === 'M' ? 'L' : updates.sex === 'F' ? 'P' : next.gender;
      // Nama dari passport hanya update kalau field-nya kosong
      if (updates.passport_given_names && !next.first_name) next.first_name = updates.passport_given_names;
      if (updates.passport_surname && !next.last_name) next.last_name = updates.passport_surname;
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!data.first_name?.trim()) { setError('Nama Depan wajib'); return; }

    const formData = new FormData();
    for (const [k, v] of Object.entries(data)) {
      formData.append(k, v == null ? '' : String(v));
    }

    startTransition(async () => {
      const result = await updateParticipant(tripId, passengerId, customerId, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/trips/${tripId}`);
        }, 1500);
      }
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <Link href={`/trips/${tripId}`} className="text-sm text-brand-600 font-medium hover:underline">
          ← Kembali ke Trip Detail
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-brand-700 flex items-center gap-2">
          🛂 Update Passport: {paxFullName}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Upload foto passport untuk update data peserta ini. Data passport akan masuk ke peserta yang sama (bukan bikin peserta baru).
        </p>
      </div>

      {success ? (
        <div className="p-8 bg-green-50 border-2 border-green-300 rounded-xl text-center">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-xl font-bold text-green-800">Data passport berhasil diupdate!</p>
          <p className="text-sm text-green-700 mt-2">Mengarahkan kembali ke trip detail...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-4">
          {/* PASSPORT AI */}
          <FormSection title="🛂 Upload Passport — AI Auto-Fill">
            <PassportUploadAI
              tripId={tripId || 'master-trip'}
              paxIndex={passengerId || 0}
              passportData={{
                passport_photo_url: data.passport_photo_url,
                passport_number: data.passport_no,
                passport_surname: data.last_name,
                passport_given_names: data.first_name,
                nationality: data.nationality,
                dob: data.birthday,
                passport_expiry: data.passport_expiry,
                passport_issued_at: data.passport_issued_at,
                place_of_birth: data.city,
                sex: data.gender === 'L' ? 'M' : data.gender === 'P' ? 'F' : '',
              }}
              onChange={(key, val) => {
                const map = {
                  passport_number: 'passport_no',
                  passport_surname: 'last_name',
                  passport_given_names: 'first_name',
                  dob: 'birthday',
                  place_of_birth: 'city',
                };
                if (key === 'sex') upd('gender', val === 'M' ? 'L' : val === 'F' ? 'P' : '');
                else if (map[key]) upd(map[key], val);
                else upd(key, val);
              }}
              onExtracted={handleAIExtracted}
            />
          </FormSection>

          {/* Data Pribadi */}
          <FormSection title="Data Pribadi">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nama Depan" required>
                <input value={data.first_name || ''} onChange={(e) => upd('first_name', e.target.value)} required className={inputCls} />
              </Field>
              <Field label="Nama Belakang">
                <input value={data.last_name || ''} onChange={(e) => upd('last_name', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Tempat Lahir">
                <input value={data.city || ''} onChange={(e) => upd('city', e.target.value)} className={inputCls} placeholder="Jakarta, Surabaya, dll" />
              </Field>
              <Field label="Tanggal Lahir">
                <input type="date" value={data.birthday || ''} onChange={(e) => upd('birthday', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Gender">
                <select value={data.gender || ''} onChange={(e) => upd('gender', e.target.value)} className={inputCls}>
                  <option value="">— Pilih —</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </Field>
              <Field label="No HP / WA">
                <input value={data.phone || ''} onChange={(e) => upd('phone', e.target.value)} className={inputCls} placeholder="08xx..." />
              </Field>
              <Field label="Email" className="md:col-span-2">
                <input type="email" value={data.email || ''} onChange={(e) => upd('email', e.target.value)} className={inputCls} placeholder="user@email.com" />
              </Field>
              <Field label="Nationality" className="md:col-span-2">
                <input value={data.nationality || ''} onChange={(e) => upd('nationality', e.target.value)} className={inputCls} placeholder="INDONESIA" />
              </Field>
            </div>
          </FormSection>

          {/* Passport */}
          <FormSection title="Data Passport">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="No Passport">
                <input value={data.passport_no || ''} onChange={(e) => upd('passport_no', e.target.value)} className={inputCls} placeholder="A1234567" />
              </Field>
              <Field label="Diterbitkan di">
                <input value={data.passport_issued_at || ''} onChange={(e) => upd('passport_issued_at', e.target.value)} className={inputCls} placeholder="Jakarta, Imigrasi Kelas I, dll" />
              </Field>
              <Field label="Tanggal Issue">
                <input type="date" value={data.passport_issued_date || ''} onChange={(e) => upd('passport_issued_date', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Tanggal Expiry">
                <input type="date" value={data.passport_expiry || ''} onChange={(e) => upd('passport_expiry', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </FormSection>

          {/* Booking */}
          <FormSection title="Booking">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Tipe Kamar">
                <select value={(data.room_type || '').toLowerCase()} onChange={(e) => upd('room_type', e.target.value)} className={inputCls}>
                  <option value="">— Pilih —</option>
                  {ROOM_TYPES.map((r) => <option key={r} value={r.toLowerCase()}>{r}</option>)}
                </select>
              </Field>
              <Field label="Harga Bayar (IDR)">
                <input type="number" value={data.price_paid || ''} onChange={(e) => upd('price_paid', e.target.value)} min="0" className={inputCls} placeholder="50000000" />
              </Field>
            </div>
          </FormSection>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium whitespace-pre-wrap">
              ⚠ {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
            >
              {pending ? 'Menyimpan...' : '✓ Update Data Peserta'}
            </button>
            <Link
              href={`/trips/${tripId}`}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors flex items-center"
            >
              Batal
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white/60">
      <p className="text-[11px] font-bold text-brand-700 uppercase tracking-wider mb-2">{title}</p>
      {children}
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

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
