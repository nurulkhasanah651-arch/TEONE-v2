'use client';

// Round 136 HOTFIX: ParticipantsList — DYNAMIC IMPORT PassportAI biar gak crash kalau missing
// Path: components/trips/ParticipantsList.jsx

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { addParticipant, updateParticipant, removeParticipant } from '@/lib/actions/participants';
import { fmtRupiah, fmtDate, calcAge, passportStatus } from '@/lib/utils/format';
import TransferPassengerButton from './TransferPassengerButton';
import RefundPassengerButton from './RefundPassengerButton';

// Dynamic import — gak crash kalau file belum ada
const PassportUploadAI = dynamic(
  () => import('@/components/cs/PassportUploadAI').catch(() => ({
    default: () => (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        ⚠ PassportUploadAI component belum di-upload. Cek file <code>components/cs/PassportUploadAI.jsx</code> dan <code>lib/actions/passport.js</code> sudah ada di GitHub.
      </div>
    ),
  })),
  { ssr: false, loading: () => <div className="p-3 text-xs text-slate-500">Loading passport tool...</div> }
);

const ROOM_TYPES = ['Single', 'Twin', 'Double', 'Triple', 'Family'];

export default function ParticipantsList({ tripId, participants = [], allTrips = [] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleAdd(formData) {
    setPending(true);
    setError('');
    const result = await addParticipant(tripId, formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setShowForm(false);
      setPending(false);
    }
  }

  async function handleUpdate(passengerId, customerId, formData) {
    setPending(true);
    setError('');
    const result = await updateParticipant(tripId, passengerId, customerId, formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setEditingId(null);
      setPending(false);
    }
  }

  async function handleRemove(passengerId, name) {
    if (!confirm(`Hapus ${name} dari trip ini?`)) return;
    setPending(true);
    const result = await removeParticipant(tripId, passengerId);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-brand-700">👥 Daftar Peserta</h2>
          <p className="text-xs text-slate-500 mt-0.5">{participants.length} peserta terdaftar</p>
        </div>
        {!showForm && !editingId && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg"
          >
            <span>+</span> Tambah Peserta
          </button>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium whitespace-pre-wrap">
          ⚠ {error}
        </div>
      )}

      {showForm && (
        <div className="p-5 bg-blue-50/30 border-b border-blue-100">
          <h3 className="font-bold text-brand-700 mb-3">Tambah Peserta Baru</h3>
          <ParticipantForm
            tripId={tripId}
            onSubmit={handleAdd}
            onCancel={() => { setShowForm(false); setError(''); }}
            pending={pending}
            submitLabel="Tambah Peserta"
          />
        </div>
      )}

      {participants.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-3xl mb-2">👥</p>
          <p className="text-sm">Belum ada peserta untuk trip ini.</p>
          <p className="mt-1 text-sm text-slate-500">Klik "Tambah Peserta" untuk mulai.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {participants.map((p, idx) => {
            const c = p?.customers || {};
            const first = c.first_name || '';
            const last = c.surname || '';
            const fullName = `${first} ${last}`.trim() || c.name || `Peserta #${idx + 1}`;
            const age = calcAge(c.birthday);
            const ppStatus = passportStatus(c.passport_expiry);
            const isEditing = editingId === p.id;

            if (isEditing) {
              return (
                <div key={p.id} className="p-5 bg-amber-50/30">
                  <h3 className="font-bold text-brand-700 mb-3">✎ Edit Peserta: {fullName}</h3>
                  <ParticipantForm
                    tripId={tripId}
                    initial={{
                      first_name: c.first_name || first,
                      last_name: c.surname || last,
                      city: c.city,
                      birthday: c.birthday,
                      gender: c.gender,
                      phone: c.phone || c.whatsapp,
                      email: c.email,
                      passport_no: c.passport_no || c.passport_number,
                      passport_issued_at: c.passport_issued_at,
                      passport_issued_date: c.passport_issued_date,
                      passport_expiry: c.passport_expiry,
                      passport_photo_url: c.passport_photo_url,
                      nationality: c.nationality,
                      room_type: p.room_type,
                      price_paid: p.price_paid,
                    }}
                    onSubmit={(fd) => handleUpdate(p.id, p.customer_id, fd)}
                    onCancel={() => { setEditingId(null); setError(''); }}
                    pending={pending}
                    submitLabel="Update Peserta"
                  />
                </div>
              );
            }

            return (
              <div key={p.id} className="px-5 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                      <p className="font-bold text-brand-700">{fullName}</p>
                      {p.room_type && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{p.room_type}</span>}
                      {age != null && <span className="text-[11px] text-slate-500">{age}th</span>}
                      {c.gender && <span className="text-[11px] text-slate-500">{c.gender === 'L' ? '♂' : '♀'}</span>}
                    </div>
                    <p className="text-xs text-slate-600">
                      {c.phone && <span className="mr-3">📞 {c.phone}</span>}
                      {c.email && <span className="mr-3">✉ {c.email}</span>}
                    </p>
                    {(c.passport_no || c.passport_expiry) && (
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        {c.passport_no && <span>📕 {c.passport_no}</span>}
                        {c.passport_issued_at && <span>Issued: {c.passport_issued_at}{c.passport_issued_date ? ` (${fmtDate(c.passport_issued_date)})` : ''}</span>}
                        {c.passport_expiry && (
                          <span>Exp: {fmtDate(c.passport_expiry)}</span>
                        )}
                        {ppStatus && (
                          <span className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                            ppStatus.color === 'red' ? 'bg-red-100 text-red-800' :
                            ppStatus.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                            'bg-green-100 text-green-800'
                          }`}>{ppStatus.label}</span>
                        )}
                        {c.passport_photo_url && (
                          <a href={c.passport_photo_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline font-semibold">
                            📎 Foto
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.price_paid > 0 && (
                      <span className="text-xs font-bold text-green-700">{fmtRupiah(p.price_paid)}</span>
                    )}
                    <button
                      onClick={() => setEditingId(p.id)}
                      disabled={pending}
                      className="text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold disabled:opacity-50"
                    >
                      ✎ Edit
                    </button>
                    <TransferPassengerButton
                      passengerId={p.id}
                      passengerName={fullName}
                      currentTripId={tripId}
                      allTrips={allTrips}
                    />
                    <RefundPassengerButton
                      passengerId={p.id}
                      passengerName={fullName}
                      tripId={tripId}
                    />
                    <button
                      onClick={() => handleRemove(p.id, fullName)}
                      disabled={pending}
                      className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold disabled:opacity-50"
                    >
                      🗑 Hapus
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ParticipantForm({ tripId, initial = {}, onSubmit, onCancel, pending, submitLabel = 'Simpan' }) {
  const [data, setData] = useState({
    first_name: initial.first_name || '',
    last_name: initial.last_name || '',
    city: initial.city || '',
    birthday: initial.birthday || '',
    gender: initial.gender || '',
    phone: initial.phone || '',
    email: initial.email || '',
    passport_no: initial.passport_no || '',
    passport_issued_at: initial.passport_issued_at || '',
    passport_issued_date: initial.passport_issued_date || '',
    passport_expiry: initial.passport_expiry || '',
    passport_photo_url: initial.passport_photo_url || '',
    nationality: initial.nationality || '',
    room_type: initial.room_type || '',
    price_paid: initial.price_paid || '',
  });

  function upd(key, val) {
    setData((d) => ({ ...d, [key]: val }));
  }

  function handleAIExtracted(updates) {
    if (!updates || typeof updates !== 'object') return;
    setData((d) => {
      const next = { ...d };
      if (updates.passport_given_names && !next.first_name) next.first_name = updates.passport_given_names;
      if (updates.passport_surname && !next.last_name) next.last_name = updates.passport_surname;
      if (updates.passport_number) next.passport_no = updates.passport_number;
      if (updates.dob) next.birthday = updates.dob;
      if (updates.passport_expiry) next.passport_expiry = updates.passport_expiry;
      if (updates.passport_issue_date) next.passport_issued_date = updates.passport_issue_date;
      if (updates.passport_issued_at) next.passport_issued_at = updates.passport_issued_at;
      if (updates.place_of_birth) next.city = updates.place_of_birth;
      if (updates.nationality) next.nationality = updates.nationality;
      if (updates.sex) next.gender = updates.sex === 'M' ? 'L' : updates.sex === 'F' ? 'P' : '';
      return next;
    });
  }

  const age = calcAge(data.birthday);
  const ppStatus = passportStatus(data.passport_expiry);

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="first_name" value={data.first_name} />
      <input type="hidden" name="last_name" value={data.last_name} />
      <input type="hidden" name="city" value={data.city} />
      <input type="hidden" name="birthday" value={data.birthday} />
      <input type="hidden" name="gender" value={data.gender} />
      <input type="hidden" name="phone" value={data.phone} />
      <input type="hidden" name="email" value={data.email} />
      <input type="hidden" name="passport_no" value={data.passport_no} />
      <input type="hidden" name="passport_issued_at" value={data.passport_issued_at} />
      <input type="hidden" name="passport_issued_date" value={data.passport_issued_date} />
      <input type="hidden" name="passport_expiry" value={data.passport_expiry} />
      <input type="hidden" name="passport_photo_url" value={data.passport_photo_url} />
      <input type="hidden" name="nationality" value={data.nationality} />
      <input type="hidden" name="room_type" value={data.room_type} />
      <input type="hidden" name="price_paid" value={data.price_paid} />

      <FormSection title="🛂 Upload Passport — AI Auto-Fill (opsional)">
        <PassportUploadAI
          tripId={tripId || 'master-trip'}
          paxIndex={0}
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

      <FormSection title="Data Pribadi">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nama Depan" required>
            <input value={data.first_name} onChange={(e) => upd('first_name', e.target.value)} required className={inputCls} />
          </Field>
          <Field label="Nama Belakang">
            <input value={data.last_name} onChange={(e) => upd('last_name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tempat Lahir">
            <input value={data.city} onChange={(e) => upd('city', e.target.value)} className={inputCls} placeholder="Jakarta, Surabaya, dll" />
          </Field>
          <Field label="Tanggal Lahir" hint={age != null ? `Umur: ${age} tahun` : ''}>
            <input type="date" value={data.birthday} onChange={(e) => upd('birthday', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Gender">
            <select value={data.gender} onChange={(e) => upd('gender', e.target.value)} className={inputCls}>
              <option value="">— Pilih —</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </Field>
          <Field label="No HP / WA">
            <input value={data.phone} onChange={(e) => upd('phone', e.target.value)} className={inputCls} placeholder="08xx..." />
          </Field>
          <Field label="Email" className="md:col-span-2">
            <input type="email" value={data.email} onChange={(e) => upd('email', e.target.value)} className={inputCls} placeholder="user@email.com" />
          </Field>
          <Field label="Nationality" className="md:col-span-2">
            <input value={data.nationality} onChange={(e) => upd('nationality', e.target.value)} className={inputCls} placeholder="INDONESIA" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Data Passport (manual / dari AI)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="No Passport">
            <input value={data.passport_no} onChange={(e) => upd('passport_no', e.target.value)} className={inputCls} placeholder="A1234567" />
          </Field>
          <Field label="Diterbitkan di">
            <input value={data.passport_issued_at} onChange={(e) => upd('passport_issued_at', e.target.value)} className={inputCls} placeholder="Jakarta, Imigrasi Kelas I, dll" />
          </Field>
          <Field label="Tanggal Issue">
            <input type="date" value={data.passport_issued_date} onChange={(e) => upd('passport_issued_date', e.target.value)} className={inputCls} />
          </Field>
          <Field
            label="Tanggal Expiry"
            hint={ppStatus ? `Status: ${ppStatus.label}` : ''}
            hintColor={ppStatus?.color}
          >
            <input type="date" value={data.passport_expiry} onChange={(e) => upd('passport_expiry', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Booking">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Tipe Kamar">
            <select value={data.room_type} onChange={(e) => upd('room_type', e.target.value)} className={inputCls}>
              <option value="">— Pilih —</option>
              {ROOM_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Harga Bayar (IDR)">
            <input type="number" value={data.price_paid} onChange={(e) => upd('price_paid', e.target.value)} min="0" className={inputCls} placeholder="50000000" />
          </Field>
        </div>
      </FormSection>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {pending ? 'Menyimpan...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
        >
          Batal
        </button>
      </div>
    </form>
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

function Field({ label, required, hint, hintColor, className = '', children }) {
  const hintCls =
    hintColor === 'red' ? 'text-red-700 font-semibold' :
    hintColor === 'amber' ? 'text-amber-700 font-semibold' :
    hintColor === 'green' ? 'text-green-700 font-semibold' :
    'text-slate-500';
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className={`text-[11px] block mt-1 ${hintCls}`}>{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
