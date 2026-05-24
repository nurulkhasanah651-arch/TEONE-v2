'use client';

// Round 100: ParticipantsList — family-aware
// - Tampilkan badge family (👨‍👩‍👧 Keluarga Andi) + crown 👑 untuk kepala
// - Auto-group peserta family bersama saat render

import { useState } from 'react';
import { addParticipant, updateParticipant, removeParticipant } from '@/lib/actions/participants';
import { fmtRupiah, fmtDate, calcAge, passportStatus } from '@/lib/utils/format';

const ROOM_TYPES = ['Single', 'Twin', 'Double', 'Triple', 'Family'];

export default function ParticipantsList({ tripId, participants = [], familyGroups = [] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Map family id → family info
  const familyMap = {};
  for (const fg of familyGroups) familyMap[fg.id] = fg;

  // Reorder: family members grouped together (head first), then ungrouped
  const familyMembers = {};
  const ungrouped = [];
  for (const p of participants) {
    if (p.family_group_id) {
      if (!familyMembers[p.family_group_id]) familyMembers[p.family_group_id] = [];
      familyMembers[p.family_group_id].push(p);
    } else {
      ungrouped.push(p);
    }
  }
  // Sort each family: head first
  for (const fid in familyMembers) {
    familyMembers[fid].sort((a, b) => (b.is_family_head ? 1 : 0) - (a.is_family_head ? 1 : 0));
  }
  // Flatten in order: each family block, then ungrouped
  const orderedParticipants = [];
  for (const fg of familyGroups) {
    if (familyMembers[fg.id]) {
      for (const m of familyMembers[fg.id]) orderedParticipants.push(m);
    }
  }
  for (const p of ungrouped) orderedParticipants.push(p);

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
    if (result?.error) alert(result.error);
    setPending(false);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-brand-700">Daftar Peserta</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {participants.length} peserta
            {familyGroups.length > 0 && ` · ${familyGroups.length} family`}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setError(''); }}
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>+</span> Tambah Peserta
          </button>
        )}
      </div>

      {/* Hint */}
      {familyGroups.length > 0 && (
        <p className="px-5 py-2 text-[11px] text-indigo-800 bg-indigo-50 border-b border-indigo-200">
          💡 Peserta keluarga di-group bareng. Untuk bikin/edit family → scroll ke section <b>👨‍👩‍👧‍👦 Family Groups</b>.
        </p>
      )}

      {/* Add form */}
      {showForm && (
        <div className="p-5 bg-brand-50/50 border-b border-slate-200">
          <h3 className="font-bold text-brand-700 mb-3">Tambah Peserta Baru</h3>
          <ParticipantForm
            onSubmit={handleAdd}
            onCancel={() => setShowForm(false)}
            pending={pending}
            submitLabel="Tambah Peserta"
          />
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      )}

      {/* List */}
      {orderedParticipants.length === 0 && !showForm ? (
        <div className="p-12 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-lg font-bold text-slate-700">Belum ada peserta</p>
          <p className="mt-1 text-sm text-slate-500">Klik "Tambah Peserta" untuk mulai.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {orderedParticipants.map((p, idx) => {
            const c = p.customers || {};
            const isEditing = editingId === p.id;
            const [first, ...rest] = (c.name || '').split(' ');
            const last = rest.join(' ');
            const age = calcAge(c.birthday);
            const ppStatus = passportStatus(c.passport_expiry);
            const fg = p.family_group_id ? familyMap[p.family_group_id] : null;
            const isHead = p.is_family_head;

            if (isEditing) {
              return (
                <div key={p.id} className="p-5 bg-amber-50/50">
                  <h3 className="font-bold text-brand-700 mb-3">Edit Peserta #{idx + 1}</h3>
                  <ParticipantForm
                    initial={{
                      first_name: c.first_name || first,
                      last_name: c.surname || last,
                      phone: c.phone,
                      email: c.email,
                      birthday: c.birthday,
                      city: c.city,
                      gender: c.gender,
                      passport_no: c.passport_no,
                      passport_issued_at: c.passport_issued_at,
                      passport_issued_date: c.passport_issued_date,
                      passport_expiry: c.passport_expiry,
                      room_type: p.room_type,
                      price_paid: p.price_paid,
                    }}
                    onSubmit={(fd) => handleUpdate(p.id, p.customer_id, fd)}
                    onCancel={() => setEditingId(null)}
                    pending={pending}
                    submitLabel="Update"
                  />
                  {error && <ErrorBox>{error}</ErrorBox>}
                </div>
              );
            }

            return (
              <div key={p.id} className={`px-5 py-3 hover:bg-slate-50 transition-colors ${fg ? 'border-l-4 border-indigo-300' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Name + chips */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                      {isHead && <span className="text-base" title="Kepala keluarga">👑</span>}
                      <p className="font-bold text-brand-700">{c.name || '—'}</p>
                      {fg && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          isHead ? 'bg-indigo-100 text-indigo-800' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          👨‍👩‍👧 {fg.name}{isHead ? ' (Kepala)' : ''}
                        </span>
                      )}
                      {age != null && <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{age} thn</span>}
                      {c.gender && <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">{c.gender}</span>}
                      {p.room_type && <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">{p.room_type}</span>}
                      {p.status && <span className="text-[11px] px-2 py-0.5 rounded bg-green-50 text-green-700 font-semibold">{p.status}</span>}
                    </div>

                    {/* Contact + birth */}
                    <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                      {c.phone && <span>📞 {c.phone}{isHead && fg && <span className="text-indigo-700 font-semibold ml-1">(no HP family)</span>}</span>}
                      {c.email && <span>✉ {c.email}</span>}
                      {(c.city || c.birthday) && (
                        <span>🎂 {c.city || '—'}{c.birthday ? `, ${fmtDate(c.birthday)}` : ''}</span>
                      )}
                    </div>

                    {/* Passport */}
                    {(c.passport_no || c.passport_expiry) && (
                      <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1 items-center">
                        {c.passport_no && <span>📕 {c.passport_no}</span>}
                        {c.passport_issued_at && <span>Issued: {c.passport_issued_at}{c.passport_issued_date ? ` (${fmtDate(c.passport_issued_date)})` : ''}</span>}
                        {c.passport_expiry && (
                          <span>Exp: {fmtDate(c.passport_expiry)}</span>
                        )}
                        {ppStatus && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ppStatus.color === 'red'   ? 'bg-red-100 text-red-700' :
                            ppStatus.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                                                          'bg-green-100 text-green-700'
                          }`}>
                            {ppStatus.label}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Price */}
                    {p.price_paid > 0 && (
                      <p className="mt-1 text-xs font-semibold text-green-700">{fmtRupiah(p.price_paid)}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setEditingId(p.id); setShowForm(false); setError(''); }}
                      disabled={pending}
                      className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold transition-colors"
                    >
                      ✎ Edit
                    </button>
                    <button
                      onClick={() => handleRemove(p.id, c.name)}
                      disabled={pending}
                      className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors"
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

function ParticipantForm({ initial = {}, onSubmit, onCancel, pending, submitLabel = 'Simpan' }) {
  const [birthday, setBirthday] = useState(initial.birthday || '');
  const [expiry, setExpiry] = useState(initial.passport_expiry || '');
  const age = calcAge(birthday);
  const ppStatus = passportStatus(expiry);

  return (
    <form action={onSubmit} className="space-y-4">
      {/* Personal info */}
      <FormSection title="Data Pribadi">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nama Depan" required>
            <input name="first_name" defaultValue={initial.first_name || ''} required className={inputCls} />
          </Field>
          <Field label="Nama Belakang">
            <input name="last_name" defaultValue={initial.last_name || ''} className={inputCls} />
          </Field>
          <Field label="Tempat Lahir">
            <input name="city" defaultValue={initial.city || ''} className={inputCls} placeholder="Jakarta, Surabaya, dll" />
          </Field>
          <Field label="Tanggal Lahir" hint={age != null ? `Umur: ${age} tahun` : ''}>
            <input type="date" name="birthday" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Gender">
            <select name="gender" defaultValue={initial.gender || ''} className={inputCls}>
              <option value="">— Pilih —</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </Field>
          <Field label="No HP / WA">
            <input name="phone" defaultValue={initial.phone || ''} className={inputCls} placeholder="08xx..." />
          </Field>
          <Field label="Email" className="md:col-span-2">
            <input type="email" name="email" defaultValue={initial.email || ''} className={inputCls} placeholder="user@email.com" />
          </Field>
        </div>
      </FormSection>

      {/* Passport */}
      <FormSection title="Data Passport">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="No Passport">
            <input name="passport_no" defaultValue={initial.passport_no || ''} className={inputCls} placeholder="A1234567" />
          </Field>
          <Field label="Diterbitkan di">
            <input name="passport_issued_at" defaultValue={initial.passport_issued_at || ''} className={inputCls} placeholder="Jakarta, Imigrasi Kelas I, dll" />
          </Field>
          <Field label="Tanggal Issue">
            <input type="date" name="passport_issued_date" defaultValue={initial.passport_issued_date || ''} className={inputCls} />
          </Field>
          <Field
            label="Tanggal Expiry"
            hint={ppStatus ? `Status: ${ppStatus.label}` : ''}
            hintColor={ppStatus?.color}
          >
            <input type="date" name="passport_expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </FormSection>

      {/* Room & Price */}
      <FormSection title="Booking">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Tipe Kamar">
            <select name="room_type" defaultValue={initial.room_type || ''} className={inputCls}>
              <option value="">— Pilih —</option>
              {ROOM_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Harga Bayar (IDR)">
            <input type="number" name="price_paid" defaultValue={initial.price_paid || ''} min="0" className={inputCls} placeholder="50000000" />
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

function ErrorBox({ children }) {
  return (
    <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
