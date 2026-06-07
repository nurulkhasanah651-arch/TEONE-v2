'use client';

// R139 + R192d: ParticipantsList — FIX prop passing ke TransferPassengerButton + RefundPassengerButton
// Sebelumnya pass passengerId/tripId separately, tapi button expect FULL passenger object → crash
// Plus tetep nampilin family badge per peserta (R192b)
// Path: components/trips/ParticipantsList.jsx

import { useState } from 'react';
import Link from 'next/link';
import { addParticipant, updateParticipant, removeParticipant } from '@/lib/actions/participants';
import { fmtRupiah, fmtDate, calcAge, passportStatus } from '@/lib/utils/format';
import TransferPassengerButton from './TransferPassengerButton';
import RefundPassengerButton from './RefundPassengerButton';

const ROOM_TYPES = ['Single', 'Twin', 'Double', 'Triple', 'Quad', 'Family'];

export default function ParticipantsList(props) {
  const tripId = props?.tripId || '';
  const participants = Array.isArray(props?.participants) ? props.participants.filter(Boolean) : [];
  const allTrips = Array.isArray(props?.allTrips) ? props.allTrips.filter(Boolean) : [];
  const familyGroups = Array.isArray(props?.familyGroups) ? props.familyGroups.filter(Boolean) : [];

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const familyMap = {};
  for (const fg of familyGroups) {
    if (fg && fg.id) familyMap[fg.id] = fg;
  }

  async function handleAdd(formData) {
    setPending(true); setError('');
    const result = await addParticipant(tripId, formData);
    if (result?.error) { setError(result.error); setPending(false); }
    else { setShowForm(false); setPending(false); }
  }

  async function handleUpdate(passengerId, customerId, formData) {
    setPending(true); setError('');
    const result = await updateParticipant(tripId, passengerId, customerId, formData);
    if (result?.error) { setError(result.error); setPending(false); }
    else { setEditingId(null); setPending(false); }
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
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-brand-700">👥 Daftar Peserta</h2>
          <p className="text-xs text-slate-500 mt-0.5">{participants.length} peserta terdaftar</p>
        </div>
        {!showForm && !editingId && (
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/trips/${tripId}/passport-ai`}
              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-lg inline-flex items-center"
            >
              🛂 Tambah via Passport AI
            </Link>
            <button onClick={() => setShowForm(true)} className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg">
              <span>+</span> Tambah Peserta
            </button>
          </div>
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
          <ParticipantForm onSubmit={handleAdd} onCancel={() => { setShowForm(false); setError(''); }} pending={pending} submitLabel="Tambah Peserta" />
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
            if (!p || typeof p !== 'object') return null;

            const c = (p && p.customers) || {};
            const first = c.first_name || '';
            const last = c.surname || '';
            const fullName = `${first} ${last}`.trim() || c.name || `Peserta #${idx + 1}`;
            const age = c.birthday ? calcAge(c.birthday) : null;
            const ppStatus = c.passport_expiry ? passportStatus(c.passport_expiry) : null;
            const isEditing = editingId === p.id;

            let family = null;
            let isHead = false;
            try {
              if (p.family_group_id && familyMap[p.family_group_id]) {
                family = familyMap[p.family_group_id];
                isHead = !!p.is_family_head;
              }
            } catch {}

            if (isEditing) {
              return (
                <div key={p.id || idx} className="p-5 bg-amber-50/30">
                  <h3 className="font-bold text-brand-700 mb-3">✎ Edit Peserta: {fullName}</h3>
                  <ParticipantForm
                    initial={{
                      first_name: c.first_name || first, last_name: c.surname || last,
                      city: c.city, birthday: c.birthday, gender: c.gender,
                      phone: c.phone || c.whatsapp, email: c.email,
                      passport_no: c.passport_no, passport_issued_at: c.passport_issued_at,
                      passport_issued_date: c.passport_issued_date, passport_expiry: c.passport_expiry,
                      room_type: p.room_type, price_paid: p.price_paid,
                    }}
                    onSubmit={(fd) => handleUpdate(p.id, p.customer_id, fd)}
                    onCancel={() => { setEditingId(null); setError(''); }}
                    pending={pending} submitLabel="Update Peserta"
                  />
                </div>
              );
            }

            return (
              <div key={p.id || idx} className={`px-5 py-3 hover:bg-slate-50 ${family ? 'border-l-4 border-l-indigo-300' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                      <p className="font-bold text-brand-700">{fullName}</p>
                      {p.room_type && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{p.room_type}</span>}
                      {age != null && <span className="text-[11px] text-slate-500">{age}th</span>}
                      {c.gender && <span className="text-[11px] text-slate-500">{c.gender === 'L' ? '♂' : '♀'}</span>}
                      {family && (
                        <span className={`text-[11px] px-2 py-0.5 rounded font-bold flex items-center gap-1 ${
                          isHead ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {isHead ? '👑' : '👤'} {family.name || 'Family'}
                          {isHead && <span className="text-[9px] font-semibold opacity-80">KEPALA</span>}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      {c.phone && <span className="mr-3">📞 {c.phone}</span>}
                      {c.email && <span className="mr-3">✉ {c.email}</span>}
                    </p>
                    {(c.passport_no || c.passport_expiry) && (
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        {c.passport_no && <span>📕 {c.passport_no}</span>}
                        {c.passport_issued_at && <span>Issued: {c.passport_issued_at}{c.passport_issued_date ? ` (${fmtDate(c.passport_issued_date)})` : ''}</span>}
                        {c.passport_expiry && <span>Exp: {fmtDate(c.passport_expiry)}</span>}
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
                    {p.price_paid > 0 && <span className="text-xs font-bold text-green-700">{fmtRupiah(p.price_paid)}</span>}
                    <Link
                      href={`/trips/${tripId}/passport-edit/${p.id}`}
                      className="text-xs px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold inline-flex items-center"
                    >
                      🛂 Passport
                    </Link>
                    <button onClick={() => setEditingId(p.id)} disabled={pending} className="text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold disabled:opacity-50">✎ Edit</button>
                    {/* R192d: pass FULL passenger object (bukan separate props) — fix crash */}
                    <TransferPassengerButton passenger={p} allTrips={allTrips} />
                    <RefundPassengerButton passenger={p} />
                    <button onClick={() => handleRemove(p.id, fullName)} disabled={pending} className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold disabled:opacity-50">🗑 Hapus</button>
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

function ParticipantForm({ initial = {}, onSubmit, onCancel, pending, submitLabel = 'Simpan' }) {
  const [birthday, setBirthday] = useState(initial.birthday || '');
  const [expiry, setExpiry] = useState(initial.passport_expiry || '');
  const age = calcAge(birthday);
  const ppStatus = passportStatus(expiry);

  return (
    <form action={onSubmit} className="space-y-4">
      <FormSection title="Data Pribadi">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nama Depan" required><input name="first_name" defaultValue={initial.first_name || ''} required className={inputCls} /></Field>
          <Field label="Nama Belakang"><input name="last_name" defaultValue={initial.last_name || ''} className={inputCls} /></Field>
          <Field label="Tempat Lahir"><input name="city" defaultValue={initial.city || ''} className={inputCls} placeholder="Jakarta, Surabaya, dll" /></Field>
          <Field label="Tanggal Lahir" hint={age != null ? `Umur: ${age} tahun` : ''}>
            <input type="date" name="birthday" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Gender">
            <select name="gender" defaultValue={initial.gender || ''} className={inputCls}>
              <option value="">— Pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
            </select>
          </Field>
          <Field label="No HP / WA"><input name="phone" defaultValue={initial.phone || ''} className={inputCls} placeholder="08xx..." /></Field>
          <Field label="Email" className="md:col-span-2"><input type="email" name="email" defaultValue={initial.email || ''} className={inputCls} placeholder="user@email.com" /></Field>
        </div>
      </FormSection>

      <FormSection title="Data Passport">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="No Passport"><input name="passport_no" defaultValue={initial.passport_no || ''} className={inputCls} placeholder="A1234567" /></Field>
          <Field label="Diterbitkan di"><input name="passport_issued_at" defaultValue={initial.passport_issued_at || ''} className={inputCls} placeholder="Jakarta, Imigrasi Kelas I, dll" /></Field>
          <Field label="Tanggal Issue"><input type="date" name="passport_issued_date" defaultValue={initial.passport_issued_date || ''} className={inputCls} /></Field>
          <Field label="Tanggal Expiry" hint={ppStatus ? `Status: ${ppStatus.label}` : ''} hintColor={ppStatus?.color}>
            <input type="date" name="passport_expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Booking">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Tipe Kamar">
            <select name="room_type" defaultValue={(initial.room_type || '').toLowerCase()} className={inputCls}>
              <option value="">— Pilih —</option>{ROOM_TYPES.map((r) => <option key={r} value={r.toLowerCase()}>{r}</option>)}
            </select>
          </Field>
          <Field label="Harga Bayar (IDR)"><input type="number" name="price_paid" defaultValue={initial.price_paid || ''} min="0" className={inputCls} placeholder="50000000" /></Field>
        </div>
      </FormSection>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
          {pending ? 'Menyimpan...' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors">Batal</button>
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
  const hintCls = hintColor === 'red' ? 'text-red-700 font-semibold' : hintColor === 'amber' ? 'text-amber-700 font-semibold' : hintColor === 'green' ? 'text-green-700 font-semibold' : 'text-slate-500';
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      {children}
      {hint && <span className={`text-[11px] block mt-1 ${hintCls}`}>{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
